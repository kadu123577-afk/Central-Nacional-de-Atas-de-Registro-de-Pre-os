import { describe, expect, it } from "vitest";
import { formatarTelefone, lerTelefone } from "./telefone";

describe("lerTelefone", () => {
  it("vazio, só espaço ou ausente vira sem telefone", () => {
    for (const v of ["", "   ", undefined, null]) expect(lerTelefone(v)).toEqual({ ok: true, valor: null });
  });

  it.each([
    ["62999990001", "5562999990001"],
    ["(62) 99999-0001", "5562999990001"],
    ["62 9 9999 0001", "5562999990001"],
    ["+55 62 99999-0001", "5562999990001"],
    ["5562999990001", "5562999990001"],
    ["(62) 3333-4444", "556233334444"],
    ["  62988880002 ", "5562988880002"],
  ])("aceita %s", (digitado, guardado) => {
    expect(lerTelefone(digitado)).toEqual({ ok: true, valor: guardado });
  });

  it.each([
    ["sem DDD", "999990001"],
    ["curto", "6299999"],
    ["longo demais", "55629999900011"],
    ["letras", "62 99999-00AB"],
    ["celular que não começa em 9", "62 89999-0001"],
    ["fixo que começa em 9", "62 9333-4444"],
    ["DDD zero", "02 99999-0001"],
    ["DDD abaixo de 11", "10 99999-0001"],
    ["texto qualquer", "ligar à tarde"],
  ])("recusa %s", (_nome, digitado) => {
    const r = lerTelefone(digitado);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toContain("com DDD");
  });

  it("valor que não é texto conta como vazio (só texto digitado vale)", () => {
    expect(lerTelefone(62999990001)).toEqual({ ok: true, valor: null });
  });
});

describe("formatarTelefone", () => {
  it("mostra celular e fixo com máscara", () => {
    expect(formatarTelefone("5562999990001")).toBe("(62) 99999-0001");
    expect(formatarTelefone("556233334444")).toBe("(62) 3333-4444");
  });

  it("sem telefone, texto vazio; valor que não conhecemos volta como veio", () => {
    expect(formatarTelefone(null)).toBe("");
    expect(formatarTelefone(undefined)).toBe("");
    expect(formatarTelefone("123")).toBe("123");
  });
});
