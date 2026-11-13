import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ItemParaRegistro } from "@/lib/registrar-adesao";

/**
 * Oportunidade pronta para a equipe registrar a adesão: dentro do prazo, ainda não aderida, com a
 * declaração de conformidade do jurídico e com contrato de intermediação na ata. É a mesma
 * conta que a ação de registro refaz antes de gravar. Serve à lista, ao painel e à fila.
 */
export const ONDE_PRONTA_PARA_REGISTRAR = {
  expiradaEm: null,
  estagio: { not: "aderiu" },
  instrucao: { is: { declaracaoEm: { not: null } } },
  ata: { contrato: { isNot: null } },
} satisfies Prisma.OportunidadeVendaWhereInput;

/**
 * Leitura do que o registro de adesão precisa (2026-11-14): a oportunidade, o que falta para
 * poder registrar (declaração do jurídico, contrato) e, por item, o saldo da ata e o que o
 * município já aderiu. A conta em si está em src/lib/registrar-adesao.ts.
 */
export interface DadosParaRegistro {
  oportunidade: {
    id: string;
    ataId: string;
    entidadeAlvoId: string;
    estagio: string;
    expirada: boolean;
    municipio: string;
    uf: string | null;
    ataNumero: string;
    ataObjeto: string;
    declaradaEm: Date | null;
    percentualContrato: string | null;
    valorAderido: string | null;
  };
  itens: ItemParaRegistro[];
}

export async function carregarParaRegistro(oportunidadeId: string): Promise<DadosParaRegistro | null> {
  const op = await prisma.oportunidadeVenda.findUnique({
    where: { id: oportunidadeId },
    select: {
      id: true,
      ataId: true,
      entidadeAlvoId: true,
      estagio: true,
      expiradaEm: true,
      valorAderido: true,
      entidadeAlvo: { select: { nome: true, municipio: true, uf: true } },
      ata: { select: { numero: true, objeto: true, contrato: { select: { percentualComissao: true } } } },
      instrucao: { select: { declaracaoEm: true } },
    },
  });
  if (!op) return null;

  const [itens, aderidoPeloMunicipio] = await Promise.all([
    prisma.item.findMany({
      where: { ataId: op.ataId },
      orderBy: { descricao: "asc" },
      select: {
        id: true,
        descricao: true,
        unidade: true,
        quantidadeRegistrada: true,
        valorUnitario: true,
        saldo: { select: { quantidadeConsumida: true } },
      },
    }),
    prisma.adesaoItem.groupBy({
      by: ["itemId"],
      where: { oportunidade: { entidadeAlvoId: op.entidadeAlvoId, ataId: op.ataId } },
      _sum: { quantidade: true },
    }),
  ]);
  const doMunicipio = new Map(aderidoPeloMunicipio.map((g) => [g.itemId, g._sum.quantidade ?? 0]));

  return {
    oportunidade: {
      id: op.id,
      ataId: op.ataId,
      entidadeAlvoId: op.entidadeAlvoId,
      estagio: op.estagio,
      expirada: op.expiradaEm !== null,
      municipio: op.entidadeAlvo.municipio ?? op.entidadeAlvo.nome,
      uf: op.entidadeAlvo.uf,
      ataNumero: op.ata.numero,
      ataObjeto: op.ata.objeto,
      declaradaEm: op.instrucao?.declaracaoEm ?? null,
      percentualContrato: op.ata.contrato?.percentualComissao.toString() ?? null,
      valorAderido: op.valorAderido?.toString() ?? null,
    },
    itens: itens.map((i) => ({
      itemId: i.id,
      descricao: i.descricao,
      unidade: i.unidade,
      quantidadeRegistrada: i.quantidadeRegistrada,
      valorUnitario: i.valorUnitario.toString(),
      consumidoNoTotal: i.saldo?.quantidadeConsumida ?? 0,
      consumidoPeloMunicipio: doMunicipio.get(i.id) ?? 0,
    })),
  };
}
