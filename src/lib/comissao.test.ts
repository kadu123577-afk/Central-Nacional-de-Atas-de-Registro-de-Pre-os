import { describe, expect, it } from "vitest";
import { interpretarPercentualComissao } from "./comissao";

describe("interpretarPercentualComissao", () => {
  it("converte % em fração com 4 casas e aceita vírgula", () => {
    expect(interpretarPercentualComissao("7,5")).toEqual({ ok: true, fracao: "0.0750" });
    expect(interpretarPercentualComissao("3")).toEqual({ ok: true, fracao: "0.0300" });
    expect(interpretarPercentualComissao("15")).toEqual({ ok: true, fracao: "0.1500" });
  });

  it("recusa fora da faixa de 3% a 15%", () => {
    expect(interpretarPercentualComissao("2,99").ok).toBe(false);
    expect(interpretarPercentualComissao("15,01").ok).toBe(false);
    expect(interpretarPercentualComissao("100").ok).toBe(false);
  });

  it("recusa vazio e texto", () => {
    expect(interpretarPercentualComissao("").ok).toBe(false);
    expect(interpretarPercentualComissao("abc").ok).toBe(false);
  });
});
