import { describe, expect, it } from "vitest";
import {
  fracaoParaDecimal,
  idComFormaDeCuid,
  interpretarValorDigitado,
  LIMITE_DESCRICAO_FAIXA,
  normalizarDescricao,
  percentualForaDoContrato,
} from "./leitura";

describe("interpretarValorDigitado", () => {
  it.each([
    ["100000", "100000.00"],
    ["100.000", "100000.00"],
    ["100.000,00", "100000.00"],
    ["100.000,5", "100000.50"],
    ["100000,50", "100000.50"],
    ["100000.50", "100000.50"],
    ["1.234.567,89", "1234567.89"],
    ["1.234.567", "1234567.00"],
    ["R$ 100.000,00", "100000.00"],
    ["r$100.000", "100000.00"],
    ["  2 500 000,00  ", "2500000.00"],
    ["0", "0.00"],
    ["0,00", "0.00"],
    ["007", "7.00"],
    ["1.5", "1.50"],
    ["10.50", "10.50"],
  ])("lê %s como %s", (digitado, esperado) => {
    expect(interpretarValorDigitado(digitado)).toBe(esperado);
  });

  it.each([
    [""],
    ["   "],
    ["abc"],
    ["-100"],
    ["R$"],
    [",50"],
    ["100,"],
    ["100,555"],
    ["100.000,555"],
    ["1,000,000"],
    ["1.00.000"],
    ["10..000"],
    ["1.2345"],
    ["1e6"],
    ["100 mil"],
    ["9".repeat(30)],
  ])("recusa %j sem arredondar nem adivinhar", (digitado) => {
    expect(interpretarValorDigitado(digitado)).toBeNull();
  });

  it("mantém o texto exato dos centavos, sem passar por ponto flutuante", () => {
    expect(interpretarValorDigitado("99.999.999.999.999,99")).toBe("99999999999999.99");
  });
});

describe("normalizarDescricao", () => {
  it("apara, junta espaços e quebras de linha em um espaço só", () => {
    expect(normalizarDescricao("  atas   de\n\n médio\tporte  ")).toBe("atas de médio porte");
  });

  it("tira caracteres de controle", () => {
    expect(normalizarDescricao("a\u0000b\u0007c")).toBe("a b c");
  });

  it("texto vazio continua vazio", () => {
    expect(normalizarDescricao("   \n ")).toBe("");
  });

  it("o limite da descrição cabe em uma célula de tabela", () => {
    expect(LIMITE_DESCRICAO_FAIXA).toBeGreaterThan(0);
    expect(LIMITE_DESCRICAO_FAIXA).toBeLessThanOrEqual(255);
  });
});

describe("idComFormaDeCuid", () => {
  it("aceita um cuid e recusa o que tem outra forma", () => {
    expect(idComFormaDeCuid("cm1abc23d0000xyz98765432")).toBe(true);
    expect(idComFormaDeCuid("")).toBe(false);
    expect(idComFormaDeCuid("cm1")).toBe(false);
    expect(idComFormaDeCuid("CM1ABC23D0000XYZ98765432")).toBe(false);
    expect(idComFormaDeCuid("x'; DROP TABLE faixas_comissao;--")).toBe(false);
  });
});

describe("fracaoParaDecimal", () => {
  it("grava 4 casas", () => {
    expect(fracaoParaDecimal(0.0525)).toBe("0.0525");
    expect(fracaoParaDecimal(0.05)).toBe("0.0500");
    expect(fracaoParaDecimal(0.3)).toBe("0.3000");
  });
});

describe("percentualForaDoContrato", () => {
  it("de 3% a 15% (inclusive) é aceito pelo contrato", () => {
    expect(percentualForaDoContrato(0.03)).toBe(false);
    expect(percentualForaDoContrato(0.0525)).toBe(false);
    expect(percentualForaDoContrato(0.15)).toBe(false);
  });

  it("fora do intervalo, ou número inválido, é marcado", () => {
    expect(percentualForaDoContrato(0.0299)).toBe(true);
    expect(percentualForaDoContrato(0.1501)).toBe(true);
    expect(percentualForaDoContrato(0.3)).toBe(true);
    expect(percentualForaDoContrato(Number.NaN)).toBe(true);
  });
});
