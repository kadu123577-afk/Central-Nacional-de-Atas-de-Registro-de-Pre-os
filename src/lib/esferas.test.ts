import { describe, expect, it } from "vitest";
import { verificarElegibilidadeEsfera } from "./esferas";

describe("verificarElegibilidadeEsfera", () => {
  it("permite federal aderir a ata gerenciada por federal", () => {
    expect(verificarElegibilidadeEsfera("federal", "federal").permitido).toBe(true);
  });

  it("recusa federal aderir a ata gerenciada por estadual (art. 86 §8º)", () => {
    const resultado = verificarElegibilidadeEsfera("federal", "estadual");
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivo).toBe("NIVEL_NAO_PERMITIDO");
  });

  it("recusa federal aderir a ata gerenciada por distrital (art. 86 §8º)", () => {
    expect(verificarElegibilidadeEsfera("federal", "distrital").permitido).toBe(false);
  });

  it("recusa federal aderir a ata gerenciada por município (art. 86 §8º)", () => {
    expect(verificarElegibilidadeEsfera("federal", "municipal").permitido).toBe(false);
  });

  it("permite estadual aderir a ata gerenciada por federal, estadual ou distrital", () => {
    expect(verificarElegibilidadeEsfera("estadual", "federal").permitido).toBe(true);
    expect(verificarElegibilidadeEsfera("estadual", "estadual").permitido).toBe(true);
    expect(verificarElegibilidadeEsfera("estadual", "distrital").permitido).toBe(true);
  });

  it("permite distrital aderir a ata gerenciada por federal, estadual ou distrital", () => {
    expect(verificarElegibilidadeEsfera("distrital", "federal").permitido).toBe(true);
    expect(verificarElegibilidadeEsfera("distrital", "estadual").permitido).toBe(true);
    expect(verificarElegibilidadeEsfera("distrital", "distrital").permitido).toBe(true);
  });

  it("permite município aderir a ata gerenciada por outro município (art. 86 §3º, II)", () => {
    expect(verificarElegibilidadeEsfera("municipal", "municipal").permitido).toBe(true);
  });

  it("permite município aderir a ata gerenciada por estadual, distrital ou federal (art. 86 §3º, I — o uso mais comum de carona na prática)", () => {
    expect(verificarElegibilidadeEsfera("municipal", "estadual").permitido).toBe(true);
    expect(verificarElegibilidadeEsfera("municipal", "distrital").permitido).toBe(true);
    expect(verificarElegibilidadeEsfera("municipal", "federal").permitido).toBe(true);
  });

  it("recusa estadual ou distrital aderir a ata gerenciada por município (nenhum inciso do §3º cobre esse caso)", () => {
    expect(verificarElegibilidadeEsfera("estadual", "municipal").permitido).toBe(false);
    expect(verificarElegibilidadeEsfera("distrital", "municipal").permitido).toBe(false);
  });

  it("recusa quando a esfera do órgão gerenciador não é conhecida (ex.: importado do PNCP sem essa informação)", () => {
    const resultado = verificarElegibilidadeEsfera("municipal", "não informada");
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivo).toBe("ESFERA_NAO_CONFIRMADA");
  });

  it("recusa quando a esfera do órgão aderente não é conhecida", () => {
    const resultado = verificarElegibilidadeEsfera("qualquer coisa", "municipal");
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivo).toBe("ESFERA_NAO_CONFIRMADA");
  });
});
