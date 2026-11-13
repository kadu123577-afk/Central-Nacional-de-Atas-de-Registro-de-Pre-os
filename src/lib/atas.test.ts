import { describe, expect, it } from "vitest";
import { ataDisponivelParaAdesao } from "./atas";

const DIA = 1000 * 60 * 60 * 24;
const futuro = () => new Date(Date.now() + DIA * 30);
const passado = () => new Date(Date.now() - DIA);

describe("ataDisponivelParaAdesao", () => {
  it("permite ata aprovada, com contrato e com vigência no futuro", () => {
    expect(ataDisponivelParaAdesao({ status: "APROVADA", temContrato: true, dataVigenciaFim: futuro() })).toBe(true);
  });

  it("recusa ata aprovada SEM contrato de intermediação: sem contrato não há como vender nem receber a comissão", () => {
    expect(ataDisponivelParaAdesao({ status: "APROVADA", temContrato: false, dataVigenciaFim: futuro() })).toBe(false);
  });

  it("recusa ata aprovada e com contrato mas já vencida", () => {
    expect(ataDisponivelParaAdesao({ status: "APROVADA", temContrato: true, dataVigenciaFim: passado() })).toBe(false);
  });

  it("recusa ata pendente de moderação, mesmo com contrato e vigência futura", () => {
    expect(ataDisponivelParaAdesao({ status: "PENDENTE", temContrato: true, dataVigenciaFim: futuro() })).toBe(false);
  });

  it("recusa ata rejeitada", () => {
    expect(ataDisponivelParaAdesao({ status: "REJEITADA", temContrato: true, dataVigenciaFim: futuro() })).toBe(false);
  });
});
