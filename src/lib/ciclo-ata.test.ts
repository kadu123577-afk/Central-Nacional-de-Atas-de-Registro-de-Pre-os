import { describe, expect, it } from "vitest";
import {
  ETAPAS_DO_CICLO,
  bloqueioDaAcao,
  desdeDaEtapa,
  etapaPorNumero,
  situacaoDoCiclo,
  situacaoDoPrazo,
  textoDoPrazo,
  type DadosDoCiclo,
} from "./ciclo-ata";
import { PERMISSOES } from "./permissoes";

const d = (iso: string) => new Date(`${iso}T15:00:00Z`);

function ata(extra: Partial<DadosDoCiclo> = {}): DadosDoCiclo {
  return {
    status: "PENDENTE",
    criadaEm: d("2026-11-02"),
    atualizadaEm: d("2026-11-02"),
    fornecedorAConfirmar: false,
    totalItens: 0,
    contratoEm: null,
    conformidadeEm: null,
    categoria: null,
    ...extra,
  };
}

describe("tabela das etapas", () => {
  it("são as atividades 1 a 5 e 7 (a 6, aprovar a ata, foi retirada), com os prazos do documento do workflow (dias úteis)", () => {
    expect(ETAPAS_DO_CICLO.map((e) => [e.numero, e.prazoDiasUteis])).toEqual([
      [1, 2],
      [2, 5],
      [3, 1],
      [4, 5],
      [5, 3],
      [7, 1],
    ]);
  });

  it("ninguém aprova ou rejeita ata: nenhuma etapa pede a permissão antiga de aprovação", () => {
    expect(ETAPAS_DO_CICLO.map((e) => e.permissao)).not.toContain("atas.aprovar");
    expect(etapaPorNumero(6)).toBeUndefined();
  });

  it("cada etapa aponta para uma permissão que existe", () => {
    const chaves = PERMISSOES.map((p) => p.chave);
    for (const e of ETAPAS_DO_CICLO) expect(chaves).toContain(e.permissao);
  });

  it("os caminhos levam à tela da ata certa", () => {
    expect(etapaPorNumero(3)?.caminho("a1")).toBe("/admin/atas/a1/itens");
    expect(etapaPorNumero(4)?.caminho("a1")).toBe("/admin/atas/a1/contrato");
    expect(etapaPorNumero(5)?.caminho("a1")).toBe("/admin/atas/a1/analise");
  });
});

describe("situacaoDoCiclo: a primeira etapa não cumprida é a atual", () => {
  it("ata recém-cadastrada com fornecedor confirmado espera os itens (etapa 3)", () => {
    const s = situacaoDoCiclo(ata());
    expect(s.etapaAtual).toBe(3);
    expect(s.etapas.filter((e) => e.feita).map((e) => e.numero)).toEqual([1, 2]);
    expect(s.concluida).toBe(false);
  });

  it("ata importada com fornecedor a confirmar espera a etapa 2", () => {
    expect(situacaoDoCiclo(ata({ fornecedorAConfirmar: true })).etapaAtual).toBe(2);
  });

  it("com itens, espera o contrato (4)", () => {
    expect(situacaoDoCiclo(ata({ totalItens: 5 })).etapaAtual).toBe(4);
  });

  it("com contrato, espera a conformidade (5)", () => {
    expect(situacaoDoCiclo(ata({ totalItens: 5, contratoEm: d("2026-11-05") })).etapaAtual).toBe(5);
  });

  it("conformidade concluída (ata liberada) sem categoria espera a publicação (7)", () => {
    const s = situacaoDoCiclo(ata({ status: "APROVADA", totalItens: 5, contratoEm: d("2026-11-05"), conformidadeEm: d("2026-11-06") }));
    expect(s.etapaAtual).toBe(7);
  });

  it("liberada com categoria está concluída: disponível para a equipe de vendas", () => {
    const s = situacaoDoCiclo(
      ata({ status: "APROVADA", totalItens: 5, contratoEm: d("2026-11-05"), conformidadeEm: d("2026-11-06"), categoria: "material-escritorio" }),
    );
    expect(s.etapaAtual).toBeNull();
    expect(s.concluida).toBe(true);
    expect(s.etapas.every((e) => e.feita)).toBe(true);
  });

  it("rejeitada sai do ciclo: não tem etapa atual e não conta como concluída", () => {
    const s = situacaoDoCiclo(ata({ status: "REJEITADA", totalItens: 5 }));
    expect(s.rejeitada).toBe(true);
    expect(s.etapaAtual).toBeNull();
    expect(s.concluida).toBe(false);
  });

  it("categoria vazia não conta", () => {
    const s = situacaoDoCiclo(ata({ status: "APROVADA", totalItens: 1, contratoEm: d("2026-11-05"), conformidadeEm: d("2026-11-06"), categoria: "" }));
    expect(s.etapaAtual).toBe(7);
  });

  it("só a etapa atual traz a data desde quando espera", () => {
    const s = situacaoDoCiclo(ata({ totalItens: 5, contratoEm: d("2026-11-05") }));
    const atual = s.etapas.find((e) => e.atual);
    expect(atual?.numero).toBe(5);
    expect(atual?.desde?.toISOString()).toBe(d("2026-11-05").toISOString());
    expect(s.etapas.filter((e) => e.desde !== null)).toHaveLength(1);
  });

  it("ata liberada antes desta regra, sem contrato: espera o contrato e NÃO tem 5 nem 7 como feitas", () => {
    const s = situacaoDoCiclo(ata({ status: "APROVADA", totalItens: 5, conformidadeEm: d("2026-11-06"), categoria: "material-escritorio" }));
    expect(s.etapaAtual).toBe(4);
    expect(s.etapas.filter((e) => e.feita).map((e) => e.numero)).toEqual([1, 2, 3]);
    expect(s.concluida).toBe(false);
  });

  it("nenhuma etapa depois de uma pendente conta como feita, em qualquer combinação", () => {
    const status = ["PENDENTE", "APROVADA"] as const;
    for (const st of status)
      for (const totalItens of [0, 3])
        for (const contratoEm of [null, d("2026-11-05")])
          for (const conformidadeEm of [null, d("2026-11-06")])
            for (const categoria of [null, "limpeza"]) {
              const s = situacaoDoCiclo(ata({ status: st, totalItens, contratoEm, conformidadeEm, categoria }));
              const primeiraPendente = s.etapas.findIndex((e) => !e.feita);
              if (primeiraPendente >= 0) {
                expect(s.etapas.slice(primeiraPendente).some((e) => e.feita)).toBe(false);
              }
            }
  });
});

describe("desdeDaEtapa", () => {
  const dados = ata({ contratoEm: d("2026-11-05"), conformidadeEm: d("2026-11-06"), atualizadaEm: d("2026-11-09") });

  it("usa a data em que a etapa anterior ficou pronta, quando o banco a guarda", () => {
    expect(desdeDaEtapa(5, dados)).toEqual(d("2026-11-05"));
    expect(desdeDaEtapa(7, dados)).toEqual(d("2026-11-06"));
  });

  it("nas demais, a data de cadastro da ata", () => {
    expect(desdeDaEtapa(2, dados)).toEqual(d("2026-11-02"));
    expect(desdeDaEtapa(3, dados)).toEqual(d("2026-11-02"));
    expect(desdeDaEtapa(4, dados)).toEqual(d("2026-11-02"));
  });

  it("sem a data da etapa anterior, cai para o cadastro", () => {
    expect(desdeDaEtapa(5, ata())).toEqual(d("2026-11-02"));
    expect(desdeDaEtapa(7, ata())).toEqual(d("2026-11-02"));
  });
});

describe("situacaoDoPrazo (dias úteis)", () => {
  const contrato = { prazoDiasUteis: 5 };

  it("em dia: faltam dias úteis", () => {
    // Desde segunda 9/11, 5 d.u. vence segunda 16/11; estando na terça 10/11 faltam 4.
    const p = situacaoDoPrazo(contrato, d("2026-11-09"), d("2026-11-10"));
    expect(p.vencimento.toISOString()).toBe(d("2026-11-16").toISOString());
    expect(p.tom).toBe("ok");
    expect(p.diasUteis).toBe(4);
    expect(textoDoPrazo(p)).toBe("4 dia(s) útil(eis) para vencer");
  });

  it("vence hoje", () => {
    const p = situacaoDoPrazo(contrato, d("2026-11-09"), d("2026-11-16"));
    expect(p.tom).toBe("hoje");
    expect(textoDoPrazo(p)).toBe("vence hoje");
  });

  it("atrasada: conta os dias úteis de atraso, sem contar fim de semana", () => {
    // Venceu segunda 16/11; na quarta 18/11 atrasou 2 dias úteis.
    const p = situacaoDoPrazo(contrato, d("2026-11-09"), d("2026-11-18"));
    expect(p.tom).toBe("atrasado");
    expect(p.diasUteis).toBe(-2);
    expect(textoDoPrazo(p)).toBe("atrasada 2 dia(s) útil(eis)");
  });

  it("os feriados extras da equipe contam", () => {
    const p = situacaoDoPrazo({ prazoDiasUteis: 1 }, d("2026-11-09"), d("2026-11-10"), new Set(["2026-11-10"]));
    // 10/11 é feriado extra: o prazo de 1 d.u. vence quarta 11/11, e na terça (feriado) ainda falta 1.
    expect(p.vencimento.toISOString()).toBe(d("2026-11-11").toISOString());
    expect(p.diasUteis).toBe(1);
  });
});

describe("bloqueioDaAcao: cada etapa só abre depois da anterior", () => {
  const COMPLETA_ATE_ITENS = { totalItens: 3 };
  const COM_CONTRATO = { totalItens: 3, contratoEm: d("2026-11-05") };
  const LIBERADA = { ...COM_CONTRATO, conformidadeEm: d("2026-11-06"), status: "APROVADA" as const };

  it("o contrato (4) abre com a empresa fechada (2) e os itens cadastrados (3)", () => {
    expect(bloqueioDaAcao("contrato", ata(COMPLETA_ATE_ITENS))).toBeNull();
  });

  it("o contrato espera os itens", () => {
    const b = bloqueioDaAcao("contrato", ata());
    expect(b?.etapa.numero).toBe(3);
    expect(b?.mensagem).toContain("falta a etapa 3 (Cadastrar itens e saldos");
  });

  it("o contrato espera a empresa prestadora, que vem antes dos itens", () => {
    expect(bloqueioDaAcao("contrato", ata({ fornecedorAConfirmar: true, totalItens: 3 }))?.etapa.numero).toBe(2);
  });

  it("sem contrato não dá para concluir a conformidade nem publicar (o caso do 3 para o 5 ou 7)", () => {
    for (const acao of ["conformidade", "publicar"] as const) {
      const b = bloqueioDaAcao(acao, ata(COMPLETA_ATE_ITENS));
      expect(b?.etapa.numero, acao).toBe(4);
      expect(b?.mensagem, acao).toContain("falta a etapa 4 (Contrato de intermediação");
    }
  });

  it("com o contrato, a conformidade abre; publicar ainda espera a conformidade", () => {
    expect(bloqueioDaAcao("conformidade", ata(COM_CONTRATO))).toBeNull();
    expect(bloqueioDaAcao("publicar", ata(COM_CONTRATO))?.etapa.numero).toBe(5);
  });

  it("depois de a conformidade ser concluída (ata liberada), publicar abre", () => {
    expect(bloqueioDaAcao("publicar", ata(LIBERADA))).toBeNull();
  });

  it("a mensagem diz quem faz a etapa que falta", () => {
    expect(bloqueioDaAcao("conformidade", ata(COMPLETA_ATE_ITENS))?.mensagem).toContain("a cargo de jurídico");
  });

  it("ata rejeitada não trava a regra por ter sido rejeitada: vale o que falta de fato", () => {
    expect(bloqueioDaAcao("conformidade", ata({ status: "REJEITADA", totalItens: 3, contratoEm: d("2026-11-05") }))).toBeNull();
    expect(bloqueioDaAcao("conformidade", ata({ status: "REJEITADA", totalItens: 3 }))?.etapa.numero).toBe(4);
  });
});
