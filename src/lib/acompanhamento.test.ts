import { describe, expect, it } from "vitest";
import {
  classificarVinculo,
  cobrancaLiberada,
  detectarTermos,
  soDigitos,
  type ContratoParaAcompanhar,
  type RedeParaAcompanhar,
} from "./acompanhamento";

const CONTROLE_ATA = "01616520000196-1-000078/2024-000001";

function rede(sobrescrever: Partial<RedeParaAcompanhar> = {}): RedeParaAcompanhar {
  return {
    atasPorControle: new Map([[CONTROLE_ATA, { ataId: "ata-1" }]]),
    parceiros: new Set(["11222333000181"]),
    oportunidades: [
      {
        id: "op-1",
        ataId: "ata-1",
        fornecedorCnpj: "11222333000181",
        entidadeAlvoId: "mun-1",
        ativa: true,
        criadoEm: new Date("2026-09-01T12:00:00Z"),
      },
    ],
    ...sobrescrever,
  };
}

const contrato = (c: Partial<ContratoParaAcompanhar> = {}): ContratoParaAcompanhar => ({
  numeroControlePNCP: "01616520000196-2-000046/2026",
  niFornecedor: "11.222.333/0001-81",
  dataAssinatura: "2026-10-01",
  ...c,
});

describe("classificarVinculo", () => {
  it("nível certo quando o contrato cita a ata da rede, com a oportunidade do município", () => {
    const v = classificarVinculo(contrato({ numeroControlePncpAta: CONTROLE_ATA }), "mun-1", rede());
    expect(v).toMatchObject({ nivel: "certo", ataId: "ata-1", oportunidadeId: "op-1" });
  });

  it("nível certo vale mesmo sem negociação aberta, e avisa no motivo", () => {
    const v = classificarVinculo(contrato({ numeroControlePncpAta: CONTROLE_ATA }), "mun-2", rede());
    expect(v?.nivel).toBe("certo");
    expect(v?.oportunidadeId).toBeNull();
    expect(v?.motivo).toContain("não tinha negociação");
  });

  it("nível forte: fornecedor parceiro com negociação ativa, assinado depois de abrir", () => {
    const v = classificarVinculo(contrato(), "mun-1", rede());
    expect(v).toMatchObject({ nivel: "forte", oportunidadeId: "op-1", ataId: "ata-1" });
  });

  it("não é forte se o contrato foi assinado antes da negociação abrir", () => {
    const v = classificarVinculo(contrato({ dataAssinatura: "2026-08-15" }), "mun-1", rede());
    expect(v).toBeNull();
  });

  it("não é forte se a negociação já não está ativa", () => {
    const r = rede({
      oportunidades: [{ ...rede().oportunidades[0], ativa: false }],
    });
    expect(classificarVinculo(contrato(), "mun-1", r)).toBeNull();
  });

  it("não é forte se a negociação é de outro fornecedor", () => {
    const r = rede({
      oportunidades: [{ ...rede().oportunidades[0], fornecedorCnpj: "99888777000166" }],
    });
    expect(classificarVinculo(contrato(), "mun-1", r)).toBeNull();
  });

  it("desvio: parceiro, fruto de adesão, município sem negociação desse fornecedor", () => {
    const v = classificarVinculo(contrato({ frutoAdesao: true }), "mun-2", rede());
    expect(v).toMatchObject({ nivel: "desvio", ataId: null, oportunidadeId: null });
  });

  it("desvio também vale quando o contrato cita uma ata de fora da rede", () => {
    const v = classificarVinculo(contrato({ numeroControlePncpAta: "outra-ata" }), "mun-2", rede());
    expect(v?.nivel).toBe("desvio");
  });

  it("contrato de parceiro comum, sem adesão nem ata, não gera vínculo", () => {
    expect(classificarVinculo(contrato(), "mun-2", rede())).toBeNull();
  });

  it("fornecedor que não é parceiro não gera vínculo, mesmo fruto de adesão", () => {
    const v = classificarVinculo(contrato({ niFornecedor: "55555555000155", frutoAdesao: true }), "mun-2", rede());
    expect(v).toBeNull();
  });

  it("negociação existente (ainda que inativa) do fornecedor no município afasta o desvio", () => {
    const r = rede({ oportunidades: [{ ...rede().oportunidades[0], ativa: false }] });
    expect(classificarVinculo(contrato({ frutoAdesao: true }), "mun-1", r)).toBeNull();
  });
});

describe("detectarTermos", () => {
  const antes = { valorGlobal: 100_000, vigenciaFim: new Date("2026-12-31T00:00:00Z") };

  it("aditivo de valor quando o valor global sobe", () => {
    const t = detectarTermos("c-1", antes, { ...antes, valorGlobal: 125_000.5 });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ tipo: "aditivo_valor", valorAcrescido: 25_000.5 });
  });

  it("aditivo de prazo quando a vigência vai mais longe", () => {
    const t = detectarTermos("c-1", antes, { ...antes, vigenciaFim: new Date("2027-06-30T00:00:00Z") });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ tipo: "aditivo_prazo" });
    expect(t[0].novaVigenciaFim?.toISOString().slice(0, 10)).toBe("2027-06-30");
  });

  it("valor e prazo ao mesmo tempo geram dois termos", () => {
    const t = detectarTermos("c-1", antes, { valorGlobal: 150_000, vigenciaFim: new Date("2027-12-31T00:00:00Z") });
    expect(t.map((x) => x.tipo).sort()).toEqual(["aditivo_prazo", "aditivo_valor"]);
  });

  it("redução de valor ou de prazo não gera termo", () => {
    expect(detectarTermos("c-1", antes, { valorGlobal: 90_000, vigenciaFim: new Date("2026-06-30T00:00:00Z") })).toEqual([]);
  });

  it("sem mudança, nada; e a chave é estável para não duplicar", () => {
    expect(detectarTermos("c-1", antes, antes)).toEqual([]);
    const a = detectarTermos("c-1", antes, { ...antes, valorGlobal: 120_000 });
    const b = detectarTermos("c-1", antes, { ...antes, valorGlobal: 120_000 });
    expect(a[0].chave).toBe(b[0].chave);
  });

  it("ignora quando falta o valor anterior (primeira vez que o contrato é visto)", () => {
    expect(detectarTermos("c-1", { valorGlobal: null, vigenciaFim: null }, { valorGlobal: 5, vigenciaFim: new Date() })).toEqual([]);
  });
});

describe("cobrancaLiberada e soDigitos", () => {
  it("só libera a cobrança com a data de pagamento do ente", () => {
    expect(cobrancaLiberada({ dataPagamentoEnte: null })).toBe(false);
    expect(cobrancaLiberada({ dataPagamentoEnte: undefined })).toBe(false);
    expect(cobrancaLiberada({ dataPagamentoEnte: new Date("2026-10-10") })).toBe(true);
  });

  it("remove pontuação do CNPJ", () => {
    expect(soDigitos("11.222.333/0001-81")).toBe("11222333000181");
    expect(soDigitos(null)).toBe("");
  });
});
