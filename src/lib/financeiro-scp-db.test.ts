import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A camada de banco do financeiro da SCP, testada com o Prisma trocado por
 * dublês: o que se confere é o que ela pede ao banco (janelas, limites, número
 * fixo de consultas) e como monta receita, despesas e sócios com o que volta.
 * Só dados fictícios ("Sócio A", "Sócio B", 60% e 40%, valores redondos de teste).
 */
const dobles = vi.hoisted(() => ({
  socioFindMany: vi.fn(),
  despesaFindMany: vi.fn(),
  despesaGroupBy: vi.fn(),
  liquidacaoFindMany: vi.fn(),
  liquidacaoCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    socioScp: { findMany: dobles.socioFindMany },
    despesaScp: { findMany: dobles.despesaFindMany, groupBy: dobles.despesaGroupBy },
    liquidacao: { findMany: dobles.liquidacaoFindMany, count: dobles.liquidacaoCount },
  },
}));

import {
  carregarFinanceiroDoPeriodo,
  LIMITE_DESPESAS_DEMONSTRATIVO,
  LIMITE_DESPESAS_LISTA,
  LIMITE_LIQUIDACOES,
} from "./financeiro-scp-db";
import { periodoMensalDeTexto } from "./financeiro-scp";

const OUTUBRO = periodoMensalDeTexto("2026-10")!;
const DIA_MS = 86_400_000;

/** Decimal do Prisma: só expõe toString. */
const decimal = (texto: string) => ({ toString: () => texto });

function despesaDoBanco(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: `desp${i}`,
    data: new Date("2026-10-05T00:00:00.000Z"),
    descricao: `Despesa de teste ${i}`,
    categoria: null,
    valor: decimal("10.00"),
    pagaPorSocioId: null,
    ...extra,
  };
}

function liquidacaoDoBanco(
  id: string,
  extra: {
    oportunidadeId?: string;
    valor?: string;
    percentual?: string | null;
    recebimento?: string | null;
    status?: string;
    municipio?: string | null;
    nome?: string;
    uf?: string | null;
    ata?: string;
  } = {},
) {
  return {
    id,
    oportunidadeId: extra.oportunidadeId ?? "op1",
    valorLiquidado: decimal(extra.valor ?? "10000.00"),
    statusCobranca: extra.status ?? "recebida",
    dataRecebimento: extra.recebimento === null ? null : new Date(extra.recebimento ?? "2026-10-15T15:00:00.000Z"),
    oportunidade: {
      percentualComissao: extra.percentual === null ? null : decimal(extra.percentual ?? "0.0500"),
      ata: { numero: extra.ata ?? "ATA-TESTE-1" },
      entidadeAlvo: {
        nome: extra.nome ?? "Prefeitura de Teste",
        municipio: extra.municipio === undefined ? "Município de Teste" : extra.municipio,
        uf: extra.uf === undefined ? "GO" : extra.uf,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.socioFindMany.mockResolvedValue([]);
  dobles.despesaFindMany.mockResolvedValue([]);
  dobles.despesaGroupBy.mockResolvedValue([]);
  dobles.liquidacaoFindMany.mockResolvedValue([]);
  dobles.liquidacaoCount.mockResolvedValue(0);
});

describe("consultas pedidas ao banco", () => {
  it("faz um número fixo de consultas (cinco), uma de cada, não importa o tamanho dos dados", async () => {
    await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(dobles.socioFindMany).toHaveBeenCalledTimes(1);
    expect(dobles.despesaFindMany).toHaveBeenCalledTimes(1);
    expect(dobles.despesaGroupBy).toHaveBeenCalledTimes(1);
    expect(dobles.liquidacaoFindMany).toHaveBeenCalledTimes(1);
    expect(dobles.liquidacaoCount).toHaveBeenCalledTimes(1);
  });

  it("despesas: filtra o mês pela régua de dia só-data (gte início, lt dia seguinte ao fim) e pede uma a mais que o limite", async () => {
    await carregarFinanceiroDoPeriodo(OUTUBRO);
    const onde = { data: { gte: OUTUBRO.inicio, lt: OUTUBRO.fimExclusivo } };
    expect(dobles.despesaFindMany.mock.calls[0][0].where).toEqual(onde);
    expect(dobles.despesaFindMany.mock.calls[0][0].take).toBe(LIMITE_DESPESAS_LISTA + 1);
    expect(dobles.despesaGroupBy.mock.calls[0][0].where).toEqual(onde);
    expect(dobles.despesaGroupBy.mock.calls[0][0].by).toEqual(["data"]);
    // 1 de novembro (meia-noite UTC) fica de fora; 31 de outubro entra.
    expect(OUTUBRO.fimExclusivo.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("despesas: a lista vem da data mais antiga para a mais recente e, no mesmo dia, na ordem do lançamento", async () => {
    await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(dobles.despesaFindMany.mock.calls[0][0].orderBy).toEqual([{ data: "asc" }, { criadoEm: "asc" }]);
  });

  it("comissões: só as recebidas, com a janela do mês alargada em um dia nas duas pontas (o dia certo é decidido pela regra pura)", async () => {
    await carregarFinanceiroDoPeriodo(OUTUBRO);
    const { where, take } = dobles.liquidacaoFindMany.mock.calls[0][0];
    expect(where.statusCobranca).toBe("recebida");
    expect(where.dataRecebimento.gte.getTime()).toBe(OUTUBRO.inicio.getTime() - DIA_MS);
    expect(where.dataRecebimento.lt.getTime()).toBe(OUTUBRO.fimExclusivo.getTime() + DIA_MS);
    expect(take).toBe(LIMITE_LIQUIDACOES + 1);
  });

  it("conta (em qualquer época) as recebidas sem data de recebimento", async () => {
    dobles.liquidacaoCount.mockResolvedValue(3);
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(dobles.liquidacaoCount).toHaveBeenCalledWith({ where: { statusCobranca: "recebida", dataRecebimento: null } });
    expect(r.receita.semDataRecebimento).toBe(3);
  });

  it("sócios: pede o histórico de participações em ordem de início e a ordem de listagem", async () => {
    await carregarFinanceiroDoPeriodo(OUTUBRO);
    const args = dobles.socioFindMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ ordem: "asc" }, { nome: "asc" }]);
    expect(args.select.participacoes.orderBy).toEqual({ vigenteDesde: "asc" });
    expect(args.take).toBeGreaterThan(0);
  });
});

describe("sócios e participações", () => {
  it("monta o sócio com os percentuais como fração (número) e as datas só-dia", async () => {
    dobles.socioFindMany.mockResolvedValue([
      {
        id: "a",
        nome: "Sócio A",
        tipo: "ostensivo",
        ativo: true,
        participacoes: [
          {
            id: "p1",
            socioId: "a",
            percentual: decimal("0.6000"),
            vigenteDesde: new Date("2026-01-01T00:00:00.000Z"),
            vigenteAte: null,
          },
        ],
      },
    ]);
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.socios).toEqual([
      {
        id: "a",
        nome: "Sócio A",
        tipo: "ostensivo",
        ativo: true,
        participacoes: [
          {
            id: "p1",
            socioId: "a",
            percentual: 0.6,
            vigenteDesde: new Date("2026-01-01T00:00:00.000Z"),
            vigenteAte: null,
          },
        ],
      },
    ]);
    expect(r.periodo).toBe(OUTUBRO);
  });

  it("percentual ilegível no banco lança erro (partilha errada não sai em silêncio)", async () => {
    dobles.socioFindMany.mockResolvedValue([
      {
        id: "a",
        nome: "Sócio A",
        tipo: "ostensivo",
        ativo: true,
        participacoes: [{ id: "p1", socioId: "a", percentual: decimal("abc"), vigenteDesde: new Date(), vigenteAte: null }],
      },
    ]);
    await expect(carregarFinanceiroDoPeriodo(OUTUBRO)).rejects.toThrow(/Percentual inválido/);
  });
});

describe("despesas", () => {
  it("lista até o limite, avisa que cortou e resolve o nome de quem pagou (id sem sócio fica sem nome)", async () => {
    dobles.socioFindMany.mockResolvedValue([{ id: "a", nome: "Sócio A", tipo: "participante", ativo: true, participacoes: [] }]);
    const linhas = Array.from({ length: LIMITE_DESPESAS_LISTA + 1 }, (_, i) =>
      despesaDoBanco(i, i === 0 ? { pagaPorSocioId: "a" } : i === 1 ? { pagaPorSocioId: "removido" } : {}),
    );
    dobles.despesaFindMany.mockResolvedValue(linhas);
    dobles.despesaGroupBy.mockResolvedValue([
      { data: new Date("2026-10-05T00:00:00.000Z"), _sum: { valor: decimal("2010.00") }, _count: { _all: 201 } },
    ]);

    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.despesas.lista).toHaveLength(LIMITE_DESPESAS_LISTA);
    expect(r.despesas.listaTruncada).toBe(true);
    expect(r.despesas.lista[0]).toMatchObject({ id: "desp0", centavos: 1000, pagaPorSocioId: "a", pagaPorNome: "Sócio A" });
    expect(r.despesas.lista[1]).toMatchObject({ pagaPorSocioId: "removido", pagaPorNome: null });
    expect(r.despesas.lista[2]).toMatchObject({ pagaPorSocioId: null, pagaPorNome: null });
    // Os totais contam TODAS (vêm da soma por dia no banco), não só as 200 da lista.
    expect(r.despesas.quantidade).toBe(201);
    expect(r.despesas.centavos).toBe(201_000);
  });

  it("até o limite exato não marca como cortada", async () => {
    dobles.despesaFindMany.mockResolvedValue(Array.from({ length: LIMITE_DESPESAS_LISTA }, (_, i) => despesaDoBanco(i)));
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.despesas.listaTruncada).toBe(false);
    expect(r.despesas.lista).toHaveLength(LIMITE_DESPESAS_LISTA);
  });

  it("o demonstrativo pode pedir uma lista maior (e a consulta pede uma a mais que isso)", async () => {
    await carregarFinanceiroDoPeriodo(OUTUBRO, { limiteDespesas: LIMITE_DESPESAS_DEMONSTRATIVO });
    expect(dobles.despesaFindMany.mock.calls[0][0].take).toBe(LIMITE_DESPESAS_DEMONSTRATIVO + 1);
  });

  it("soma por dia em centavos inteiros, sem erro de ponto flutuante (0,10 + 0,20 não vira 0,30000000000000004)", async () => {
    dobles.despesaGroupBy.mockResolvedValue([
      { data: new Date("2026-10-05T00:00:00.000Z"), _sum: { valor: decimal("0.10") }, _count: { _all: 1 } },
      { data: new Date("2026-10-06T00:00:00.000Z"), _sum: { valor: decimal("0.20") }, _count: { _all: 1 } },
      { data: new Date("2026-10-07T00:00:00.000Z"), _sum: { valor: null }, _count: { _all: 0 } },
    ]);
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.despesas.porDia.map((l) => l.centavos)).toEqual([10, 20, 0]);
    expect(r.despesas.centavos).toBe(30);
    expect(r.despesas.quantidade).toBe(2);
  });

  it("mês sem despesa: tudo zerado", async () => {
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.despesas).toEqual({ lista: [], listaTruncada: false, quantidade: 0, centavos: 0, porDia: [] });
  });
});

describe("receita (comissão recebida)", () => {
  it("soma as comissões do mês, arredondando liquidação a liquidação (meio centavo sobe) e pelo dia de Brasília", async () => {
    dobles.liquidacaoFindMany.mockResolvedValue([
      // R$ 10.000,00 x 5% = R$ 500,00 (15/10).
      liquidacaoDoBanco("l1", { valor: "10000.00", percentual: "0.0500", recebimento: "2026-10-15T15:00:00.000Z" }),
      // R$ 2.000,10 x 5% = 100,005 -> 100,01 (meio centavo sobe). 22h30 de 31/10 em Brasília = 01h30 UTC de 01/11: ainda é outubro.
      liquidacaoDoBanco("l2", { valor: "2000.10", percentual: "0.0500", recebimento: "2026-11-01T01:30:00.000Z" }),
      // 01h00 de 01/11 em Brasília: já é novembro, fora (mas estava dentro da janela alargada da consulta).
      liquidacaoDoBanco("l3", { valor: "99999.00", recebimento: "2026-11-01T04:00:00.000Z" }),
      // 20h30 de 30/09 em Brasília = 23h30 UTC de 30/09: setembro, fora (estava na janela alargada da consulta).
      liquidacaoDoBanco("l4", { valor: "99999.00", recebimento: "2026-09-30T23:30:00.000Z" }),
    ]);
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.receita.centavos).toBe(50_000 + 10_001);
    expect(r.receita.quantidade).toBe(2);
    expect(r.receita.lancamentos).toEqual([
      { data: new Date("2026-10-15T00:00:00.000Z"), centavos: 50_000 },
      { data: new Date("2026-10-31T00:00:00.000Z"), centavos: 10_001 },
    ]);
  });

  it("agrupa por oportunidade: município e ata pelo código, recebimentos, valor liquidado e comissão (cada uma já arredondada)", async () => {
    dobles.liquidacaoFindMany.mockResolvedValue([
      liquidacaoDoBanco("l1", { oportunidadeId: "opB", valor: "10000.00", ata: "ATA-B", municipio: "Zeta do Teste" }),
      liquidacaoDoBanco("l2", { oportunidadeId: "opA", valor: "2000.10", ata: "ATA-A", municipio: "Alfa do Teste", uf: "MG" }),
      liquidacaoDoBanco("l3", { oportunidadeId: "opA", valor: "2000.10", ata: "ATA-A", municipio: "Alfa do Teste", uf: "MG" }),
    ]);
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.receita.porOportunidade).toEqual([
      {
        oportunidadeId: "opA",
        ataNumero: "ATA-A",
        entidade: "Alfa do Teste",
        uf: "MG",
        recebimentos: 2,
        valorLiquidadoCentavos: 400_020,
        percentual: 0.05,
        comissaoCentavos: 20_002, // 10.001 + 10.001: arredonda cada uma, depois soma
      },
      {
        oportunidadeId: "opB",
        ataNumero: "ATA-B",
        entidade: "Zeta do Teste",
        uf: "GO",
        recebimentos: 1,
        valorLiquidadoCentavos: 1_000_000,
        percentual: 0.05,
        comissaoCentavos: 50_000,
      },
    ]);
  });

  it("ordena as oportunidades pelo município primeiro e só depois pelo número da ata (comparação numérica)", async () => {
    dobles.liquidacaoFindMany.mockResolvedValue([
      liquidacaoDoBanco("l1", { oportunidadeId: "op1", ata: "ATA-A", municipio: "Beta do Teste" }),
      liquidacaoDoBanco("l2", { oportunidadeId: "op2", ata: "ATA-Z", municipio: "Alfa do Teste" }),
      liquidacaoDoBanco("l3", { oportunidadeId: "op3", ata: "ATA-10", municipio: "Alfa do Teste" }),
      liquidacaoDoBanco("l4", { oportunidadeId: "op4", ata: "ATA-9", municipio: "Alfa do Teste" }),
    ]);
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.receita.porOportunidade.map((o) => `${o.entidade} / ${o.ataNumero}`)).toEqual([
      "Alfa do Teste / ATA-9",
      "Alfa do Teste / ATA-10",
      "Alfa do Teste / ATA-Z",
      "Beta do Teste / ATA-A",
    ]);
  });

  it("entidade sem município usa o nome do órgão, e nunca traz nome de pessoa (só município, UF e código da ata)", async () => {
    dobles.liquidacaoFindMany.mockResolvedValue([
      liquidacaoDoBanco("l1", { municipio: null, nome: "Órgão Estadual de Teste", uf: null }),
    ]);
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.receita.porOportunidade[0]).toMatchObject({ entidade: "Órgão Estadual de Teste", uf: null });
    expect(Object.keys(r.receita.porOportunidade[0]).sort()).toEqual(
      [
        "ataNumero",
        "comissaoCentavos",
        "entidade",
        "oportunidadeId",
        "percentual",
        "recebimentos",
        "uf",
        "valorLiquidadoCentavos",
      ].sort(),
    );
  });

  it("oportunidade sem percentual entra com 0 e é contada para o aviso", async () => {
    dobles.liquidacaoFindMany.mockResolvedValue([liquidacaoDoBanco("l1", { percentual: null })]);
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.receita.semPercentual).toBe(1);
    expect(r.receita.centavos).toBe(0);
    expect(r.receita.quantidade).toBe(1);
    expect(r.receita.porOportunidade[0]).toMatchObject({ percentual: null, comissaoCentavos: 0 });
  });

  it("liquidação com percentual impossível (5 em vez de 0,05) fica de fora e é contada como inválida, sem derrubar a página", async () => {
    dobles.liquidacaoFindMany.mockResolvedValue([
      liquidacaoDoBanco("l1", { percentual: "5.0000" }),
      liquidacaoDoBanco("l2", { valor: "1000.00", percentual: "0.1000" }),
    ]);
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.receita.invalidas).toBe(1);
    expect(r.receita.centavos).toBe(10_000);
    expect(r.receita.quantidade).toBe(1);
    expect(r.receita.porOportunidade).toHaveLength(1);
  });

  it("liquidação inválida fora do mês não conta como inválida (o mês não é afetado)", async () => {
    dobles.liquidacaoFindMany.mockResolvedValue([
      liquidacaoDoBanco("l1", { percentual: "5.0000", recebimento: "2026-11-01T04:00:00.000Z" }),
    ]);
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.receita.invalidas).toBe(0);
  });

  it("só recebida conta: cobrada e pendente que escaparem da consulta são ignoradas pela regra", async () => {
    dobles.liquidacaoFindMany.mockResolvedValue([
      liquidacaoDoBanco("l1", { status: "cobrada" }),
      liquidacaoDoBanco("l2", { status: "pendente" }),
    ]);
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.receita.quantidade).toBe(0);
    expect(r.receita.centavos).toBe(0);
  });

  it("passou do limite de segurança: marca como truncada (a tela não calcula partilha) e soma só até o limite", async () => {
    dobles.liquidacaoFindMany.mockResolvedValue(
      Array.from({ length: LIMITE_LIQUIDACOES + 1 }, (_, i) => liquidacaoDoBanco(`l${i}`, { valor: "100.00", percentual: "0.1000" })),
    );
    const r = await carregarFinanceiroDoPeriodo(OUTUBRO);
    expect(r.receita.truncada).toBe(true);
    expect(r.receita.quantidade).toBe(LIMITE_LIQUIDACOES);
  });

  it("outro erro (não de valor) não é engolido", async () => {
    dobles.liquidacaoFindMany.mockRejectedValue(new Error("conexão caiu"));
    await expect(carregarFinanceiroDoPeriodo(OUTUBRO)).rejects.toThrow("conexão caiu");
  });

  it("dado quebrado que não é de valor (TypeError ao montar a linha) não vira 'inválida' em silêncio", async () => {
    const quebrada = liquidacaoDoBanco("l1");
    (quebrada.oportunidade as { ata: unknown }).ata = null;
    dobles.liquidacaoFindMany.mockResolvedValue([quebrada]);
    await expect(carregarFinanceiroDoPeriodo(OUTUBRO)).rejects.toThrow(TypeError);
  });
});
