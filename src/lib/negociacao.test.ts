import { describe, expect, it } from "vitest";
import { calcularPrazo, prazoParaEstagio } from "./negociacao";

/** Segunda-feira 9/11/2026, meio-dia em Brasília. */
const agora = new Date("2026-11-09T15:00:00Z");

describe("calcularPrazo", () => {
  it("soma 10 dias úteis: pula fins de semana e o feriado de 20/11", () => {
    expect(calcularPrazo(agora).toISOString()).toBe("2026-11-24T15:00:00.000Z");
  });

  it("dias corridos não valem mais: de uma sexta, 10 dias úteis são duas semanas", () => {
    // Sexta 6/11 + 10 d.u. = sexta 20/11 é feriado, então vence segunda 23/11.
    expect(calcularPrazo(new Date("2026-11-06T15:00:00Z")).toISOString()).toBe("2026-11-23T15:00:00.000Z");
  });

  it("os feriados extras da equipe empurram o prazo", () => {
    expect(calcularPrazo(agora, new Set(["2026-11-10"])).toISOString()).toBe("2026-11-25T15:00:00.000Z");
  });
});

describe("prazoParaEstagio", () => {
  it("renova o prazo em estágios abertos", () => {
    expect(prazoParaEstagio("a_contatar", agora)).not.toBeNull();
    expect(prazoParaEstagio("em_negociacao", agora)?.toISOString()).toBe("2026-11-24T15:00:00.000Z");
  });

  it("passa os feriados extras adiante", () => {
    expect(prazoParaEstagio("em_negociacao", agora, new Set(["2026-11-10"]))?.toISOString()).toBe("2026-11-25T15:00:00.000Z");
  });

  it("não tem prazo em estágios finais", () => {
    expect(prazoParaEstagio("aderiu", agora)).toBeNull();
    expect(prazoParaEstagio("recusado", agora)).toBeNull();
  });
});
