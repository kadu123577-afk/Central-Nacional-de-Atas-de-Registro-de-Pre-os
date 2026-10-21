import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { filtroDeVinculosVisiveis, montarCartao, type CartaoView, type EntradaContratoDetectado } from "./kanban-view";
import type { SinalView } from "./sinais";

/**
 * Carrega os cards do Kanban com tudo que o card e a gaveta mostram (contatos,
 * raio-X, interações, sinais, liquidações, instrução da adesão). Usado pelo Kanban do vendedor (uma
 * ata, só os municípios dele) e pelo Pipeline do gestor (várias atas e
 * vendedores, com filtros e teto de cards). Consultas em lote: uma por tipo de
 * dado, nunca uma por card.
 *
 * Contrato público detectado (Projeto RNA, etapa 2): o vínculo não descartado
 * entre a oportunidade e um contrato do PNCP vem numa única consulta em lote.
 * O vendedor (padrão) só recebe vínculo de nível "certo" e "forte"; "desvio" é
 * alerta interno do gestor, então só quem passa `verDesvio: true` (telas do
 * admin) o recebe.
 */
export async function carregarCartoes(
  where: Prisma.OportunidadeVendaWhereInput,
  opcoes: { limite?: number; verDesvio?: boolean } = {},
): Promise<{ cartoes: CartaoView[]; total: number }> {
  const verDesvio = opcoes.verDesvio === true;
  const [total, oportunidades] = await Promise.all([
    prisma.oportunidadeVenda.count({ where }),
    prisma.oportunidadeVenda.findMany({
      where,
      include: {
        entidadeAlvo: true,
        liquidacoes: true,
        vendedor: { select: { nome: true } },
        ata: { include: { contrato: true } },
        // Instrução da adesão (1:1 com a oportunidade): vai no mesmo join, sem consulta por card.
        instrucao: true,
      },
      // Prazo mais curto primeiro (sem prazo no fim) — o que é urgente aparece
      // mesmo quando o teto de cards corta o resto.
      orderBy: [{ prazoEm: { sort: "asc", nulls: "last" } }, { criadoEm: "asc" }],
      take: opcoes.limite,
    }),
  ]);
  if (oportunidades.length === 0) return { cartoes: [], total };

  const entidadeIds = [...new Set(oportunidades.map((o) => o.entidadeAlvoId))];

  // Todos os contatos ativos (prefeito + secretários) — é justamente o dado
  // que deu mais trabalho levantar.
  const contatos = await prisma.pontoFocal.findMany({
    where: { entidadeAlvoId: { in: entidadeIds }, ativo: true },
    orderBy: { createdAt: "asc" },
  });
  const contatoIds = contatos.map((c) => c.id);

  const [interacoes, historico, sinaisBanco, vinculos] = await Promise.all([
    contatoIds.length
      ? prisma.interacaoPontoFocal.findMany({
          where: { pontoFocalId: { in: contatoIds } },
          orderBy: { criadoEm: "desc" },
          take: 800,
        })
      : Promise.resolve([]),
    // Raio-X completo (todas as categorias já identificadas pro município,
    // não só a da ata).
    prisma.historicoConsumoCategoria.findMany({
      where: { entidadeAlvoId: { in: entidadeIds } },
      orderBy: { ultimaContratacao: "desc" },
    }),
    prisma.sinalMunicipio.findMany({
      where: { entidadeAlvoId: { in: entidadeIds }, OR: [{ expiraEm: null }, { expiraEm: { gte: new Date() } }] },
      orderBy: { dataSinal: "desc" },
    }),
    // Contratos públicos ligados às oportunidades carregadas: um vínculo por
    // contrato, filtrado por nível e status já no banco (nada de N+1). O filtro
    // vem de kanban-view.ts (puro e testado): o "desvio" nem sai do banco para o vendedor.
    prisma.vinculoContrato.findMany({
      where: filtroDeVinculosVisiveis(
        oportunidades.map((o) => o.id),
        verDesvio,
      ),
      select: {
        oportunidadeId: true,
        nivel: true,
        status: true,
        contrato: {
          select: {
            numeroControlePncp: true,
            objeto: true,
            fornecedorNome: true,
            valorGlobal: true,
            vigenciaInicio: true,
            vigenciaFim: true,
            dataAssinatura: true,
          },
        },
      },
    }),
  ]);

  const contatoPorId = new Map(contatos.map((c) => [c.id, c]));

  const sinaisPorEntidade = new Map<string, SinalView[]>();
  for (const sn of sinaisBanco) {
    const lista = sinaisPorEntidade.get(sn.entidadeAlvoId) ?? [];
    lista.push({
      id: sn.id,
      tipo: sn.tipo,
      titulo: sn.titulo,
      detalhe: sn.detalhe,
      fonte: sn.fonte,
      fonteUrl: sn.fonteUrl,
      categoria: sn.categoria,
      valorEstimado: sn.valorEstimado ? Number(sn.valorEstimado) : null,
      dataSinal: sn.dataSinal.toISOString(),
      expiraEm: sn.expiraEm ? sn.expiraEm.toISOString() : null,
    });
    sinaisPorEntidade.set(sn.entidadeAlvoId, lista);
  }

  const contratosPorOportunidade = new Map<string, EntradaContratoDetectado[]>();
  for (const v of vinculos) {
    if (!v.oportunidadeId) continue;
    const lista = contratosPorOportunidade.get(v.oportunidadeId) ?? [];
    lista.push({
      nivel: v.nivel,
      status: v.status,
      numeroControlePncp: v.contrato.numeroControlePncp,
      objeto: v.contrato.objeto,
      fornecedorNome: v.contrato.fornecedorNome,
      valorGlobal: v.contrato.valorGlobal ? Number(v.contrato.valorGlobal) : null,
      vigenciaInicio: v.contrato.vigenciaInicio,
      vigenciaFim: v.contrato.vigenciaFim,
      dataAssinatura: v.contrato.dataAssinatura,
    });
    contratosPorOportunidade.set(v.oportunidadeId, lista);
  }

  const cartoes = oportunidades.map((o) =>
    montarCartao(
      {
        id: o.id,
        ataId: o.ataId,
        ataNumero: o.ata.numero,
        vendedorNome: o.vendedor.nome,
        entidadeAlvoId: o.entidadeAlvoId,
        nomeMunicipio: o.entidadeAlvo.nome,
        uf: o.entidadeAlvo.uf,
        estagio: o.estagio,
        observacoes: o.observacoes,
        prazoEm: o.prazoEm,
        proximoContatoEm: o.proximoContatoEm,
        valorAderido: o.valorAderido ? Number(o.valorAderido) : null,
        percentualComissao: o.percentualComissao ? Number(o.percentualComissao) : null,
        contatos: contatos
          .filter((c) => c.entidadeAlvoId === o.entidadeAlvoId)
          .map((c) => ({
            id: c.id,
            cargo: c.cargo,
            area: c.area,
            nomeContato: c.nomeContato,
            telefone: c.telefone,
            email: c.email,
            particularidades: c.particularidades,
            updatedAt: c.updatedAt,
            fonte: c.fonte,
            fonteUrl: c.fonteUrl,
            confianca: c.confianca,
            verificadoEm: c.verificadoEm,
            contatoErradoEm: c.contatoErradoEm,
            contatoErradoMotivo: c.contatoErradoMotivo,
          })),
        sinais: sinaisPorEntidade.get(o.entidadeAlvoId) ?? [],
        necessidades: historico
          .filter((h) => h.entidadeAlvoId === o.entidadeAlvoId)
          .map((h) => ({
            categoria: h.categoria,
            ultimaContratacao: h.ultimaContratacao,
            valor: Number(h.valorUltimaContratacao),
            quantidadeContratos: h.quantidadeContratosNaJanela,
            objeto: h.objetoUltimaContratacao,
          })),
        interacoes: interacoes
          .filter((i) => contatoPorId.get(i.pontoFocalId)?.entidadeAlvoId === o.entidadeAlvoId)
          .map((i) => {
            const contato = contatoPorId.get(i.pontoFocalId);
            return {
              id: i.id,
              criadoEm: i.criadoEm,
              resultado: i.resultado,
              observacao: i.observacao,
              contatoNome: contato?.nomeContato ?? "",
              contatoCargo: contato?.cargo ?? "",
            };
          }),
        liquidacoes: o.liquidacoes.map((l) => ({
          valorLiquidado: Number(l.valorLiquidado),
          statusCobranca: l.statusCobranca,
        })),
        contratos: contratosPorOportunidade.get(o.id) ?? [],
        instrucao: o.instrucao
          ? {
              itens: o.instrucao.itens,
              declaracaoEm: o.instrucao.declaracaoEm,
              declaracaoPorTipo: o.instrucao.declaracaoPorTipo,
              declaracaoVersao: o.instrucao.declaracaoVersao,
              declaracaoExcecao: o.instrucao.declaracaoExcecao,
            }
          : null,
      },
      {
        categoriaAta: o.ata.categoria,
        percentualContrato: o.ata.contrato ? Number(o.ata.contrato.percentualComissao) : null,
        verDesvio,
      },
    ),
  );

  return { cartoes, total };
}
