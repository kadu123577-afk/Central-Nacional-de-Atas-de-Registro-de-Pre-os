import { describe, expect, it } from "vitest";
import { sinaisRelevantes, tipoSinalValido, type SinalView } from "./sinais";

const agora = new Date("2026-10-05T12:00:00Z");

const sinal = (extra: Partial<SinalView>): SinalView => ({
  id: Math.random().toString(36).slice(2),
  tipo: "noticia",
  titulo: "t",
  detalhe: null,
  fonte: "f",
  fonteUrl: null,
  categoria: null,
  valorEstimado: null,
  dataSinal: "2026-09-01T00:00:00.000Z",
  expiraEm: null,
  ...extra,
});

describe("sinaisRelevantes", () => {
  it("descarta expirados e de outra categoria; mantém sem categoria", () => {
    const r = sinaisRelevantes(
      [
        sinal({ id: "ok-sem-cat" }),
        sinal({ id: "ok-cat", categoria: "veiculos" }),
        sinal({ id: "outra-cat", categoria: "limpeza" }),
        sinal({ id: "expirado", expiraEm: "2026-10-01T00:00:00.000Z" }),
      ],
      "veiculos",
      agora,
    );
    expect(r.map((s) => s.id).sort()).toEqual(["ok-cat", "ok-sem-cat"]);
  });

  it("ordena por peso do tipo e depois por data", () => {
    const r = sinaisRelevantes(
      [
        sinal({ id: "noticia-nova", tipo: "noticia", dataSinal: "2026-10-04T00:00:00.000Z" }),
        sinal({ id: "licitacao-velha", tipo: "licitacao_aberta", dataSinal: "2026-08-01T00:00:00.000Z" }),
        sinal({ id: "pca", tipo: "pca" }),
        sinal({ id: "noticia-velha", tipo: "noticia", dataSinal: "2026-07-01T00:00:00.000Z" }),
      ],
      null,
      agora,
    );
    expect(r.map((s) => s.id)).toEqual(["licitacao-velha", "pca", "noticia-nova", "noticia-velha"]);
  });

  it("expiração no próprio dia ainda vale", () => {
    const r = sinaisRelevantes([sinal({ expiraEm: "2026-10-05T12:00:00.000Z" })], null, agora);
    expect(r).toHaveLength(1);
  });
});

describe("tipoSinalValido", () => {
  it("valida o vocabulário", () => {
    expect(tipoSinalValido("pca")).toBe(true);
    expect(tipoSinalValido("x")).toBe(false);
  });
});
