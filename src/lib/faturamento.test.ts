import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calcularFaturamento,
  PERCENTUAL_TAXA_INTERMEDIACAO_PADRAO,
  percentualTaxaIntermediacaoConfigurado,
} from "./faturamento";

describe("calcularFaturamento", () => {
  it("calcula o valor do contrato como quantidade × valor unitário", () => {
    const resultado = calcularFaturamento(100, 50, 0.05);
    expect(resultado.valorContrato).toBe(5000);
  });

  it("aplica o percentual de taxa informado sobre o valor do contrato", () => {
    const resultado = calcularFaturamento(100, 50, 0.05);
    expect(resultado.valorTaxaIntermediacao).toBe(250); // 5% de 5000
  });

  it("usa o percentual padrão de 5% quando nenhum é passado explicitamente", () => {
    const resultado = calcularFaturamento(100, 50);
    expect(resultado.percentualTaxa).toBe(0.05);
    expect(PERCENTUAL_TAXA_INTERMEDIACAO_PADRAO).toBe(0.05);
  });

  it("arredonda corretamente com valores quebrados", () => {
    const resultado = calcularFaturamento(37, 19.99, 0.05);
    expect(resultado.valorContrato).toBe(739.63);
    expect(resultado.valorTaxaIntermediacao).toBe(36.98);
  });
});

describe("percentualTaxaIntermediacaoConfigurado", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("usa o padrão de 5% quando a env var não está definida", () => {
    vi.stubEnv("TAXA_INTERMEDIACAO_PERCENTUAL", "");
    expect(percentualTaxaIntermediacaoConfigurado()).toBe(0.05);
  });

  it("usa o valor da env var quando configurado", () => {
    vi.stubEnv("TAXA_INTERMEDIACAO_PERCENTUAL", "0.07");
    expect(percentualTaxaIntermediacaoConfigurado()).toBe(0.07);
  });

  it("ignora valores inválidos ou não positivos e cai pro padrão", () => {
    vi.stubEnv("TAXA_INTERMEDIACAO_PERCENTUAL", "abc");
    expect(percentualTaxaIntermediacaoConfigurado()).toBe(0.05);

    vi.stubEnv("TAXA_INTERMEDIACAO_PERCENTUAL", "-0.1");
    expect(percentualTaxaIntermediacaoConfigurado()).toBe(0.05);
  });
});
