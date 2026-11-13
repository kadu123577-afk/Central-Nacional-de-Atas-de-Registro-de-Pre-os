import { describe, expect, it } from "vitest";
import { validarSenhaNova } from "./senha";
import { gerarSenhaProvisoria } from "./senha-provisoria";

describe("gerarSenhaProvisoria", () => {
  it("quatro grupos de quatro caracteres separados por hífen", () => {
    expect(gerarSenhaProvisoria()).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
  });

  it("nunca usa caracteres que se confundem (I, l, O, o, 0, 1)", () => {
    for (let i = 0; i < 300; i += 1) {
      expect(gerarSenhaProvisoria()).not.toMatch(/[IlOo01]/);
    }
  });

  it("sempre tem maiúscula, minúscula e número, e passa na política de senha", () => {
    for (let i = 0; i < 300; i += 1) {
      const senha = gerarSenhaProvisoria();
      expect(senha).toMatch(/[A-Z]/);
      expect(senha).toMatch(/[a-z]/);
      expect(senha).toMatch(/\d/);
      expect(validarSenhaNova(senha, "pessoa@exemplo.com.br")).toBeNull();
    }
  });

  it("não repete: 300 senhas, 300 valores diferentes", () => {
    const vistas = new Set(Array.from({ length: 300 }, () => gerarSenhaProvisoria()));
    expect(vistas.size).toBe(300);
  });
});
