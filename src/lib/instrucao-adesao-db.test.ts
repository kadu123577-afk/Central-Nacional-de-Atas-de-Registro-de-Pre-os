import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A camada de banco da instrução, testada com o Prisma trocado por dublês:
 * o que se confere é o que ela pede ao banco (condições das gravações,
 * criação na primeira vez, nova tentativa quando alguém passa na frente) e
 * que o JSON lido é sempre normalizado.
 */
const dobles = vi.hoisted(() => ({
  oportunidadeFindUnique: vi.fn(),
  instrucaoFindUnique: vi.fn(),
  instrucaoCreate: vi.fn(),
  instrucaoUpdateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oportunidadeVenda: { findUnique: dobles.oportunidadeFindUnique },
    instrucaoAdesao: {
      findUnique: dobles.instrucaoFindUnique,
      create: dobles.instrucaoCreate,
      updateMany: dobles.instrucaoUpdateMany,
    },
  },
}));

import type { MapaInstrucao } from "./instrucao-adesao";
import {
  apagarDeclaracao,
  atualizarItens,
  buscarOportunidadeDaInstrucao,
  lerInstrucao,
  registrarDeclaracao,
} from "./instrucao-adesao-db";

const LEITURA = new Date("2026-10-20T10:00:00Z");

function linha(extra: Record<string, unknown> = {}) {
  return {
    id: "i1",
    oportunidadeId: "o1",
    itens: {},
    declaracaoEm: null,
    declaracaoPorTipo: null,
    declaracaoPorId: null,
    declaracaoVersao: null,
    declaracaoExcecao: null,
    criadoEm: LEITURA,
    atualizadoEm: LEITURA,
    ...extra,
  };
}

const marcaDfd = (atual: MapaInstrucao): MapaInstrucao => ({ ...atual, dfd: { feito: true, em: "2026-10-21" } });

function erroDeUnicidade() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.instrucaoFindUnique.mockResolvedValue(null);
  dobles.instrucaoCreate.mockResolvedValue({});
  dobles.instrucaoUpdateMany.mockResolvedValue({ count: 1 });
});

describe("buscarOportunidadeDaInstrucao", () => {
  it("pede só os campos que a decisão de permissão usa", async () => {
    dobles.oportunidadeFindUnique.mockResolvedValue({ id: "o1" });
    await buscarOportunidadeDaInstrucao("o1");
    expect(dobles.oportunidadeFindUnique).toHaveBeenCalledWith({
      where: { id: "o1" },
      select: { id: true, ataId: true, vendedorId: true, estagio: true, expiradaEm: true },
    });
  });
});

describe("lerInstrucao", () => {
  it("sem linha, devolve null", async () => {
    await expect(lerInstrucao("o1")).resolves.toBeNull();
    expect(dobles.instrucaoFindUnique).toHaveBeenCalledWith({ where: { oportunidadeId: "o1" } });
  });

  it("normaliza o JSON dos itens (nunca confia no que veio do banco)", async () => {
    dobles.instrucaoFindUnique.mockResolvedValue(
      linha({ itens: { dfd: { feito: true, em: "2026-10-01", nota: " ok " }, lixo: { feito: true }, dotacao: "x" } }),
    );
    const lida = await lerInstrucao("o1");
    expect(lida?.itens).toEqual({ dfd: { feito: true, em: "2026-10-01", nota: "ok" } });
    expect(lida?.atualizadoEm).toBe(LEITURA);
  });

  it("JSON quebrado vira mapa vazio", async () => {
    dobles.instrucaoFindUnique.mockResolvedValue(linha({ itens: "texto" }));
    await expect(lerInstrucao("o1")).resolves.toMatchObject({ itens: {} });
  });
});

describe("atualizarItens", () => {
  it("primeira vez: cria a linha com os itens novos", async () => {
    const r = await atualizarItens("o1", marcaDfd);
    expect(r).toEqual({
      ok: true,
      antes: {},
      depois: { dfd: { feito: true, em: "2026-10-21" } },
      mudou: true,
      declaracaoEm: null,
    });
    expect(dobles.instrucaoCreate).toHaveBeenCalledWith({
      data: { oportunidadeId: "o1", itens: { dfd: { feito: true, em: "2026-10-21" } } },
    });
    expect(dobles.instrucaoUpdateMany).not.toHaveBeenCalled();
  });

  it("linha existente: grava só se o atualizadoEm lido continua o mesmo", async () => {
    const declaracaoEm = new Date("2026-10-15T10:00:00Z");
    dobles.instrucaoFindUnique.mockResolvedValue(linha({ declaracaoEm }));
    const r = await atualizarItens("o1", marcaDfd);
    expect(r).toMatchObject({ ok: true, mudou: true, declaracaoEm });
    expect(dobles.instrucaoUpdateMany).toHaveBeenCalledWith({
      where: { oportunidadeId: "o1", atualizadoEm: LEITURA },
      data: { itens: { dfd: { feito: true, em: "2026-10-21" } } },
    });
    expect(dobles.instrucaoCreate).not.toHaveBeenCalled();
  });

  it("nada mudou: não escreve nada", async () => {
    dobles.instrucaoFindUnique.mockResolvedValue(linha({ itens: { dfd: { feito: true, em: "2026-10-05" } } }));
    const r = await atualizarItens("o1", (atual) => atual);
    expect(r).toMatchObject({ ok: true, mudou: false });
    expect(dobles.instrucaoCreate).not.toHaveBeenCalled();
    expect(dobles.instrucaoUpdateMany).not.toHaveBeenCalled();
  });

  it("alguém gravou no meio: relê e aplica de novo em cima do que ficou", async () => {
    dobles.instrucaoFindUnique
      .mockResolvedValueOnce(linha())
      .mockResolvedValueOnce(
        linha({ itens: { dotacao: { feito: true, em: "2026-10-21" } }, atualizadoEm: new Date("2026-10-21T10:00:00Z") }),
      );
    dobles.instrucaoUpdateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const r = await atualizarItens("o1", marcaDfd);
    expect(r).toMatchObject({ ok: true, mudou: true });
    expect(dobles.instrucaoUpdateMany).toHaveBeenCalledTimes(2);
    // A segunda gravação preserva o item que a outra pessoa marcou.
    expect(dobles.instrucaoUpdateMany.mock.calls[1][0]).toEqual({
      where: { oportunidadeId: "o1", atualizadoEm: new Date("2026-10-21T10:00:00Z") },
      data: {
        itens: { dfd: { feito: true, em: "2026-10-21" }, dotacao: { feito: true, em: "2026-10-21" } },
      },
    });
  });

  it("duas pessoas criando a linha ao mesmo tempo: quem perde relê e atualiza", async () => {
    dobles.instrucaoFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(linha());
    dobles.instrucaoCreate.mockRejectedValueOnce(erroDeUnicidade());

    const r = await atualizarItens("o1", marcaDfd);
    expect(r).toMatchObject({ ok: true, mudou: true });
    expect(dobles.instrucaoCreate).toHaveBeenCalledTimes(1);
    expect(dobles.instrucaoUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("depois de cinco perdas seguidas, desiste com 'conflito' em vez de sobrescrever", async () => {
    dobles.instrucaoFindUnique.mockResolvedValue(linha());
    dobles.instrucaoUpdateMany.mockResolvedValue({ count: 0 });
    const r = await atualizarItens("o1", marcaDfd);
    expect(r).toEqual({ ok: false, motivo: "conflito" });
    expect(dobles.instrucaoUpdateMany).toHaveBeenCalledTimes(5);
  });

  it("erro do banco que não é de unicidade não é engolido", async () => {
    dobles.instrucaoCreate.mockRejectedValue(new Error("conexão caiu"));
    await expect(atualizarItens("o1", marcaDfd)).rejects.toThrow("conexão caiu");
  });
});

describe("registrarDeclaracao", () => {
  const dados = {
    declaracaoEm: new Date("2026-10-21T15:00:00Z"),
    declaracaoPorTipo: "vendedor",
    declaracaoPorId: "v1",
    declaracaoVersao: 1,
    declaracaoExcecao: null,
  };

  it("sem linha anterior, cria já com a declaração", async () => {
    await expect(registrarDeclaracao("o1", null, dados)).resolves.toBe(true);
    expect(dobles.instrucaoCreate).toHaveBeenCalledWith({ data: { oportunidadeId: "o1", ...dados } });
  });

  it("alguém criou a linha primeiro: devolve false (quem chama pede para conferir)", async () => {
    dobles.instrucaoCreate.mockRejectedValue(erroDeUnicidade());
    await expect(registrarDeclaracao("o1", null, dados)).resolves.toBe(false);
  });

  it("com linha, só declara se ainda não há declaração e os itens são os mesmos que foram lidos", async () => {
    await expect(registrarDeclaracao("o1", LEITURA, dados)).resolves.toBe(true);
    expect(dobles.instrucaoUpdateMany).toHaveBeenCalledWith({
      where: { oportunidadeId: "o1", declaracaoEm: null, atualizadoEm: LEITURA },
      data: dados,
    });
  });

  it("nenhuma linha atendeu à condição: false", async () => {
    dobles.instrucaoUpdateMany.mockResolvedValue({ count: 0 });
    await expect(registrarDeclaracao("o1", LEITURA, dados)).resolves.toBe(false);
  });
});

describe("apagarDeclaracao", () => {
  it("só apaga declaração existente e só se o estágio não for o que impede (na mesma instrução)", async () => {
    await expect(apagarDeclaracao("o1", "aderiu")).resolves.toBe(true);
    expect(dobles.instrucaoUpdateMany).toHaveBeenCalledWith({
      where: {
        oportunidadeId: "o1",
        declaracaoEm: { not: null },
        oportunidade: { estagio: { not: "aderiu" } },
      },
      data: {
        declaracaoEm: null,
        declaracaoPorTipo: null,
        declaracaoPorId: null,
        declaracaoVersao: null,
        declaracaoExcecao: null,
      },
    });
  });

  it("nada apagado: false", async () => {
    dobles.instrucaoUpdateMany.mockResolvedValue({ count: 0 });
    await expect(apagarDeclaracao("o1", "aderiu")).resolves.toBe(false);
  });
});
