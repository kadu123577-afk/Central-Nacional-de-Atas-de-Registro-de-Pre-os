import { describe, expect, it } from "vitest";
import { dataCurtaUtc, iniciais, moedaCurta, percentualDeFracao } from "./formato";

describe("moedaCurta", () => {
  it("milhões, milhares e valores pequenos", () => {
    expect(moedaCurta(1_240_000)).toBe("R$ 1,24 mi");
    expect(moedaCurta(12_500_000)).toBe("R$ 12,5 mi");
    expect(moedaCurta(820_000)).toBe("R$ 820 mil");
    expect(moedaCurta(950)).toContain("950");
    expect(moedaCurta(0)).toContain("0");
  });
});

describe("percentualDeFracao", () => {
  it("sem ruído de ponto flutuante", () => {
    expect(percentualDeFracao(0.075)).toBe("7,5%");
    expect(percentualDeFracao(0.07)).toBe("7%");
    expect(percentualDeFracao(0.15)).toBe("15%");
  });
});

describe("dataCurtaUtc", () => {
  it("não desloca o dia", () => {
    expect(dataCurtaUtc("2026-10-04T00:00:00.000Z")).toBe("04/10/2026");
  });
});

describe("iniciais", () => {
  it("primeiro e último nome", () => {
    expect(iniciais("Gustavo Carmo")).toBe("GC");
    expect(iniciais("Maria")).toBe("M");
  });

  it("ignora aspas e parênteses", () => {
    expect(iniciais('Radson Alves "Radinho"')).toBe("RR");
    expect(iniciais("Thomé Neto (João Tomé Neto)")).toBe("TN");
  });

  it("vazio vira interrogação", () => {
    expect(iniciais("   ")).toBe("?");
    expect(iniciais('""')).toBe("?");
  });
});
