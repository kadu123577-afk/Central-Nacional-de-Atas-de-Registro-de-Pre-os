import { describe, expect, it } from "vitest";
import { alertasAutomaticos, itensPendentes, type RespostasConformidade } from "./conformidade";

const tudoMarcado: RespostasConformidade = {
  fornecedorRegular: true,
  editalPermiteAdesao: true,
  limitesRespeitados: true,
  pesquisaPrecos: true,
  anuenciaGerenciador: true,
  estimativaQuantidades: true,
};

describe("itensPendentes", () => {
  it("é vazio quando tudo está marcado", () => {
    expect(itensPendentes(tudoMarcado)).toEqual([]);
  });

  it("lista só os desmarcados", () => {
    const pend = itensPendentes({ ...tudoMarcado, pesquisaPrecos: false, anuenciaGerenciador: false });
    expect(pend).toHaveLength(2);
  });
});

describe("alertasAutomaticos", () => {
  const agora = new Date("2026-10-04T12:00:00Z");

  it("sem alertas para ata vigente e completa", () => {
    expect(
      alertasAutomaticos({
        dataVigenciaFim: new Date("2027-01-01"),
        itensCount: 3,
        categoria: "saude",
        documentosCount: 1,
        agora,
      }),
    ).toEqual([]);
  });

  it("alerta vigência vencida, sem itens, sem categoria e sem documento", () => {
    expect(
      alertasAutomaticos({
        dataVigenciaFim: new Date("2026-01-01"),
        itensCount: 0,
        categoria: null,
        documentosCount: 0,
        agora,
      }),
    ).toHaveLength(4);
  });
});
