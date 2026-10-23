import { prisma } from "@/lib/prisma";
import { paraNumero } from "./acompanhamento-view";
import {
  contarContatos,
  montarResumo,
  resumirMovimentos,
  semanaAnterior,
  somarComissoes,
  type DadosDaSemana,
  type DonoDaNegociacao,
  type InteracaoParaContar,
  type LiquidacaoParaSomar,
  type MovimentoParaResumir,
  type ResumoSemanal,
  type Semana,
} from "./indicadores-semanais";

export interface OpcoesIndicadores {
  /**
   * Só este consultor: todas as consultas saem filtradas por ele e o resumo
   * traz só ele. Use o id da sessão do consultor, nunca um valor da URL.
   * Omitido = a operação inteira (visão do gestor).
   */
  vendedorId?: string;
}

/**
 * Carrega os indicadores da semana e da semana anterior (Projeto RNA, etapa 6,
 * 2026-10-23). São consultas em lote, de tamanho fixo, que não crescem com o
 * número de consultores: contagens agregadas (groupBy) das negociações, uma
 * leitura dos registros de contato das duas semanas, uma das liquidações e
 * uma busca dos donos das negociações dos contatos.
 *
 * Limitações que valem para a tela (o schema não guarda mais que isso):
 * - Não há histórico de estágio da negociação. "Avançaram" e "adesões" usam a
 *   data da última alteração (atualizadoEm) de quem hoje está em negociação ou
 *   aderido; "negociações ativas" é a foto do estágio de hoje e, para semanas
 *   passadas, só enxerga quem não foi alterado depois do fim da semana (um
 *   mínimo).
 * - O registro de contato não guarda quem o fez: a autoria vem do dono da
 *   negociação (ata + município). Mover o cartão no Kanban também grava um
 *   registro, e entra na conta.
 */
export async function carregarIndicadoresSemanais(
  semana: Semana,
  opcoes: OpcoesIndicadores = {},
): Promise<ResumoSemanal> {
  // Falha fechada: `{ vendedorId: undefined }` (sessão que não resolveu o id) não pode virar "todos os consultores".
  if ("vendedorId" in opcoes && typeof opcoes.vendedorId !== "string") {
    throw new TypeError("O filtro por consultor exige um id; para a operação inteira, não passe vendedorId.");
  }
  const anterior = semanaAnterior(semana);
  const vendedorId = opcoes.vendedorId;
  const doConsultor: { vendedorId?: string } = vendedorId !== undefined ? { vendedorId } : {};

  const ativasDa = (s: Semana) =>
    prisma.oportunidadeVenda.groupBy({
      by: ["vendedorId"],
      where: { ...doConsultor, estagio: "em_negociacao", expiradaEm: null, atualizadoEm: { lt: s.fim } },
      _count: { _all: true },
    });
  const movimentosDa = (s: Semana) =>
    prisma.oportunidadeVenda.groupBy({
      by: ["vendedorId", "estagio"],
      where: {
        ...doConsultor,
        expiradaEm: null,
        estagio: { in: ["em_negociacao", "aderiu"] },
        atualizadoEm: { gte: s.inicio, lt: s.fim },
      },
      _count: { _all: true },
      _sum: { valorAderido: true },
    });

  const [consultores, ativasAtual, ativasAnterior, movimentosAtual, movimentosAnterior, interacoes, liquidacoes] =
    await Promise.all([
      prisma.vendedor.findMany({
        where: vendedorId !== undefined ? { id: vendedorId } : {},
        select: { id: true, nome: true, ativo: true },
        orderBy: { nome: "asc" },
      }),
      ativasDa(semana),
      ativasDa(anterior),
      movimentosDa(semana),
      movimentosDa(anterior),
      prisma.interacaoPontoFocal.findMany({
        where: {
          ataId: { not: null },
          criadoEm: { gte: anterior.inicio, lt: semana.fim },
          ...(vendedorId !== undefined ? { ata: { oportunidades: { some: { vendedorId } } } } : {}),
        },
        select: { ataId: true, criadoEm: true, pontoFocal: { select: { entidadeAlvoId: true } } },
      }),
      prisma.liquidacao.findMany({
        where: {
          ...(vendedorId !== undefined ? { oportunidade: { vendedorId } } : {}),
          OR: [
            // dataLiquidacao é só-data (meia-noite UTC): compara com os dias; dataRecebimento é instante.
            { dataLiquidacao: { gte: anterior.diaInicio, lt: semana.diaFim } },
            { statusCobranca: "recebida", dataRecebimento: { gte: anterior.inicio, lt: semana.fim } },
          ],
        },
        select: {
          valorLiquidado: true,
          dataLiquidacao: true,
          statusCobranca: true,
          dataRecebimento: true,
          oportunidade: { select: { vendedorId: true, percentualComissao: true } },
        },
      }),
    ]);

  const contatosBrutos: InteracaoParaContar[] = interacoes.map((i) => ({
    ataId: i.ataId,
    entidadeAlvoId: i.pontoFocal.entidadeAlvoId,
    criadoEm: i.criadoEm,
  }));

  // Quem é dono de cada par (ata, município) dos registros: uma única busca em lote.
  let donos: DonoDaNegociacao[] = [];
  if (contatosBrutos.length > 0) {
    const ataIds = [...new Set(contatosBrutos.flatMap((c) => (c.ataId === null ? [] : [c.ataId])))];
    const entidadeIds = [...new Set(contatosBrutos.map((c) => c.entidadeAlvoId))];
    donos = await prisma.oportunidadeVenda.findMany({
      where: { ...doConsultor, ataId: { in: ataIds }, entidadeAlvoId: { in: entidadeIds } },
      select: { ataId: true, entidadeAlvoId: true, vendedorId: true },
    });
  }

  const liquidacoesParaSomar: LiquidacaoParaSomar[] = liquidacoes.map((l) => ({
    vendedorId: l.oportunidade.vendedorId,
    valorLiquidado: paraNumero(l.valorLiquidado) ?? 0,
    percentualComissao: paraNumero(l.oportunidade.percentualComissao),
    dataLiquidacao: l.dataLiquidacao,
    statusCobranca: l.statusCobranca,
    dataRecebimento: l.dataRecebimento,
  }));

  const contagem = (linhas: { vendedorId: string; _count: { _all: number } }[]) =>
    new Map(linhas.map((l) => [l.vendedorId, l._count._all]));
  const movimentos = (
    linhas: { vendedorId: string; estagio: string; _count: { _all: number }; _sum: { valorAderido: { toString(): string } | null } }[],
  ): MovimentoParaResumir[] =>
    linhas.map((l) => ({
      vendedorId: l.vendedorId,
      estagio: l.estagio,
      quantidade: l._count._all,
      valorAderido: paraNumero(l._sum.valorAderido),
    }));

  const dadosDe = (s: Semana, ativas: Map<string, number>, movs: MovimentoParaResumir[]) => {
    const mov = resumirMovimentos(movs);
    const comissao = somarComissoes(liquidacoesParaSomar, s);
    const dados: DadosDaSemana = {
      contatos: contarContatos(contatosBrutos, donos, s),
      negociacoesAtivas: ativas,
      avancaram: mov.avancaram,
      adesoes: mov.adesoes,
      valorAderido: mov.valorAderido,
      comissaoLiquidada: comissao.liquidada,
      comissaoRecebida: comissao.recebida,
    };
    return { dados, semPercentual: comissao.semPercentual };
  };

  const atual = dadosDe(semana, contagem(ativasAtual), movimentos(movimentosAtual));
  const anteriorDados = dadosDe(anterior, contagem(ativasAnterior), movimentos(movimentosAnterior));

  return montarResumo({
    semana,
    anterior,
    consultores,
    dadosAtual: atual.dados,
    dadosAnterior: anteriorDados.dados,
    liquidacoesSemPercentual: atual.semPercentual,
  });
}
