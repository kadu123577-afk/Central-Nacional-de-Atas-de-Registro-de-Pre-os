import { describe, expect, it } from "vitest";
import { resumirComissao, statusCobrancaValido, tipoLiquidacaoValido } from "./recebiveis";

describe("resumirComissao", () => {
  it("aplica o mesmo percentual a original, aditivo e renovação", () => {
    const r = resumirComissao(
      [
        { valorLiquidado: 1000, statusCobranca: "recebida" },
        { valorLiquidado: 500, statusCobranca: "cobrada" },
        { valorLiquidado: 500, statusCobranca: "pendente" },
      ],
      0.1,
    );
    expect(r.devida).toBeCloseTo(200);
    expect(r.recebida).toBeCloseTo(100);
    expect(r.faltaReceber).toBeCloseTo(100);
  });

  it("é zero sem liquidações", () => {
    expect(resumirComissao([], 0.1)).toEqual({ devida: 0, recebida: 0, faltaReceber: 0 });
  });
});

describe("vocabulário", () => {
  it("valida tipo e status", () => {
    expect(tipoLiquidacaoValido("aditivo")).toBe(true);
    expect(tipoLiquidacaoValido("outro")).toBe(false);
    expect(statusCobrancaValido("cobrada")).toBe(true);
    expect(statusCobrancaValido("paga")).toBe(false);
  });
});
