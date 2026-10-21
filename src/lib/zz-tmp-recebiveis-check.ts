import { prisma } from "@/lib/prisma";
import { ONDE_LIQUIDACAO_A_COBRAR, ONDE_LIQUIDACAO_AGUARDANDO_PAGAMENTO_ENTE } from "@/lib/recebiveis";

export async function zz() {
  return [
    await prisma.liquidacao.count({ where: ONDE_LIQUIDACAO_A_COBRAR }),
    await prisma.liquidacao.count({ where: ONDE_LIQUIDACAO_AGUARDANDO_PAGAMENTO_ENTE }),
  ];
}
