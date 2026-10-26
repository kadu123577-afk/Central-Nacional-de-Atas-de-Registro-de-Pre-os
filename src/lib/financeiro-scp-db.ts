import { prisma } from "@/lib/prisma";
import {
  receitaRecebidaNoPeriodo,
  reaisParaCentavos,
  type Lancamento,
  type ParticipacaoVigencia,
  type PeriodoDias,
  type ValorDecimal,
} from "./financeiro-scp";

/**
 * Consultas do financeiro da SCP (2026-10-26, Projeto RNA etapa 7). Só leitura:
 * as escritas (sócios, participações, despesas) ficam nas server actions de
 * src/app/admin/financeiro-scp/actions.ts.
 *
 * IMPORTANTE: este arquivo NÃO confere acesso. Quem chama (page.tsx e as
 * actions) já passou por exigirAcessoFinanceiro() (src/lib/acesso-financeiro.ts)
 * ANTES de chegar aqui. Nenhum dado real mora no código: tudo vem do banco.
 *
 * São consultas em lote, de número fixo (não crescem com o tamanho dos dados):
 * 1) os sócios com todo o histórico de participações; 2) as despesas do período
 * (a lista, com limite); 3) as despesas do período somadas por dia (o total é
 * exato mesmo com a lista cortada); 4) as comissões recebidas no período; 5) a
 * contagem das recebidas sem data de recebimento.
 */

/** Quantas despesas a lista da tela mostra (os totais sempre contam todas). */
export const LIMITE_DESPESAS_LISTA = 200;
/** A lista do demonstrativo impresso é maior: ele deve trazer tudo o que couber. */
export const LIMITE_DESPESAS_DEMONSTRATIVO = 1000;
/** Segurança da consulta de sócios: uma SCP não chega perto disso. */
export const LIMITE_SOCIOS = 200;
/**
 * Segurança da consulta de comissões recebidas no período. A receita é arredondada
 * liquidação a liquidação, então não dá para somar no banco; se passar do limite,
 * a tela avisa e não calcula a partilha (melhor que um total cortado em silêncio).
 */
export const LIMITE_LIQUIDACOES = 10_000;

const DIA_MS = 86_400_000;

export interface ParticipacaoDados extends ParticipacaoVigencia {
  id: string;
}

export interface SocioDados {
  id: string;
  nome: string;
  /** "ostensivo" | "participante" (texto do banco). */
  tipo: string;
  ativo: boolean;
  /** Da mais antiga para a mais recente. */
  participacoes: ParticipacaoDados[];
}

export interface DespesaDados {
  id: string;
  /** Dia só-data (meia-noite UTC). */
  data: Date;
  descricao: string;
  categoria: string | null;
  centavos: number;
  pagaPorSocioId: string | null;
  /** Nome do sócio, quando o id ainda existe. */
  pagaPorNome: string | null;
}

export interface ReceitaPorOportunidade {
  oportunidadeId: string;
  /** Número da ata (código), nunca o nome de uma pessoa. */
  ataNumero: string;
  /** Município (ou o nome do órgão, quando a entidade não é municipal). */
  entidade: string;
  uf: string | null;
  recebimentos: number;
  valorLiquidadoCentavos: number;
  /** Fração (0.05 = 5%); nulo se a oportunidade não tem percentual. */
  percentual: number | null;
  comissaoCentavos: number;
}

export interface ReceitaDoPeriodo {
  /** Soma das comissões recebidas no período (as liquidações já arredondadas uma a uma). */
  centavos: number;
  /** Uma por liquidação recebida no período, com o dia (Brasília) do recebimento. */
  lancamentos: Lancamento[];
  porOportunidade: ReceitaPorOportunidade[];
  /** Quantas liquidações recebidas entraram na conta. */
  quantidade: number;
  /** Recebidas no período cuja oportunidade não tem percentual: entraram com 0. */
  semPercentual: number;
  /** Recebidas SEM data de recebimento (em qualquer época): não dá para saber o período, ficam de fora. */
  semDataRecebimento: number;
  /** Recebidas com valor ou percentual impossível: ficaram de fora e a receita está incompleta. */
  invalidas: number;
  /** A consulta passou do limite de segurança: a receita está incompleta. */
  truncada: boolean;
}

export interface DespesasDoPeriodo {
  /** Até o limite pedido, da data mais antiga para a mais recente. */
  lista: DespesaDados[];
  /** A lista foi cortada no limite (há mais despesas no período do que as mostradas). */
  listaTruncada: boolean;
  /** Quantas despesas há no período, contando todas. */
  quantidade: number;
  /** Soma de TODAS as despesas do período, em centavos. */
  centavos: number;
  /** Uma linha por dia com despesa, pronta para apurarPorFaixas. */
  porDia: Lancamento[];
}

export interface FinanceiroDoPeriodo {
  periodo: PeriodoDias;
  socios: SocioDados[];
  despesas: DespesasDoPeriodo;
  receita: ReceitaDoPeriodo;
}

/** Decimal(7,4) do banco → fração (número). Lança erro se vier algo que não é número. */
function fracaoDoBanco(valor: ValorDecimal): number {
  const numero = typeof valor === "number" ? valor : Number(String(valor.toString()).trim());
  if (!Number.isFinite(numero)) throw new RangeError("Percentual inválido no banco.");
  return numero;
}

function somaSegura(valores: readonly number[], nome: string): number {
  const soma = valores.reduce((total, v) => total + v, 0);
  if (!Number.isSafeInteger(soma)) throw new RangeError(`${nome}: soma grande demais.`);
  return soma;
}

/**
 * Carrega tudo o que as telas do financeiro precisam para um período (pontas
 * incluídas). `limiteDespesas` só corta a LISTA de despesas; os totais contam todas.
 */
export async function carregarFinanceiroDoPeriodo(
  periodo: PeriodoDias,
  opcoes: { limiteDespesas?: number } = {},
): Promise<FinanceiroDoPeriodo> {
  const limiteDespesas = opcoes.limiteDespesas ?? LIMITE_DESPESAS_LISTA;
  const ondeDespesa = { data: { gte: periodo.inicio, lt: periodo.fimExclusivo } };
  // O recebimento é um instante, e o dia civil é o de Brasília (UTC-3, ou UTC-2 em horário de verão
  // de antes de 2019): a janela da consulta ganha um dia de folga em cada ponta e o dia exato é
  // decidido por receitaRecebidaNoPeriodo, a regra pura.
  const ondeRecebida = {
    statusCobranca: "recebida",
    dataRecebimento: {
      gte: new Date(periodo.inicio.getTime() - DIA_MS),
      lt: new Date(periodo.fimExclusivo.getTime() + DIA_MS),
    },
  };

  const [sociosBanco, despesasBanco, despesasPorDiaBanco, liquidacoesBanco, semDataRecebimento] = await Promise.all([
    prisma.socioScp.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      take: LIMITE_SOCIOS,
      select: {
        id: true,
        nome: true,
        tipo: true,
        ativo: true,
        participacoes: {
          orderBy: { vigenteDesde: "asc" },
          select: { id: true, socioId: true, percentual: true, vigenteDesde: true, vigenteAte: true },
        },
      },
    }),
    prisma.despesaScp.findMany({
      where: ondeDespesa,
      orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
      take: limiteDespesas + 1,
      select: { id: true, data: true, descricao: true, categoria: true, valor: true, pagaPorSocioId: true },
    }),
    prisma.despesaScp.groupBy({
      by: ["data"],
      where: ondeDespesa,
      _sum: { valor: true },
      _count: { _all: true },
    }),
    prisma.liquidacao.findMany({
      where: ondeRecebida,
      orderBy: { dataRecebimento: "asc" },
      take: LIMITE_LIQUIDACOES + 1,
      select: {
        id: true,
        oportunidadeId: true,
        valorLiquidado: true,
        statusCobranca: true,
        dataRecebimento: true,
        oportunidade: {
          select: {
            percentualComissao: true,
            ata: { select: { numero: true } },
            entidadeAlvo: { select: { nome: true, municipio: true, uf: true } },
          },
        },
      },
    }),
    prisma.liquidacao.count({ where: { statusCobranca: "recebida", dataRecebimento: null } }),
  ]);

  // ---- sócios e participações
  const socios: SocioDados[] = sociosBanco.map((s) => ({
    id: s.id,
    nome: s.nome,
    tipo: s.tipo,
    ativo: s.ativo,
    participacoes: s.participacoes.map((p) => ({
      id: p.id,
      socioId: p.socioId,
      percentual: fracaoDoBanco(p.percentual),
      vigenteDesde: p.vigenteDesde,
      vigenteAte: p.vigenteAte,
    })),
  }));
  const nomePorSocio = new Map(socios.map((s) => [s.id, s.nome]));

  // ---- despesas
  const listaTruncada = despesasBanco.length > limiteDespesas;
  const lista: DespesaDados[] = despesasBanco.slice(0, limiteDespesas).map((d) => ({
    id: d.id,
    data: d.data,
    descricao: d.descricao,
    categoria: d.categoria,
    centavos: reaisParaCentavos(d.valor),
    pagaPorSocioId: d.pagaPorSocioId,
    pagaPorNome: d.pagaPorSocioId ? (nomePorSocio.get(d.pagaPorSocioId) ?? null) : null,
  }));
  const porDia: Lancamento[] = despesasPorDiaBanco.map((linha) => ({
    data: linha.data,
    centavos: reaisParaCentavos(linha._sum.valor ?? 0),
  }));
  const despesas: DespesasDoPeriodo = {
    lista,
    listaTruncada,
    quantidade: somaSegura(
      despesasPorDiaBanco.map((linha) => linha._count._all),
      "Despesas",
    ),
    centavos: somaSegura(
      porDia.map((l) => l.centavos),
      "Despesas",
    ),
    porDia,
  };

  // ---- receita (comissão efetivamente recebida)
  const truncada = liquidacoesBanco.length > LIMITE_LIQUIDACOES;
  const lancamentos: Lancamento[] = [];
  const porOportunidade = new Map<string, ReceitaPorOportunidade>();
  let semPercentual = 0;
  let invalidas = 0;
  let quantidade = 0;

  for (const liq of liquidacoesBanco.slice(0, LIMITE_LIQUIDACOES)) {
    const percentualBruto = liq.oportunidade.percentualComissao;
    try {
      // Uma liquidação por vez: a regra pura decide o status, o dia de Brasília, o período e o
      // arredondamento, e o total daqui é exatamente o da regra. Valor ou percentual impossível
      // vira "inválida" (a tela avisa) em vez de derrubar a página.
      const r = receitaRecebidaNoPeriodo(
        [
          {
            valorLiquidado: liq.valorLiquidado,
            percentualComissao: percentualBruto,
            statusCobranca: liq.statusCobranca,
            dataRecebimento: liq.dataRecebimento,
          },
        ],
        periodo,
      );
      if (r.lancamentos.length === 0) continue;

      // Tudo o que pode lançar erro vem antes de mexer nos acumuladores: uma liquidação inválida não entra pela metade.
      const comissao = r.lancamentos[0].centavos;
      const valorCentavos = reaisParaCentavos(liq.valorLiquidado);
      const percentual = percentualBruto == null ? null : fracaoDoBanco(percentualBruto);

      const entidade = liq.oportunidade.entidadeAlvo;
      const atual = porOportunidade.get(liq.oportunidadeId) ?? {
        oportunidadeId: liq.oportunidadeId,
        ataNumero: liq.oportunidade.ata.numero,
        entidade: entidade.municipio?.trim() || entidade.nome,
        uf: entidade.uf,
        recebimentos: 0,
        valorLiquidadoCentavos: 0,
        percentual,
        comissaoCentavos: 0,
      };
      atual.recebimentos += 1;
      atual.valorLiquidadoCentavos += valorCentavos;
      atual.comissaoCentavos += comissao;
      porOportunidade.set(liq.oportunidadeId, atual);

      lancamentos.push(r.lancamentos[0]);
      semPercentual += r.semPercentual;
      quantidade += 1;
    } catch (erro) {
      if (!(erro instanceof RangeError)) throw erro;
      invalidas += 1;
    }
  }

  const receita: ReceitaDoPeriodo = {
    centavos: somaSegura(
      lancamentos.map((l) => l.centavos),
      "Receita",
    ),
    lancamentos,
    porOportunidade: Array.from(porOportunidade.values()).sort(
      (a, b) =>
        a.entidade.localeCompare(b.entidade, "pt-BR") ||
        a.ataNumero.localeCompare(b.ataNumero, "pt-BR", { numeric: true }),
    ),
    quantidade,
    semPercentual,
    semDataRecebimento,
    invalidas,
    truncada,
  };

  return { periodo, socios, despesas, receita };
}
