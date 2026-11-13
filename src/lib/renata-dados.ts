import { prisma } from "@/lib/prisma";
import { carregarAtasEmAndamento } from "@/lib/ciclo-ata-db";
import { carregarFeriadosExtras } from "@/lib/feriados-db";
import {
  montarAndamentoDoCiclo,
  montarSaldoDasAtas,
  montarVendasPorConsultor,
  type LinhaDeVendas,
} from "@/lib/renata-api";

/** Consultas de leitura da Renata (ver src/lib/renata-api.ts). Nada aqui grava no banco. */

/** Teto de atas devolvidas: a Renata não precisa do catálogo inteiro de uma vez. */
const LIMITE_DE_ATAS = 200;

/** Atas liberadas para a venda (aprovadas, com contrato e categoria) e ainda vigentes, com o saldo de cada item. */
export async function consultarSaldoDasAtas() {
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  const atas = await prisma.ata.findMany({
    where: {
      status: "APROVADA",
      contrato: { isNot: null },
      categoria: { not: null },
      dataVigenciaFim: { gte: hoje },
    },
    orderBy: { dataVigenciaFim: "asc" },
    take: LIMITE_DE_ATAS,
    select: {
      id: true,
      tituloPublico: true,
      categoria: true,
      dataVigenciaFim: true,
      itens: {
        orderBy: { descricao: "asc" },
        select: {
          id: true,
          descricao: true,
          unidade: true,
          valorUnitario: true,
          quantidadeRegistrada: true,
          saldo: { select: { quantidadeConsumida: true } },
        },
      },
    },
  });
  return {
    atas: montarSaldoDasAtas(
      atas.map((a) => ({
        ...a,
        itens: a.itens.map((i) => ({
          id: i.id,
          descricao: i.descricao,
          unidade: i.unidade,
          valorUnitario: i.valorUnitario.toString(),
          quantidadeRegistrada: i.quantidadeRegistrada,
          quantidadeConsumida: i.saldo?.quantidadeConsumida ?? 0,
        })),
      })),
    ),
  };
}

/** Oportunidades por consultor e estágio, com o valor aderido. `vendedorId` limita a um consultor. */
export async function consultarVendasPorConsultor(vendedorId?: string) {
  const grupos = await prisma.oportunidadeVenda.groupBy({
    by: ["vendedorId", "estagio"],
    where: { expiradaEm: null, ...(vendedorId ? { vendedorId } : {}) },
    _count: { _all: true },
    _sum: { valorAderido: true },
  });
  const ids = [...new Set(grupos.map((g) => g.vendedorId))];
  const nomes = ids.length
    ? new Map((await prisma.vendedor.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((v) => [v.id, v.nome]))
    : new Map<string, string>();
  const linhas: LinhaDeVendas[] = grupos.map((g) => ({
    vendedorId: g.vendedorId,
    nome: nomes.get(g.vendedorId) ?? "Consultor",
    estagio: g.estagio,
    quantidade: g._count._all,
    valorAderido: Number(g._sum.valorAderido ?? 0),
  }));
  return { consultores: montarVendasPorConsultor(linhas) };
}

/** Atas que ainda esperam uma etapa do ciclo (atividades 1 a 7), com o prazo em dias úteis. */
export async function consultarAndamentoDoCiclo() {
  const [atas, feriados] = await Promise.all([carregarAtasEmAndamento(), carregarFeriadosExtras()]);
  return montarAndamentoDoCiclo(atas, new Date(), feriados);
}
