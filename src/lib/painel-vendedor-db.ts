import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { escolherDecisorPrincipal } from "./decisores";
import { montarPainel, type LinhaOportunidade, type PainelVendedor } from "./painel-vendedor";

/**
 * Carrega as oportunidades (do vendedor ou, sem filtro de vendedor, de todos —
 * visão do gestor) com o que o painel precisa: decisor com canal e estimativa
 * de valor pelo raio-X. Duas consultas extras em lote (contatos e histórico),
 * nunca uma por card.
 */
export async function carregarLinhasOportunidades(where: Prisma.OportunidadeVendaWhereInput): Promise<LinhaOportunidade[]> {
  const oportunidades = await prisma.oportunidadeVenda.findMany({
    where: { ...where, expiradaEm: null },
    include: {
      ata: { include: { fornecedor: true } },
      entidadeAlvo: true,
      liquidacoes: true,
      vendedor: { select: { nome: true } },
    },
  });
  if (oportunidades.length === 0) return [];

  const entidadeIds = [...new Set(oportunidades.map((o) => o.entidadeAlvoId))];
  const categorias = [...new Set(oportunidades.map((o) => o.ata.categoria).filter((c): c is string => !!c))];

  const [contatos, historico] = await Promise.all([
    prisma.pontoFocal.findMany({
      where: { entidadeAlvoId: { in: entidadeIds }, ativo: true, contatoErradoEm: null },
    }),
    categorias.length
      ? prisma.historicoConsumoCategoria.findMany({
          where: { entidadeAlvoId: { in: entidadeIds }, categoria: { in: categorias } },
        })
      : Promise.resolve([]),
  ]);

  const valorPorChave = new Map(historico.map((h) => [`${h.entidadeAlvoId}|${h.categoria}`, Number(h.valorUltimaContratacao)]));
  const contatosPorEntidade = new Map<string, typeof contatos>();
  for (const c of contatos) {
    const lista = contatosPorEntidade.get(c.entidadeAlvoId) ?? [];
    lista.push(c);
    contatosPorEntidade.set(c.entidadeAlvoId, lista);
  }

  return oportunidades.map((o) => {
    const { semCanal } = escolherDecisorPrincipal(contatosPorEntidade.get(o.entidadeAlvoId) ?? [], o.ata.categoria);
    return {
      oportunidadeId: o.id,
      vendedorId: o.vendedorId,
      vendedorNome: o.vendedor.nome,
      ataId: o.ataId,
      ataNumero: o.ata.numero,
      ataCategoria: o.ata.categoria,
      fornecedor: o.ata.fornecedor.razaoSocial,
      municipio: o.entidadeAlvo.nome,
      uf: o.entidadeAlvo.uf,
      estagio: o.estagio,
      prazoEm: o.prazoEm,
      proximoContatoEm: o.proximoContatoEm,
      valorAderido: o.valorAderido ? Number(o.valorAderido) : null,
      percentualComissao: o.percentualComissao ? Number(o.percentualComissao) : null,
      valorEstimado: o.ata.categoria ? (valorPorChave.get(`${o.entidadeAlvoId}|${o.ata.categoria}`) ?? null) : null,
      semCanal,
      liquidacoes: o.liquidacoes.map((l) => ({
        valorLiquidado: Number(l.valorLiquidado),
        statusCobranca: l.statusCobranca,
      })),
    };
  });
}

/** Painel de um vendedor (home e dashboard dele). */
export async function carregarPainelVendedor(vendedorId: string): Promise<PainelVendedor> {
  return montarPainel(await carregarLinhasOportunidades({ vendedorId }));
}
