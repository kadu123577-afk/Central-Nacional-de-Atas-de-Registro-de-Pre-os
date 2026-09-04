import { describe, expect, it } from "vitest";
import { ataDisponivelParaAdesao } from "./atas";

describe("ataDisponivelParaAdesao", () => {
  it("permite ata aprovada e com vigência no futuro", () => {
    expect(
      ataDisponivelParaAdesao({
        status: "APROVADA",
        dataVigenciaFim: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      }),
    ).toBe(true);
  });

  it("recusa ata aprovada mas já vencida", () => {
    expect(
      ataDisponivelParaAdesao({
        status: "APROVADA",
        dataVigenciaFim: new Date(Date.now() - 1000 * 60 * 60 * 24),
      }),
    ).toBe(false);
  });

  it("recusa ata pendente de moderação, mesmo com vigência futura", () => {
    expect(
      ataDisponivelParaAdesao({
        status: "PENDENTE",
        dataVigenciaFim: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      }),
    ).toBe(false);
  });

  it("recusa ata rejeitada", () => {
    expect(
      ataDisponivelParaAdesao({
        status: "REJEITADA",
        dataVigenciaFim: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      }),
    ).toBe(false);
  });
});
