import { prisma } from "@/lib/prisma";
import { ESTAGIOS_COM_PRAZO } from "@/lib/negociacao";

/**
 * Expira (sem apagar) as oportunidades cujo prazo venceu sem avanço, e
 * solta a "dona" da ata (Ata.vendedorId, campo legado de reivindicação)
 * quando nenhuma oportunidade ativa sobrou. Chamado ao abrir as telas do
 * vendedor e do admin — não há agendador, a expiração é "preguiçosa".
 */
export async function expirarOportunidadesVencidas(agora: Date = new Date()): Promise<void> {
  await prisma.oportunidadeVenda.updateMany({
    where: {
      expiradaEm: null,
      estagio: { in: [...ESTAGIOS_COM_PRAZO] },
      prazoEm: { lt: agora },
    },
    data: { expiradaEm: agora },
  });
  await prisma.ata.updateMany({
    where: { vendedorId: { not: null }, oportunidades: { none: { expiradaEm: null } } },
    data: { vendedorId: null },
  });
}
