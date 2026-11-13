import { describe, expect, it } from "vitest";
import { PERMISSOES } from "./permissoes";
import {
  ETAPAS_DA_ADESAO,
  caminhoDaEtapaDaAdesao,
  etapaDaAdesaoPorNumero,
  etapaDaNegociacao,
  posicaoDaAdesaoRegistrada,
  situacaoDoPrazoDaAdesao,
  vencimentoDaEtapaDaAdesao,
} from "./ciclo-adesao";

const d = (iso: string) => new Date(`${iso}T15:00:00Z`);

describe("tabela das etapas 8 a 17", () => {
  it("são as atividades 8 a 17, com os prazos do documento do workflow (dias úteis; 17 é contínuo)", () => {
    expect(ETAPAS_DA_ADESAO.map((e) => [e.numero, e.prazoDiasUteis])).toEqual([
      [8, 2],
      [9, 1],
      [10, 10],
      [11, 15],
      [12, 2],
      [13, 1],
      [14, 10],
      [15, 30],
      [16, 5],
      [17, null],
    ]);
  });

  it("cada permissão citada existe; quem faz fora do painel (vendas, órgão) não tem permissão", () => {
    const chaves = PERMISSOES.map((p) => p.chave) as string[];
    for (const e of ETAPAS_DA_ADESAO) {
      if (e.permissao) expect(chaves).toContain(e.permissao);
    }
    expect(etapaDaAdesaoPorNumero(10)?.permissao).toBeNull();
    expect(etapaDaAdesaoPorNumero(17)?.permissao).toBeNull();
    expect(etapaDaAdesaoPorNumero(12)?.permissao).toBe("adesao.declarar");
    expect(etapaDaAdesaoPorNumero(13)?.permissao).toBe("adesao.registrar");
  });

  it("as etapas do painel levam à tela certa", () => {
    expect(caminhoDaEtapaDaAdesao(9, null)).toBe("/admin/negociacoes");
    expect(caminhoDaEtapaDaAdesao(11, "op1")).toBe("/admin/adesoes/op1");
    expect(caminhoDaEtapaDaAdesao(12, "op1")).toBe("/admin/adesoes/op1");
    expect(caminhoDaEtapaDaAdesao(13, "op1")).toBe("/admin/adesoes/op1");
    expect(caminhoDaEtapaDaAdesao(14, "op1")).toBe("/admin/contratos-detectados");
    expect(caminhoDaEtapaDaAdesao(16, "op1")).toBe("/admin/recebiveis-vendedores");
    expect(caminhoDaEtapaDaAdesao(10, "op1")).toBe("/admin/pipeline");
  });
});

describe("etapaDaNegociacao (10 a 13)", () => {
  const base = { instrucaoIniciada: false, instrucaoCompleta: false, declaradaEm: null };

  it("sem nada marcado, está negociando (10)", () => {
    expect(etapaDaNegociacao(base)).toBe(10);
  });

  it("começou a marcar a instrução: instruindo (11)", () => {
    expect(etapaDaNegociacao({ ...base, instrucaoIniciada: true })).toBe(11);
  });

  it("instrução completa, sem declaração: espera o jurídico (12)", () => {
    expect(etapaDaNegociacao({ ...base, instrucaoIniciada: true, instrucaoCompleta: true })).toBe(12);
  });

  it("declarada: espera o registro do estagiário (13), mesmo que a instrução tenha mudado depois", () => {
    expect(etapaDaNegociacao({ ...base, declaradaEm: d("2026-11-10") })).toBe(13);
    expect(etapaDaNegociacao({ instrucaoIniciada: true, instrucaoCompleta: false, declaradaEm: d("2026-11-10") })).toBe(13);
  });
});

describe("posicaoDaAdesaoRegistrada (14 a 17)", () => {
  const registradaEm = d("2026-11-02");

  it("recém-registrada: espera o contrato ser confirmado (14), contando do registro", () => {
    expect(posicaoDaAdesaoRegistrada({ registradaEm, contratoConfirmadoEm: null, liquidacoes: [] })).toEqual({ etapa: 14, desde: registradaEm });
  });

  it("contrato confirmado, sem liquidação: entrega e liquidação (15), contando da confirmação", () => {
    const confirmado = d("2026-11-09");
    expect(posicaoDaAdesaoRegistrada({ registradaEm, contratoConfirmadoEm: confirmado, liquidacoes: [] })).toEqual({ etapa: 15, desde: confirmado });
  });

  it("com liquidação por receber: cobrar a comissão (16), contando da liquidação mais antiga", () => {
    const r = posicaoDaAdesaoRegistrada({
      registradaEm,
      contratoConfirmadoEm: d("2026-11-09"),
      liquidacoes: [
        { dataLiquidacao: d("2026-12-10"), statusCobranca: "pendente" },
        { dataLiquidacao: d("2026-12-01"), statusCobranca: "cobrada" },
        { dataLiquidacao: d("2026-11-20"), statusCobranca: "recebida" },
      ],
    });
    expect(r).toEqual({ etapa: 16, desde: d("2026-12-01") });
  });

  it("tudo recebido: pós-venda (17), sem prazo", () => {
    const r = posicaoDaAdesaoRegistrada({
      registradaEm,
      contratoConfirmadoEm: d("2026-11-09"),
      liquidacoes: [{ dataLiquidacao: d("2026-11-20"), statusCobranca: "recebida" }],
    });
    expect(r).toEqual({ etapa: 17, desde: null });
  });

  it("liquidação lançada vale mesmo sem o contrato confirmado no PNCP (o lançamento manual é a verdade)", () => {
    const r = posicaoDaAdesaoRegistrada({
      registradaEm,
      contratoConfirmadoEm: null,
      liquidacoes: [{ dataLiquidacao: d("2026-11-20"), statusCobranca: "pendente" }],
    });
    expect(r.etapa).toBe(16);
  });
});

describe("prazo em dias úteis", () => {
  it("o vencimento soma os dias úteis da etapa a partir de quando ela espera", () => {
    // Declarada na segunda 9/11: o registro (13) tem 1 dia útil, então vence terça 10/11.
    expect(vencimentoDaEtapaDaAdesao(13, d("2026-11-09"))?.toISOString()).toBe(d("2026-11-10").toISOString());
    // Instruir (11) tem 15 dias úteis: de 9/11 a 1/12 (20/11 é feriado).
    expect(vencimentoDaEtapaDaAdesao(11, d("2026-11-09"))?.toISOString()).toBe(d("2026-12-01").toISOString());
  });

  it("o pós-venda não tem vencimento", () => {
    expect(vencimentoDaEtapaDaAdesao(17, d("2026-11-09"))).toBeNull();
    expect(situacaoDoPrazoDaAdesao(null, d("2026-11-10"))).toBeNull();
  });

  it("diz se está em dia, vence hoje ou atrasou, em dias úteis", () => {
    const venc = d("2026-11-10");
    expect(situacaoDoPrazoDaAdesao(venc, d("2026-11-09"))).toMatchObject({ tom: "ok", diasUteis: 1 });
    expect(situacaoDoPrazoDaAdesao(venc, d("2026-11-10"))).toMatchObject({ tom: "hoje", diasUteis: 0 });
    expect(situacaoDoPrazoDaAdesao(venc, d("2026-11-12"))).toMatchObject({ tom: "atrasado", diasUteis: -2 });
  });
});
