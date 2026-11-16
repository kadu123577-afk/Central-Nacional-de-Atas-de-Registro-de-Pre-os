import { describe, expect, it } from "vitest";
import { lerContratoColetado, resumirConsumo, type ContratoColetado } from "./consumo-coleta";

const HOJE = new Date("2026-11-16T15:00:00Z");
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

function bruto(extra: Record<string, unknown> = {}) {
  return {
    numeroControlePNCP: "01613940000119-2-000196/2025",
    objetoContrato: "Aquisição de material de limpeza e higiene",
    valorGlobal: 10_000,
    dataAssinatura: "2026-03-10",
    dataVigenciaFim: "2027-03-10",
    niFornecedor: "11111111000191",
    frutoAdesao: null,
    receita: false,
    orgaoEntidade: { cnpj: "01613940000119" },
    ...extra,
  };
}

function contrato(extra: Partial<ContratoColetado> = {}): ContratoColetado {
  return {
    id: "c1",
    objeto: "Aquisição de material de limpeza e higiene",
    valorGlobal: 10_000,
    dataAssinatura: dia("2026-03-10"),
    vigenciaFim: dia("2027-03-10"),
    fornecedor: "11111111000191",
    orgao: "01613940000119",
    frutoAdesao: false,
    ...extra,
  };
}

describe("lerContratoColetado", () => {
  it("lê um contrato do PNCP", () => {
    expect(lerContratoColetado(bruto())).toEqual({
      id: "01613940000119-2-000196/2025",
      objeto: "Aquisição de material de limpeza e higiene",
      valorGlobal: 10_000,
      dataAssinatura: dia("2026-03-10"),
      vigenciaFim: dia("2027-03-10"),
      fornecedor: "11111111000191",
      orgao: "01613940000119",
      frutoAdesao: false,
    });
  });

  it("sem valor global usa o valor inicial; fruto de adesão só com true de verdade", () => {
    expect(lerContratoColetado(bruto({ valorGlobal: null, valorInicial: 7_500 }))?.valorGlobal).toBe(7_500);
    expect(lerContratoColetado(bruto({ frutoAdesao: true }))?.frutoAdesao).toBe(true);
    expect(lerContratoColetado(bruto({ frutoAdesao: "sim" }))?.frutoAdesao).toBe(false);
  });

  it.each([
    ["contrato de receita (o órgão recebe, não compra)", { receita: true }],
    ["sem objeto", { objetoContrato: "  " }],
    ["valor zero", { valorGlobal: 0, valorInicial: 0 }],
    ["sem data de assinatura", { dataAssinatura: null }],
    ["data inválida", { dataAssinatura: "ontem" }],
    ["sem número de controle", { numeroControlePNCP: "" }],
  ])("fica de fora: %s", (_nome, extra) => {
    expect(lerContratoColetado(bruto(extra))).toBeNull();
  });

  it("vigência ausente ou inválida vira null, sem derrubar o contrato", () => {
    expect(lerContratoColetado(bruto({ dataVigenciaFim: null }))?.vigenciaFim).toBeNull();
    expect(lerContratoColetado(bruto({ dataVigenciaFim: "xx" }))?.vigenciaFim).toBeNull();
  });

  it("entrada que não é objeto vira null, sem lançar", () => {
    for (const v of [null, undefined, "x", 3, []]) expect(lerContratoColetado(v)).toBeNull();
  });
});

describe("resumirConsumo", () => {
  it("resume por categoria: total, contratos, primeira e última, vigência, fornecedores, órgãos e adesão", () => {
    const [r] = resumirConsumo(
      [
        contrato({ id: "a", valorGlobal: 10_000, dataAssinatura: dia("2025-02-01"), vigenciaFim: dia("2026-02-01"), fornecedor: "F1", orgao: "O1" }),
        contrato({ id: "b", valorGlobal: 25_000, dataAssinatura: dia("2026-05-20"), vigenciaFim: dia("2027-05-20"), fornecedor: "F2", orgao: "O2", frutoAdesao: true }),
        contrato({ id: "c", valorGlobal: 5_000, dataAssinatura: dia("2026-01-10"), vigenciaFim: null, fornecedor: "F1", orgao: "O1" }),
      ],
      HOJE,
    );
    expect(r).toMatchObject({
      categoria: "limpeza",
      valorTotalNaJanela: 40_000,
      janelaMeses: 36,
      quantidadeContratos: 3,
      primeiraContratacao: dia("2025-02-01"),
      ultimaContratacao: dia("2026-05-20"),
      valorUltimaContratacao: 25_000,
      vigenciaFimMaisRecente: dia("2027-05-20"),
      fornecedoresDistintos: 2,
      orgaosDistintos: 2,
      contratosPorAdesao: 1,
    });
  });

  it("o mesmo contrato nas duas fontes da coleta conta uma vez só", () => {
    const [r] = resumirConsumo([contrato({ id: "x" }), contrato({ id: "x" })], HOJE);
    expect(r.quantidadeContratos).toBe(1);
    expect(r.valorTotalNaJanela).toBe(10_000);
  });

  it("só entra o que foi assinado dentro da janela e até hoje", () => {
    const r = resumirConsumo(
      [
        contrato({ id: "velho", dataAssinatura: dia("2023-01-01") }), // fora (mais de 36 meses)
        contrato({ id: "futuro", dataAssinatura: dia("2026-12-01") }), // ainda não assinado
        contrato({ id: "dentro", dataAssinatura: dia("2024-01-01") }),
      ],
      HOJE,
    );
    expect(r[0].quantidadeContratos).toBe(1);
    expect(resumirConsumo([contrato({ dataAssinatura: dia("2025-05-01") })], HOJE, 12)).toEqual([]);
  });

  it("objeto sem categoria conhecida fica de fora", () => {
    expect(resumirConsumo([contrato({ objeto: "Zzzz qwerty sem sentido" })], HOJE)).toEqual([]);
  });

  it("sem vigência em nenhum contrato, a vigência mais recente fica nula", () => {
    const [r] = resumirConsumo([contrato({ vigenciaFim: null })], HOJE);
    expect(r.vigenciaFimMaisRecente).toBeNull();
  });

  it("ordena as categorias das que mais gastaram", () => {
    const r = resumirConsumo(
      [
        contrato({ id: "l", valorGlobal: 1_000 }),
        contrato({ id: "c", objeto: "Fornecimento de combustível automotivo gasolina e diesel", valorGlobal: 90_000 }),
      ],
      HOJE,
    );
    expect(r.map((x) => x.categoria)).toEqual(["combustivel", "limpeza"]);
  });

  it("lista vazia, resumo vazio", () => {
    expect(resumirConsumo([], HOJE)).toEqual([]);
  });
});
