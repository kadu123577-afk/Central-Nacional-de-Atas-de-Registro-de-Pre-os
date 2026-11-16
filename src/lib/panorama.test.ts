import { describe, expect, it } from "vitest";
import { ROTULO_NIVEL, consumoAnual, nivelDosPontos, pontuarPar, type AtaParaMatch, type ConsumoParaMatch } from "./panorama";

// "Hoje" é 16/11/2026.
const HOJE = new Date("2026-11-16T15:00:00Z");
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

const ATA: AtaParaMatch = { id: "a1", numero: "12/2026", objeto: "Material de limpeza", categoria: "limpeza", esferaGerenciador: "estadual" };

function consumo(extra: Partial<ConsumoParaMatch> = {}): ConsumoParaMatch {
  return {
    categoria: "limpeza",
    valorUltimaContratacao: 50_000,
    quantidadeContratos: 2,
    ultimaContratacao: dia("2026-08-01"),
    valorTotalNaJanela: null,
    janelaMeses: null,
    vigenciaFimMaisRecente: null,
    contratosPorAdesao: null,
    fornecedoresDistintos: null,
    ...extra,
  };
}

describe("consumoAnual", () => {
  it("com o total da janela, divide pelos anos da janela", () => {
    expect(consumoAnual(consumo({ valorTotalNaJanela: 300_000, janelaMeses: 36 }))).toEqual({ valor: 100_000, estimado: false });
  });

  it("sem o total, estima pelo valor da última contratação vezes os contratos, em 3 anos", () => {
    expect(consumoAnual(consumo({ valorUltimaContratacao: 60_000, quantidadeContratos: 3 }))).toEqual({ valor: 60_000, estimado: true });
    expect(consumoAnual(consumo({ valorUltimaContratacao: 90_000, quantidadeContratos: 0 }))).toEqual({ valor: 30_000, estimado: true });
  });
});

describe("pontuarPar", () => {
  it("só há par quando a categoria é a mesma e a ata tem categoria", () => {
    expect(pontuarPar(consumo({ categoria: "combustivel" }), ATA, HOJE)).toBeNull();
    expect(pontuarPar(consumo(), { ...ATA, categoria: null }, HOJE)).toBeNull();
  });

  it("município que já consome a categoria começa com a base, o volume e a recorrência", () => {
    // 2 contratos de 50.000 em 3 anos → ~33.333/ano (faixa 30.000) = 35 + 9 + 3; sem vigência e contratou há 3 meses.
    const p = pontuarPar(consumo(), ATA, HOJE);
    expect(p?.pontos).toBe(47);
    expect(p?.nivel).toBe("possivel");
    expect(p?.motivos[0]).toContain("Já contrata esta categoria");
    expect(p?.motivos[0]).toContain("(estimativa)");
  });

  it("contrato que vence nos próximos 180 dias é o melhor momento", () => {
    const p = pontuarPar(consumo({ vigenciaFimMaisRecente: dia("2026-12-16") }), ATA, HOJE);
    expect(p?.pontos).toBe(47 + 20);
    expect(p?.motivos.join(" ")).toContain("vence em 30 dias");
  });

  it("contrato vencido há pouco também conta; sem contrato há mais de um ano, menos", () => {
    expect(pontuarPar(consumo({ vigenciaFimMaisRecente: dia("2026-10-17") }), ATA, HOJE)?.pontos).toBe(47 + 14);
    expect(pontuarPar(consumo({ vigenciaFimMaisRecente: dia("2025-03-01"), ultimaContratacao: dia("2025-01-01") }), ATA, HOJE)?.pontos).toBe(47 + 6);
    // contrato ainda longe de vencer: nada a mais
    expect(pontuarPar(consumo({ vigenciaFimMaisRecente: dia("2027-09-01") }), ATA, HOJE)?.pontos).toBe(47);
  });

  it("sem data de vigência, a última contratação de mais de um ano pesa um pouco", () => {
    expect(pontuarPar(consumo({ ultimaContratacao: dia("2025-06-01") }), ATA, HOJE)?.pontos).toBe(47 + 6);
  });

  it("quem já comprou por adesão a ata conhece o caminho", () => {
    const p = pontuarPar(consumo({ contratosPorAdesao: 2 }), ATA, HOJE);
    expect(p?.pontos).toBe(47 + 10);
    expect(p?.motivos.join(" ")).toContain("2 contratos");
    expect(pontuarPar(consumo({ contratosPorAdesao: 0 }), ATA, HOJE)?.pontos).toBe(47);
  });

  it("volume grande e recorrente com contrato vencendo e adesão chega ao teto de 100 e ao nível mais alto", () => {
    const p = pontuarPar(
      consumo({
        valorTotalNaJanela: 6_000_000,
        janelaMeses: 36,
        quantidadeContratos: 12,
        vigenciaFimMaisRecente: dia("2027-01-10"),
        contratosPorAdesao: 3,
      }),
      ATA,
      HOJE,
    );
    expect(p?.pontos).toBe(100);
    expect(p?.nivel).toBe("muito_provavel");
    expect(p?.consumoAnualEstimado).toBe(false);
  });

  it("ata de órgão municipal pesa um pouco e avisa da licitação de origem", () => {
    const p = pontuarPar(consumo(), { ...ATA, esferaGerenciador: "municipal" }, HOJE);
    expect(p?.pontos).toBe(47 - 5);
    expect(p?.avisos[0]).toContain("nasceu de licitação");
  });

  it("esfera do gerenciador não confirmada pesa muito e vira aviso", () => {
    for (const esfera of [null, "", "não informada"]) {
      const p = pontuarPar(consumo(), { ...ATA, esferaGerenciador: esfera }, HOJE);
      expect(p?.pontos).toBe(17);
      expect(p?.avisos[0]).toContain("não confirmada");
    }
  });

  it("consumo anual acima de 20 milhões avisa que pode ser obra ou serviço, sem mexer na nota", () => {
    const normal = pontuarPar(consumo({ valorTotalNaJanela: 3_000_000, janelaMeses: 36 }), ATA, HOJE);
    const enorme = pontuarPar(consumo({ valorTotalNaJanela: 300_000_000, janelaMeses: 36 }), ATA, HOJE);
    expect(normal?.avisos).toEqual([]);
    expect(enorme?.avisos[0]).toContain("obra ou serviço grande");
    expect(enorme?.pontos).toBe(pontuarPar(consumo({ valorTotalNaJanela: 30_000_000, janelaMeses: 36 }), ATA, HOJE)?.pontos);
  });

  it("guarda os dias até o contrato vencer, para desempate (negativo = já venceu, nulo = sem vigência)", () => {
    expect(pontuarPar(consumo({ vigenciaFimMaisRecente: dia("2026-12-16") }), ATA, HOJE)?.diasParaVencer).toBe(30);
    expect(pontuarPar(consumo({ vigenciaFimMaisRecente: dia("2026-11-06") }), ATA, HOJE)?.diasParaVencer).toBe(-10);
    expect(pontuarPar(consumo(), ATA, HOJE)?.diasParaVencer).toBeNull();
  });

  it("a nota nunca passa de 100 nem fica abaixo de 0", () => {
    const baixa = pontuarPar(consumo({ valorUltimaContratacao: 1, quantidadeContratos: 0 }), { ...ATA, esferaGerenciador: null }, HOJE);
    expect(baixa?.pontos).toBeGreaterThanOrEqual(0);
    expect(baixa?.pontos).toBeLessThanOrEqual(100);
  });
});

describe("nivelDosPontos", () => {
  it("separa em três níveis", () => {
    expect(nivelDosPontos(75)).toBe("muito_provavel");
    expect(nivelDosPontos(74)).toBe("provavel");
    expect(nivelDosPontos(55)).toBe("provavel");
    expect(nivelDosPontos(54)).toBe("possivel");
    expect(ROTULO_NIVEL.muito_provavel).toBe("Muito provável");
  });
});
