import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A camada de banco dos indicadores semanais, testada com o Prisma trocado
 * por dublês: o que se confere é o que ela pede ao banco (janelas das duas
 * semanas, régua certa para data só-data e para instante, filtro por
 * consultor em TODAS as consultas, número fixo de consultas) e como monta o
 * resumo com o que volta.
 */
const dobles = vi.hoisted(() => ({
  vendedorFindMany: vi.fn(),
  oportunidadeGroupBy: vi.fn(),
  oportunidadeFindMany: vi.fn(),
  interacaoFindMany: vi.fn(),
  liquidacaoFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vendedor: { findMany: dobles.vendedorFindMany },
    oportunidadeVenda: { groupBy: dobles.oportunidadeGroupBy, findMany: dobles.oportunidadeFindMany },
    interacaoPontoFocal: { findMany: dobles.interacaoFindMany },
    liquidacao: { findMany: dobles.liquidacaoFindMany },
  },
}));

import { carregarIndicadoresSemanais } from "./indicadores-db";
import { semanaAnterior, semanaDe } from "./indicadores-semanais";

const SEMANA = semanaDe(new Date("2026-10-21T12:00:00-03:00")); // 19/10 a 25/10
const ANTERIOR = semanaAnterior(SEMANA); // 12/10 a 18/10

/** Decimal do Prisma: só expõe toString. */
const decimal = (texto: string) => ({ toString: () => texto });

interface ArgsGroupBy {
  by: string[];
  where: { atualizadoEm: { gte?: Date; lt: Date } };
}

/** Responde as agregações conforme a janela pedida (semana escolhida x anterior). */
function responderGroupBy(porJanela: {
  ativasAtual?: unknown[];
  ativasAnterior?: unknown[];
  movimentosAtual?: unknown[];
  movimentosAnterior?: unknown[];
}) {
  dobles.oportunidadeGroupBy.mockImplementation(async (args: ArgsGroupBy) => {
    const atual = args.where.atualizadoEm.lt.getTime() === SEMANA.fim.getTime();
    if (args.by.length === 1) return (atual ? porJanela.ativasAtual : porJanela.ativasAnterior) ?? [];
    return (atual ? porJanela.movimentosAtual : porJanela.movimentosAnterior) ?? [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.vendedorFindMany.mockResolvedValue([]);
  dobles.oportunidadeGroupBy.mockResolvedValue([]);
  dobles.oportunidadeFindMany.mockResolvedValue([]);
  dobles.interacaoFindMany.mockResolvedValue([]);
  dobles.liquidacaoFindMany.mockResolvedValue([]);
});

describe("carregarIndicadoresSemanais — o que pede ao banco", () => {
  it("faz um número fixo de consultas, não importa quantos consultores existam", async () => {
    const muitos = Array.from({ length: 60 }, (_, i) => ({ id: `v${i}`, nome: `Consultor ${i}`, ativo: true }));
    dobles.vendedorFindMany.mockResolvedValue(muitos);
    dobles.interacaoFindMany.mockResolvedValue(
      muitos.map((_, i) => ({
        ataId: `a${i}`,
        criadoEm: new Date("2026-10-20T10:00:00-03:00"),
        pontoFocal: { entidadeAlvoId: `m${i}` },
      })),
    );

    await carregarIndicadoresSemanais(SEMANA);

    expect(dobles.vendedorFindMany).toHaveBeenCalledTimes(1);
    expect(dobles.oportunidadeGroupBy).toHaveBeenCalledTimes(4); // ativas e movimentos, nas duas semanas
    expect(dobles.interacaoFindMany).toHaveBeenCalledTimes(1);
    expect(dobles.liquidacaoFindMany).toHaveBeenCalledTimes(1);
    expect(dobles.oportunidadeFindMany).toHaveBeenCalledTimes(1); // donos das negociações, em lote
  });

  it("sem registros de contato, nem busca os donos das negociações", async () => {
    await carregarIndicadoresSemanais(SEMANA);
    expect(dobles.oportunidadeFindMany).not.toHaveBeenCalled();
  });

  it("negociações ativas: foto do estágio de hoje, sem prazo vencido, até o fim de cada semana", async () => {
    await carregarIndicadoresSemanais(SEMANA);
    const chamadas = dobles.oportunidadeGroupBy.mock.calls.map((c) => c[0]).filter((a) => a.by.length === 1);
    expect(chamadas).toHaveLength(2);
    expect(chamadas).toContainEqual({
      by: ["vendedorId"],
      where: { estagio: "em_negociacao", expiradaEm: null, atualizadoEm: { lt: SEMANA.fim } },
      _count: { _all: true },
    });
    expect(chamadas).toContainEqual({
      by: ["vendedorId"],
      where: { estagio: "em_negociacao", expiradaEm: null, atualizadoEm: { lt: ANTERIOR.fim } },
      _count: { _all: true },
    });
  });

  it("avanços e adesões: última alteração dentro de cada semana, só em negociação ou aderiu, sem expiradas", async () => {
    await carregarIndicadoresSemanais(SEMANA);
    const chamadas = dobles.oportunidadeGroupBy.mock.calls.map((c) => c[0]).filter((a) => a.by.length === 2);
    expect(chamadas).toHaveLength(2);
    expect(chamadas).toContainEqual({
      by: ["vendedorId", "estagio"],
      where: {
        expiradaEm: null,
        estagio: { in: ["em_negociacao", "aderiu"] },
        atualizadoEm: { gte: SEMANA.inicio, lt: SEMANA.fim },
      },
      _count: { _all: true },
      _sum: { valorAderido: true },
    });
    expect(chamadas).toContainEqual(
      expect.objectContaining({ where: expect.objectContaining({ atualizadoEm: { gte: ANTERIOR.inicio, lt: ANTERIOR.fim } }) }),
    );
  });

  it("contatos: lê as duas semanas de uma vez, só registros ligados a uma ata", async () => {
    await carregarIndicadoresSemanais(SEMANA);
    expect(dobles.interacaoFindMany).toHaveBeenCalledWith({
      where: { ataId: { not: null }, criadoEm: { gte: ANTERIOR.inicio, lt: SEMANA.fim } },
      select: { ataId: true, criadoEm: true, pontoFocal: { select: { entidadeAlvoId: true } } },
    });
  });

  it("liquidações: data da liquidação (só-data) pelos dias em UTC; recebimento (instante) pelo horário de Brasília", async () => {
    await carregarIndicadoresSemanais(SEMANA);
    const args = dobles.liquidacaoFindMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([
      { dataLiquidacao: { gte: ANTERIOR.diaInicio, lt: SEMANA.diaFim } },
      { statusCobranca: "recebida", dataRecebimento: { gte: ANTERIOR.inicio, lt: SEMANA.fim } },
    ]);
    expect(SEMANA.diaInicio.toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(SEMANA.inicio.toISOString()).toBe("2026-10-19T03:00:00.000Z");
    expect(args.where.oportunidade).toBeUndefined();
  });

  it("visão do gestor: nenhuma consulta é filtrada por consultor", async () => {
    dobles.interacaoFindMany.mockResolvedValue([
      { ataId: "a1", criadoEm: new Date("2026-10-20T10:00:00-03:00"), pontoFocal: { entidadeAlvoId: "m1" } },
    ]);
    await carregarIndicadoresSemanais(SEMANA);
    expect(dobles.vendedorFindMany.mock.calls[0][0].where).toEqual({});
    for (const [args] of dobles.oportunidadeGroupBy.mock.calls) expect(args.where).not.toHaveProperty("vendedorId");
    expect(dobles.interacaoFindMany.mock.calls[0][0].where).not.toHaveProperty("ata");
    expect(dobles.oportunidadeFindMany.mock.calls[0][0].where).not.toHaveProperty("vendedorId");
  });
});

describe("carregarIndicadoresSemanais — filtro por consultor", () => {
  it("TODAS as consultas saem filtradas pelo consultor pedido", async () => {
    dobles.vendedorFindMany.mockResolvedValue([{ id: "v1", nome: "Ana", ativo: true }]);
    dobles.interacaoFindMany.mockResolvedValue([
      { ataId: "a1", criadoEm: new Date("2026-10-20T10:00:00-03:00"), pontoFocal: { entidadeAlvoId: "m1" } },
    ]);

    await carregarIndicadoresSemanais(SEMANA, { vendedorId: "v1" });

    expect(dobles.vendedorFindMany.mock.calls[0][0].where).toEqual({ id: "v1" });
    expect(dobles.oportunidadeGroupBy).toHaveBeenCalledTimes(4);
    for (const [args] of dobles.oportunidadeGroupBy.mock.calls) expect(args.where.vendedorId).toBe("v1");
    expect(dobles.interacaoFindMany.mock.calls[0][0].where.ata).toEqual({ oportunidades: { some: { vendedorId: "v1" } } });
    expect(dobles.liquidacaoFindMany.mock.calls[0][0].where.oportunidade).toEqual({ vendedorId: "v1" });
    expect(dobles.oportunidadeFindMany.mock.calls[0][0].where.vendedorId).toBe("v1");
  });

  it("um id vazio continua sendo filtro (nunca vira 'todos os consultores')", async () => {
    await carregarIndicadoresSemanais(SEMANA, { vendedorId: "" });
    expect(dobles.vendedorFindMany.mock.calls[0][0].where).toEqual({ id: "" });
    for (const [args] of dobles.oportunidadeGroupBy.mock.calls) expect(args.where.vendedorId).toBe("");
    expect(dobles.liquidacaoFindMany.mock.calls[0][0].where.oportunidade).toEqual({ vendedorId: "" });
  });

  it("falha fechada: { vendedorId: undefined } ou nulo NUNCA vira a visão de todos (nem consulta o banco)", async () => {
    await expect(carregarIndicadoresSemanais(SEMANA, { vendedorId: undefined })).rejects.toThrow(TypeError);
    await expect(
      carregarIndicadoresSemanais(SEMANA, { vendedorId: null as unknown as string }),
    ).rejects.toThrow(TypeError);
    expect(dobles.vendedorFindMany).not.toHaveBeenCalled();
    expect(dobles.oportunidadeGroupBy).not.toHaveBeenCalled();
    expect(dobles.interacaoFindMany).not.toHaveBeenCalled();
    expect(dobles.liquidacaoFindMany).not.toHaveBeenCalled();
    // Sem a chave (visão do gestor) continua valendo.
    await expect(carregarIndicadoresSemanais(SEMANA, {})).resolves.toBeDefined();
  });

  it("o resumo só traz o consultor pedido, mesmo se o banco devolver linhas de outros", async () => {
    dobles.vendedorFindMany.mockResolvedValue([{ id: "v1", nome: "Ana", ativo: true }]);
    responderGroupBy({
      ativasAtual: [
        { vendedorId: "v1", _count: { _all: 2 } },
        { vendedorId: "v2", _count: { _all: 50 } },
      ],
    });
    const resumo = await carregarIndicadoresSemanais(SEMANA, { vendedorId: "v1" });
    expect(resumo.consultores.map((c) => c.consultorId)).toEqual(["v1"]);
    expect(resumo.total.atual.negociacoesAtivas).toBe(2);
  });
});

describe("carregarIndicadoresSemanais — o resumo montado", () => {
  it("combina contagens, valores e comissões das duas semanas", async () => {
    dobles.vendedorFindMany.mockResolvedValue([
      { id: "v1", nome: "Ana Lima", ativo: true },
      { id: "v2", nome: "Bia Souza", ativo: true },
    ]);
    responderGroupBy({
      ativasAtual: [
        { vendedorId: "v1", _count: { _all: 4 } },
        { vendedorId: "v2", _count: { _all: 1 } },
      ],
      ativasAnterior: [{ vendedorId: "v1", _count: { _all: 3 } }],
      movimentosAtual: [
        { vendedorId: "v1", estagio: "em_negociacao", _count: { _all: 2 }, _sum: { valorAderido: null } },
        { vendedorId: "v1", estagio: "aderiu", _count: { _all: 1 }, _sum: { valorAderido: decimal("250000.50") } },
      ],
      movimentosAnterior: [{ vendedorId: "v2", estagio: "aderiu", _count: { _all: 1 }, _sum: { valorAderido: decimal("80000.00") } }],
    });
    dobles.interacaoFindMany.mockResolvedValue([
      // semana escolhida: dois do v1 (a1/m1) e um do v2 (a1/m2)
      { ataId: "a1", criadoEm: new Date("2026-10-20T10:00:00-03:00"), pontoFocal: { entidadeAlvoId: "m1" } },
      { ataId: "a1", criadoEm: new Date("2026-10-23T10:00:00-03:00"), pontoFocal: { entidadeAlvoId: "m1" } },
      { ataId: "a1", criadoEm: new Date("2026-10-22T10:00:00-03:00"), pontoFocal: { entidadeAlvoId: "m2" } },
      // semana anterior: um do v1
      { ataId: "a1", criadoEm: new Date("2026-10-14T10:00:00-03:00"), pontoFocal: { entidadeAlvoId: "m1" } },
      // sem negociação conhecida: não é de ninguém
      { ataId: "a9", criadoEm: new Date("2026-10-20T10:00:00-03:00"), pontoFocal: { entidadeAlvoId: "m9" } },
    ]);
    dobles.oportunidadeFindMany.mockResolvedValue([
      { ataId: "a1", entidadeAlvoId: "m1", vendedorId: "v1" },
      { ataId: "a1", entidadeAlvoId: "m2", vendedorId: "v2" },
    ]);
    dobles.liquidacaoFindMany.mockResolvedValue([
      {
        // segunda 19/10 (só-data): é da semana escolhida, não da anterior; recebida na quinta.
        valorLiquidado: decimal("100000.00"),
        dataLiquidacao: new Date("2026-10-19T00:00:00Z"),
        statusCobranca: "recebida",
        dataRecebimento: new Date("2026-10-22T14:00:00-03:00"),
        oportunidade: { vendedorId: "v1", percentualComissao: decimal("0.0500") },
      },
      {
        // semana anterior, ainda pendente.
        valorLiquidado: decimal("40000.00"),
        dataLiquidacao: new Date("2026-10-13T00:00:00Z"),
        statusCobranca: "pendente",
        dataRecebimento: null,
        oportunidade: { vendedorId: "v2", percentualComissao: decimal("0.1000") },
      },
      {
        // liquidada em setembro, recebida nesta semana; negociação sem percentual: só o aviso.
        valorLiquidado: decimal("10000.00"),
        dataLiquidacao: new Date("2026-09-10T00:00:00Z"),
        statusCobranca: "recebida",
        dataRecebimento: new Date("2026-10-21T09:00:00-03:00"),
        oportunidade: { vendedorId: "v2", percentualComissao: null },
      },
    ]);

    const r = await carregarIndicadoresSemanais(SEMANA);

    const ana = r.consultores.find((c) => c.consultorId === "v1")!;
    const bia = r.consultores.find((c) => c.consultorId === "v2")!;
    expect(r.consultores.map((c) => c.nome)).toEqual(["Ana Lima", "Bia Souza"]);

    expect(ana.atual.contatos).toBe(2);
    expect(ana.anterior.contatos).toBe(1);
    expect(bia.atual.contatos).toBe(1);

    expect(ana.atual.negociacoesAtivas).toBe(4);
    expect(ana.anterior.negociacoesAtivas).toBe(3);
    expect(ana.variacao.negociacoesAtivas).toEqual({ diferenca: 1, percentual: 33.3 });

    expect(ana.atual.avancaram).toBe(3);
    expect(ana.atual.adesoes).toBe(1);
    expect(ana.atual.valorAderido).toBe(250_000.5);
    expect(bia.anterior.adesoes).toBe(1);
    expect(bia.anterior.valorAderido).toBe(80_000);
    expect(bia.variacao.adesoes).toEqual({ diferenca: -1, percentual: -100 });

    expect(ana.atual.comissaoLiquidada).toBe(5000);
    expect(ana.anterior.comissaoLiquidada).toBe(0);
    expect(ana.atual.comissaoRecebida).toBe(5000);
    expect(bia.anterior.comissaoLiquidada).toBe(4000);
    expect(bia.atual.comissaoLiquidada).toBe(0);
    expect(r.liquidacoesSemPercentual).toBe(1);

    expect(r.total.atual).toEqual({
      contatos: 3,
      negociacoesAtivas: 5,
      avancaram: 3,
      adesoes: 1,
      valorAderido: 250_000.5,
      comissaoLiquidada: 5000,
      comissaoRecebida: 5000,
    });
    expect(r.total.anterior.adesoes).toBe(1);
    expect(r.semana).toBe(SEMANA);
    expect(r.anterior.segunda).toBe("2026-10-12");
  });

  it("sem nenhum dado, devolve zeros (e a variação não divide por zero)", async () => {
    dobles.vendedorFindMany.mockResolvedValue([{ id: "v1", nome: "Ana", ativo: true }]);
    const r = await carregarIndicadoresSemanais(SEMANA);
    expect(r.total.atual.comissaoLiquidada).toBe(0);
    expect(r.total.variacao.contatos).toEqual({ diferenca: 0, percentual: 0 });
    expect(r.liquidacoesSemPercentual).toBe(0);
  });

  it("consultor inativo sem nenhum número fica fora da tabela", async () => {
    dobles.vendedorFindMany.mockResolvedValue([
      { id: "v1", nome: "Ana", ativo: true },
      { id: "v2", nome: "Antigo", ativo: false },
    ]);
    const r = await carregarIndicadoresSemanais(SEMANA);
    expect(r.consultores.map((c) => c.nome)).toEqual(["Ana"]);
  });
});
