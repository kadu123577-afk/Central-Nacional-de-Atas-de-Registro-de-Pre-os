import { describe, expect, it } from "vitest";
import { extrairConfianca, extrairFonte, limparNomeContato, nivelConfiancaPorRotulo } from "./contatos-fonte";

const PREFEITO = "Prefeito(a)";
const SAUDE = "Secretário(a) de Saúde";
const EDUCACAO = "Secretário(a) de Educação";
const ADM = "Secretário(a) de Administração/Finanças";

describe("nivelConfiancaPorRotulo", () => {
  it("alta, média e baixa", () => {
    expect(nivelConfiancaPorRotulo("Alta")).toBe(3);
    expect(nivelConfiancaPorRotulo("Média")).toBe(2);
    expect(nivelConfiancaPorRotulo("Media")).toBe(2);
    expect(nivelConfiancaPorRotulo("Baixa")).toBe(1);
    expect(nivelConfiancaPorRotulo("?")).toBeNull();
  });
});

describe("extrairFonte", () => {
  it("fonte e site oficial", () => {
    const t = "Partido: UNIÃO. Site oficial: alvaraes.am.gov.br. Fonte: site oficial; Instagram @pma. Confiança: Alta.";
    expect(extrairFonte(t)).toEqual({ fonte: "site oficial; Instagram @pma", fonteUrl: "https://alvaraes.am.gov.br" });
  });

  it("só fonte, sem site", () => {
    expect(extrairFonte("Fonte: G1. Confiança: Média.")).toEqual({ fonte: "G1", fonteUrl: null });
  });

  it("sem texto", () => {
    expect(extrairFonte(null)).toEqual({ fonte: null, fonteUrl: null });
    expect(extrairFonte("Partido: MDB.")).toEqual({ fonte: null, fonteUrl: null });
  });
});

describe("extrairConfianca", () => {
  it("nível simples", () => {
    expect(extrairConfianca("Fonte: x. Confiança: Alta.", PREFEITO)).toBe(3);
    expect(extrairConfianca("Fonte: x. Confiança: Baixa.", PREFEITO)).toBe(1);
  });

  it("por cargo", () => {
    const t = "Fonte: x. Confiança: Alta (prefeito) / Média (saúde).";
    expect(extrairConfianca(t, PREFEITO)).toBe(3);
    expect(extrairConfianca(t, SAUDE)).toBe(2);
  });

  it("'demais' vale para secretários", () => {
    const t = "Confiança: Média (prefeito) / Baixa (demais)";
    expect(extrairConfianca(t, PREFEITO)).toBe(2);
    expect(extrairConfianca(t, EDUCACAO)).toBe(1);
  });

  it("qualificador truncado e cargo sem casamento usa o mais baixo", () => {
    const t = "Confiança: Alta (prefeito/educação) / Média (saúde/adm";
    expect(extrairConfianca(t, EDUCACAO)).toBe(3);
    expect(extrairConfianca(t, ADM)).toBe(2);
  });

  it("sem confiança", () => {
    expect(extrairConfianca("Partido: MDB.", PREFEITO)).toBeNull();
    expect(extrairConfianca(null, PREFEITO)).toBeNull();
  });
});

describe("limparNomeContato", () => {
  it("tira anotação de qualidade e guarda como nota", () => {
    expect(limparNomeContato("Wandevelde Guedes Mendonça (méd. conf.)")).toEqual({
      nome: "Wandevelde Guedes Mendonça",
      nota: "méd. conf.",
    });
    expect(limparNomeContato("Dr. Otto (dado 1 ano)")).toEqual({ nome: "Dr. Otto", nota: "dado 1 ano" });
  });

  it("mantém anotação de área", () => {
    expect(limparNomeContato("Clovenildo Macedo (Adm. e Planejamento)")).toEqual({
      nome: "Clovenildo Macedo (Adm. e Planejamento)",
      nota: null,
    });
  });
});
