import { describe, expect, it } from "vitest";
import {
  PERCENTUAL_SUGERIDO_MAXIMO,
  PERCENTUAL_SUGERIDO_MINIMO,
  faixasValidas,
  formatarPercentual,
  formatarPercentualCampo,
  formatarValorFaixa,
  interpretarPercentualDigitado,
  sugerirPercentual,
  validarFaixa,
  valorTotalDaAta,
  type FaixaComissaoView,
} from "./comissao-sugerida";

// Números de teste, sem relação com a política comercial real: a regra só
// escolhe a faixa, quem define os valores é o administrador no banco.
const FAIXAS: FaixaComissaoView[] = [
  { valorMinimo: 1_000_000, percentual: 0.04 },
  { valorMinimo: 0, percentual: 0.1 },
  { valorMinimo: 100_000, percentual: 0.0525 },
];

describe("sugerirPercentual", () => {
  it("escolhe a faixa de maior valorMinimo que cabe no valor, qualquer que seja a ordem da lista", () => {
    expect(sugerirPercentual(50_000, FAIXAS).percentual).toBe(0.1);
    expect(sugerirPercentual(100_001, FAIXAS).percentual).toBe(0.0525);
    expect(sugerirPercentual(5_000_000, FAIXAS).percentual).toBe(0.04);
    expect(sugerirPercentual(5_000_000, [...FAIXAS].reverse()).percentual).toBe(0.04);
  });

  it("o valor exatamente igual ao mínimo já entra na faixa", () => {
    const r = sugerirPercentual(100_000, FAIXAS);
    expect(r.percentual).toBe(0.0525);
    expect(r.faixa).toEqual({ valorMinimo: 100_000, percentual: 0.0525 });
    expect(r.motivo).toBe("Faixa a partir de R$ 100.000,00: 5,25%");
  });

  it("valor zero cai na faixa de mínimo zero", () => {
    expect(sugerirPercentual(0, FAIXAS).percentual).toBe(0.1);
  });

  it("sem nenhuma faixa: percentual nulo e motivo claro, sem percentual padrão", () => {
    expect(sugerirPercentual(500_000, [])).toEqual({
      percentual: null,
      faixa: null,
      motivo: "Nenhuma faixa configurada",
    });
  });

  it("valor abaixo da primeira faixa: percentual nulo e motivo claro", () => {
    const r = sugerirPercentual(9_999.99, [{ valorMinimo: 10_000, percentual: 0.05 }]);
    expect(r).toEqual({ percentual: null, faixa: null, motivo: "Valor abaixo da primeira faixa" });
  });

  it("ignora faixas inválidas (percentual <= 0 ou > 0,3, valor negativo, NaN, infinito)", () => {
    const sujas: FaixaComissaoView[] = [
      { valorMinimo: 0, percentual: 0 },
      { valorMinimo: 0, percentual: -0.05 },
      { valorMinimo: 0, percentual: 0.31 },
      { valorMinimo: -10, percentual: 0.05 },
      { valorMinimo: Number.NaN, percentual: 0.05 },
      { valorMinimo: 0, percentual: Number.NaN },
      { valorMinimo: Number.POSITIVE_INFINITY, percentual: 0.05 },
      { valorMinimo: 0, percentual: 0.06 },
    ];
    const r = sugerirPercentual(10, sujas);
    expect(r.percentual).toBe(0.06);
    // Só inválidas: é como se não houvesse faixa.
    expect(sugerirPercentual(10, sujas.slice(0, -1)).motivo).toBe("Nenhuma faixa configurada");
  });

  it("o teto de 30% é aceito, mas um centésimo acima não", () => {
    expect(sugerirPercentual(1, [{ valorMinimo: 0, percentual: 0.3 }]).percentual).toBe(0.3);
    expect(sugerirPercentual(1, [{ valorMinimo: 0, percentual: 0.3001 }]).percentual).toBeNull();
  });

  it("valor total inválido não sugere nada", () => {
    for (const v of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const r = sugerirPercentual(v, FAIXAS);
      expect(r.percentual).toBeNull();
      expect(r.faixa).toBeNull();
      expect(r.motivo).toBe("Valor total da ata inválido");
    }
  });

  it("no empate de valorMinimo vale a primeira da lista", () => {
    const r = sugerirPercentual(10, [
      { valorMinimo: 5, percentual: 0.07 },
      { valorMinimo: 5, percentual: 0.09 },
    ]);
    expect(r.percentual).toBe(0.07);
  });

  it("não altera a lista recebida", () => {
    const lista = FAIXAS.map((f) => Object.freeze({ ...f }));
    Object.freeze(lista);
    sugerirPercentual(200_000, lista);
    expect(lista).toEqual(FAIXAS);
  });
});

describe("faixasValidas", () => {
  it("tira as inválidas e ordena do menor para o maior valor mínimo", () => {
    const r = faixasValidas([
      { valorMinimo: 500, percentual: 0.05 },
      { valorMinimo: 100, percentual: 0.9 },
      { valorMinimo: 10, percentual: 0.07 },
    ]);
    expect(r.map((f) => f.valorMinimo)).toEqual([10, 500]);
  });
});

describe("validarFaixa", () => {
  it("aceita faixas normais e os limites", () => {
    expect(validarFaixa({ valorMinimo: 0, percentual: 0.05 })).toEqual({ ok: true });
    expect(validarFaixa({ valorMinimo: 250_000.5, percentual: 0.0525 })).toEqual({ ok: true });
    expect(validarFaixa({ valorMinimo: 10, percentual: PERCENTUAL_SUGERIDO_MINIMO })).toEqual({ ok: true });
    expect(validarFaixa({ valorMinimo: 10, percentual: PERCENTUAL_SUGERIDO_MAXIMO })).toEqual({ ok: true });
  });

  it("recusa percentual fora de 0,0001 a 0,3", () => {
    for (const percentual of [0, -0.01, 0.00009, 0.3001, 0.5, 5]) {
      const r = validarFaixa({ valorMinimo: 10, percentual });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erro).toMatch(/percentual/i);
    }
  });

  it("recusa percentual com mais de 2 casas em % (o banco guarda 4 casas)", () => {
    const r = validarFaixa({ valorMinimo: 10, percentual: 0.05255 });
    expect(r.ok).toBe(false);
  });

  it("recusa valor negativo, não numérico, grande demais ou com fração de centavo", () => {
    for (const valorMinimo of [-0.01, Number.NaN, Number.POSITIVE_INFINITY, 1e15, 10.005]) {
      const r = validarFaixa({ valorMinimo, percentual: 0.05 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erro).toMatch(/valor/i);
    }
  });

  it("valor alto com centavos legítimos não é recusado por erro de ponto flutuante", () => {
    for (const valorMinimo of [123_456_789.12, 1_234_567_890.12, 12_345_678_901.23, 987_654_321_012.34]) {
      expect(validarFaixa({ valorMinimo, percentual: 0.05 })).toEqual({ ok: true });
    }
    // E meio centavo continua recusado, mesmo em valor alto.
    expect(validarFaixa({ valorMinimo: 1_234_567_890.125, percentual: 0.05 }).ok).toBe(false);
  });

  it("o teto de valor da coluna (Decimal 16,2) é recusado um pouco acima", () => {
    expect(validarFaixa({ valorMinimo: 100_000_000_000_000, percentual: 0.05 }).ok).toBe(false);
  });

  it("recusa percentual NaN", () => {
    expect(validarFaixa({ valorMinimo: 1, percentual: Number.NaN }).ok).toBe(false);
  });
});

describe("valorTotalDaAta", () => {
  it("soma quantidade × valor unitário", () => {
    expect(
      valorTotalDaAta([
        { quantidadeRegistrada: 10, valorUnitario: 25.5 },
        { quantidadeRegistrada: 3, valorUnitario: 100 },
      ]),
    ).toBe(555);
  });

  it("não acumula erro de ponto flutuante nos centavos", () => {
    // 0.1 + 0.2 em ponto flutuante daria 0.30000000000000004; 19.99 * 3 daria 59.97 com lixo.
    expect(
      valorTotalDaAta([
        { quantidadeRegistrada: 1, valorUnitario: 0.1 },
        { quantidadeRegistrada: 1, valorUnitario: 0.2 },
      ]),
    ).toBe(0.3);
    expect(valorTotalDaAta([{ quantidadeRegistrada: 3, valorUnitario: 19.99 }])).toBe(59.97);
    expect(valorTotalDaAta(Array.from({ length: 10 }, () => ({ quantidadeRegistrada: 1, valorUnitario: 0.1 })))).toBe(1);
  });

  it("lista vazia soma zero", () => {
    expect(valorTotalDaAta([])).toBe(0);
  });

  it("item inválido conta zero e não contamina o total", () => {
    expect(
      valorTotalDaAta([
        { quantidadeRegistrada: 2, valorUnitario: 50 },
        { quantidadeRegistrada: Number.NaN, valorUnitario: 50 },
        { quantidadeRegistrada: 2, valorUnitario: Number.POSITIVE_INFINITY },
        { quantidadeRegistrada: -1, valorUnitario: 50 },
        { quantidadeRegistrada: 1, valorUnitario: -5 },
      ]),
    ).toBe(100);
  });

  it("valores grandes de ata continuam exatos", () => {
    expect(valorTotalDaAta([{ quantidadeRegistrada: 123_456, valorUnitario: 9_876.54 }])).toBe(1_219_318_122.24);
  });
});

describe("formatadores", () => {
  it("formatarPercentual: fração → texto pt-BR sem zeros sobrando", () => {
    expect(formatarPercentual(0.0525)).toBe("5,25%");
    expect(formatarPercentual(0.05)).toBe("5%");
    expect(formatarPercentual(0.075)).toBe("7,5%");
    expect(formatarPercentual(0.0001)).toBe("0,01%");
    expect(formatarPercentual(0.3)).toBe("30%");
    expect(formatarPercentual(Number.NaN)).toBe("—");
  });

  it("formatarPercentualCampo: sem o símbolo, para preencher o campo", () => {
    expect(formatarPercentualCampo(0.0525)).toBe("5,25");
    expect(formatarPercentualCampo(0.1)).toBe("10");
  });

  it("formatarValorFaixa: reais com espaço comum", () => {
    expect(formatarValorFaixa(1_000_000)).toBe("R$ 1.000.000,00");
    expect(formatarValorFaixa(0)).toBe("R$ 0,00");
  });

  it("interpretarPercentualDigitado: aceita vírgula, ponto e %", () => {
    expect(interpretarPercentualDigitado("5,25")).toBe(0.0525);
    expect(interpretarPercentualDigitado(" 5.25% ")).toBe(0.0525);
    expect(interpretarPercentualDigitado("10")).toBe(0.1);
    expect(interpretarPercentualDigitado("")).toBeNull();
    expect(interpretarPercentualDigitado("abc")).toBeNull();
    expect(interpretarPercentualDigitado("-5")).toBeNull();
    expect(interpretarPercentualDigitado("5,2,5")).toBeNull();
    // Mais casas do que o banco guarda: recusa em vez de arredondar em silêncio.
    expect(interpretarPercentualDigitado("5,255")).toBeNull();
  });

  it("o texto digitado passa por validarFaixa sem surpresa de arredondamento", () => {
    const fracao = interpretarPercentualDigitado("5,25");
    expect(fracao).not.toBeNull();
    expect(validarFaixa({ valorMinimo: 100, percentual: fracao as number })).toEqual({ ok: true });
  });
});
