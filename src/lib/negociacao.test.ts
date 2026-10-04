import { describe, expect, it } from "vitest";
import { calcularPrazo, prazoParaEstagio } from "./negociacao";

const agora = new Date("2026-10-04T12:00:00Z");

describe("calcularPrazo", () => {
  it("soma 10 dias", () => {
    expect(calcularPrazo(agora).toISOString()).toBe("2026-10-14T12:00:00.000Z");
  });
});

describe("prazoParaEstagio", () => {
  it("renova o prazo em estágios abertos", () => {
    expect(prazoParaEstagio("a_contatar", agora)).not.toBeNull();
    expect(prazoParaEstagio("em_negociacao", agora)).not.toBeNull();
  });

  it("não tem prazo em estágios finais", () => {
    expect(prazoParaEstagio("aderiu", agora)).toBeNull();
    expect(prazoParaEstagio("recusado", agora)).toBeNull();
  });
});
