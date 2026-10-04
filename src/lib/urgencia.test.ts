import { describe, expect, it } from "vitest";
import { calcularUrgencia } from "./urgencia";

const agora = new Date("2026-10-04T12:00:00Z");
const emDias = (n: number) => new Date(agora.getTime() + n * 24 * 60 * 60 * 1000);

describe("calcularUrgencia", () => {
  it("sem prazo", () => {
    expect(calcularUrgencia(null, agora)).toEqual({ nivel: "sem_prazo", dias: null, rotulo: "Sem prazo" });
  });

  it("já venceu = crítico, 'Prazo hoje'", () => {
    expect(calcularUrgencia(emDias(-1), agora)).toMatchObject({ nivel: "critico", dias: 0, rotulo: "Prazo hoje" });
  });

  it("até 3 dias é crítico, até 7 é atenção, depois ok", () => {
    expect(calcularUrgencia(emDias(2), agora)).toMatchObject({ nivel: "critico", dias: 2, rotulo: "Prazo 2 dias" });
    expect(calcularUrgencia(emDias(3), agora).nivel).toBe("critico");
    expect(calcularUrgencia(emDias(4), agora).nivel).toBe("atencao");
    expect(calcularUrgencia(emDias(7), agora).nivel).toBe("atencao");
    expect(calcularUrgencia(emDias(8), agora).nivel).toBe("ok");
  });

  it("singular para 1 dia", () => {
    expect(calcularUrgencia(emDias(0.4), agora).rotulo).toBe("Prazo 1 dia");
    expect(calcularUrgencia(emDias(1), agora).rotulo).toBe("Prazo 1 dia");
  });
});
