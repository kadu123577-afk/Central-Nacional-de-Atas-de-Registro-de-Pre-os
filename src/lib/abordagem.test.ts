import { describe, expect, it } from "vitest";
import { abordagemSugerida } from "./abordagem";
import { CARGO_EDUCACAO, CARGO_PREFEITO } from "./decisores";

describe("abordagemSugerida", () => {
  it("usa o cargo e a categoria da ata", () => {
    const a = abordagemSugerida(CARGO_EDUCACAO, "kit-escolar", null);
    expect(a.titulo).toContain("Educação");
    expect(a.texto.toLowerCase()).toContain("kit escolar");
    expect(a.texto).toContain("art. 86");
  });

  it("começa pelo gancho quando há 'por que agora'", () => {
    const a = abordagemSugerida(CARGO_PREFEITO, "veiculos", "Contratou veículos há 30 meses");
    expect(a.texto.startsWith("Contratou veículos há 30 meses.")).toBe(true);
  });

  it("cargo desconhecido ou nulo cai no texto genérico", () => {
    expect(abordagemSugerida(null, null, null).titulo).toBe("Abordagem sugerida");
  });
});
