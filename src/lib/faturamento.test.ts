import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calcularFaturamento,
  PERCENTUAL_REPASSE_DESENVOLVEDORA,
  PERCENTUAL_TECH10,
  percentualTaxaIntermediacaoConfigurado,
} from "./faturamento";

describe("calcularFaturamento", () => {
  it("calcula o valor do contrato como quantidade × valor unitário", () => {
    const resultado = calcularFaturamento(100, 50, 0.03);
    expect(resultado.valorContrato).toBe(5000);
  });

  it("aplica o percentual de taxa informado sobre o valor do contrato", () => {
    const resultado = calcularFaturamento(100, 50, 0.03);
    expect(resultado.valorTaxaIntermediacao).toBe(150); // 3% de 5000
  });

  it("divide a taxa em 95% Tech 10 e 5% desenvolvedora", () => {
    const resultado = calcularFaturamento(100, 50, 0.03);
    expect(resultado.valorDesenvolvedora).toBe(7.5); // 5% de 150
    expect(resultado.valorTech10).toBe(142.5); // 95% de 150
  });

  it("a soma de Tech 10 + desenvolvedora sempre bate exatamente com a taxa total", () => {
    // valores propositalmente "quebrados" pra estressar arredondamento
    const resultado = calcularFaturamento(37, 19.99, 0.037);
    expect(resultado.valorTech10 + resultado.valorDesenvolvedora).toBe(
      resultado.valorTaxaIntermediacao,
    );
  });

  it("usa o percentual configurado por env var quando nenhum é passado explicitamente", () => {
    const resultado = calcularFaturamento(100, 50);
    expect(resultado.percentualTaxa).toBe(percentualTaxaIntermediacaoConfigurado());
  });

  it("os percentuais fixos do plano somam 100%", () => {
    expect(PERCENTUAL_TECH10 + PERCENTUAL_REPASSE_DESENVOLVEDORA).toBe(1);
  });
});

describe("percentualTaxaIntermediacaoConfigurado", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("usa o padrão de 3% quando a env var não está definida", () => {
    vi.stubEnv("TAXA_INTERMEDIACAO_PERCENTUAL", "");
    expect(percentualTaxaIntermediacaoConfigurado()).toBe(0.03);
  });

  it("usa o valor da env var quando configurado", () => {
    vi.stubEnv("TAXA_INTERMEDIACAO_PERCENTUAL", "0.05");
    expect(percentualTaxaIntermediacaoConfigurado()).toBe(0.05);
  });

  it("ignora valores inválidos ou não positivos e cai pro padrão", () => {
    vi.stubEnv("TAXA_INTERMEDIACAO_PERCENTUAL", "abc");
    expect(percentualTaxaIntermediacaoConfigurado()).toBe(0.03);

    vi.stubEnv("TAXA_INTERMEDIACAO_PERCENTUAL", "-0.1");
    expect(percentualTaxaIntermediacaoConfigurado()).toBe(0.03);
  });
});
