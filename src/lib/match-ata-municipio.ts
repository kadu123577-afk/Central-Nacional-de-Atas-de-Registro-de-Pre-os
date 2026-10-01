import { prisma } from "@/lib/prisma";

/**
 * Match ata <-> município (2026-09-26, extraído pra cá em 2026-10-01 pra
 * ser reaproveitado tanto na tela de admin quanto na reivindicação de
 * ata pelo vendedor) — cruza `Ata.categoria` com
 * `HistoricoConsumoCategoria.categoria` dos 1.073 municípios do
 * levantamento.
 *
 * Dois grupos, de propósito separados (mistura "certeza" com
 * "especulativo" seria enganoso pro time comercial):
 *   - jaContrataram: já contratou essa categoria antes — candidato forte.
 *   - nuncaContrataram: raio-X rodou e não achou essa categoria — pode
 *     ser necessidade nova ou o classificador não ter pego o contrato
 *     certo. Limitado a 200 pra não devolver a lista toda do país.
 */
export interface MunicipioCompativel {
  id: string;
  nome: string;
  uf: string | null;
  municipio: string | null;
  ultimaContratacao: Date;
  valorUltimaContratacao: unknown;
}

export interface MunicipioSemHistorico {
  id: string;
  nome: string;
  uf: string | null;
  municipio: string | null;
}

export async function buscarMunicipiosCompativeis(categoria: string): Promise<{
  jaContrataram: MunicipioCompativel[];
  nuncaContrataram: MunicipioSemHistorico[];
}> {
  const comHistorico = await prisma.entidadeAlvo.findMany({
    where: {
      tipo: "municipal",
      historicoConsumo: { some: { categoria } },
    },
    include: {
      historicoConsumo: { where: { categoria }, take: 1 },
    },
  });
  const jaContrataram = comHistorico
    .map((e) => ({
      id: e.id,
      nome: e.nome,
      uf: e.uf,
      municipio: e.municipio,
      ultimaContratacao: e.historicoConsumo[0].ultimaContratacao,
      valorUltimaContratacao: e.historicoConsumo[0].valorUltimaContratacao,
    }))
    .sort((a, b) => a.ultimaContratacao.getTime() - b.ultimaContratacao.getTime());

  const nuncaContrataram = await prisma.entidadeAlvo.findMany({
    where: {
      tipo: "municipal",
      raioXAtualizadoEm: { not: null },
      historicoConsumo: { none: { categoria } },
    },
    select: { id: true, nome: true, uf: true, municipio: true },
    orderBy: { nome: "asc" },
    take: 200,
  });

  return { jaContrataram, nuncaContrataram };
}
