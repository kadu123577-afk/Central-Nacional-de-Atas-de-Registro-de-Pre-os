import { prisma } from "@/lib/prisma";
import { escolherDecisorPrincipal } from "./decisores";
import { montarPainel, type LinhaOportunidade, type PainelVendedor } from "./painel-vendedor";

/**
 * Carrega as oportunidades ativas do vendedor com o que o painel precisa
 * (decisor com canal, estimativa de valor pelo raio-X) e monta o resumo.
 * Duas consultas extras em lote (contatos e histórico), nunca uma por card.
 */
export async function carregarPainelVendedor(vendedorId: string): Promise<PainelVendedor> {
  const oportunidades = await prisma.oportunidadeVenda.findMany({
    where: { vendedorId, expiradaEm: null },
    include: {
      ata: { include: { fornecedor: true } },
      entidadeAlvo: true,
      liquidacoes: true,
    },
  });
  if (oportunidades.length === 0) return montarPainel([]);

  const entidadeIds = [...new Set(oportunidades.map((o) => o.entidadeAlvoId))];
  const categorias = [...new Set(oportunidades.map((o) => o.ata.categoria).filter((c): c is string => !!c))];

  const [contatos, historico] = await Promise.all([
    prisma.pontoFocal.findMany({ where: { entidadeAlvoId: { in: entidadeIds }, ativo: true } }),
    categorias.length
      ? prisma.historicoConsumoCategoria.findMany({
          where: { entidadeAlvoId: { in: entidadeIds }, categoria: { in: categorias } },
        })
      : Promise.resolve([]),
  ]);

  const valorPorChave = new Map(historico.map((h) => [`${h.entidadeAlvoId}|${h.categoria}`, Number(h.valorUltimaContratacao)]));

  const linhas: LinhaOportunidade[] = oportunidades.map((o) => {
    const doMunicipio = contatos.filter((c) => c.entidadeAlvoId === o.entidadeAlvoId);
    const { semCanal } = escolherDecisorPrincipal(doMunicipio, o.ata.categoria);
    return {
      oportunidadeId: o.id,
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

  return montarPainel(linhas);
}
