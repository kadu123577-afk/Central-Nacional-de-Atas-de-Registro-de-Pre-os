"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { orgaoIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verificarAdesao } from "@/lib/saldo";

export interface EstadoPedidoAdesao {
  erro?: string;
}

export async function solicitarAdesao(
  _estadoAnterior: EstadoPedidoAdesao,
  formData: FormData,
): Promise<EstadoPedidoAdesao> {
  const orgaoId = await orgaoIdLogado();
  if (!orgaoId) {
    redirect("/orgao/login");
  }

  const itemId = String(formData.get("itemId") ?? "");
  const quantidadeSolicitada = Number(formData.get("quantidadeSolicitada"));

  if (!itemId || !Number.isFinite(quantidadeSolicitada) || quantidadeSolicitada <= 0) {
    return { erro: "Informe uma quantidade válida." };
  }

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { ata: true },
  });
  if (!item || item.ata.status !== "APROVADA") {
    return { erro: "Item não encontrado." };
  }

  // Adesão a atas geridas por órgão municipal é permitida por decisão de
  // negócio — não há vedação expressa na Lei 14.133/2021, art. 86, e o
  // sistema não restringe por esfera do órgão gerenciador (ver
  // Orgao.esfera). Só os limites de quantidade abaixo (50% / dobro
  // agregado) se aplicam, independente da esfera de quem gerencia a ata.

  try {
    const adesao = await prisma.$transaction(async (tx) => {
      // Trava a linha de saldo do item para que dois pedidos simultâneos não
      // furem o teto agregado do art. 86 — sem isso, duas transações
      // poderiam ler o mesmo saldo disponível e aprovar as duas.
      const [linhaSaldo] = await tx.$queryRaw<{ quantidadeConsumida: number }[]>`
        SELECT "quantidadeConsumida" FROM "saldos" WHERE "itemId" = ${itemId} FOR UPDATE
      `;
      const quantidadeConsumidaAtual = linhaSaldo?.quantidadeConsumida ?? 0;

      const adesoesDoOrgaoNoItem = await tx.adesao.aggregate({
        where: { itemId, orgaoAderenteId: orgaoId },
        _sum: { quantidadeSolicitada: true },
      });
      const quantidadeJaAderidaPeloOrgao = adesoesDoOrgaoNoItem._sum.quantidadeSolicitada ?? 0;

      const resultado = verificarAdesao(
        item.quantidadeRegistrada,
        quantidadeConsumidaAtual,
        quantidadeJaAderidaPeloOrgao,
        quantidadeSolicitada,
      );

      if (!resultado.permitido) {
        const mensagens: Record<string, string> = {
          LIMITE_POR_ORGAO_EXCEDIDO: `Recusado: um único órgão não pode aderir a mais de ${resultado.limitePorOrgao} ${item.unidade} deste item (50% do total registrado, art. 86 da Lei 14.133/2021).`,
          LIMITE_AGREGADO_EXCEDIDO: `Recusado: só restam ${resultado.saldoAgregadoDisponivel} ${item.unidade} de saldo agregado disponível para este item.`,
        };
        throw new PedidoRecusadoError(mensagens[resultado.motivo!]);
      }

      const novaAdesao = await tx.adesao.create({
        data: {
          itemId,
          orgaoAderenteId: orgaoId,
          quantidadeSolicitada,
          historico: {
            create: {
              estagioAnterior: null,
              estagioNovo: "MAPEADA",
              alteradoPor: `orgao:${orgaoId}`,
            },
          },
        },
      });

      await tx.saldo.upsert({
        where: { itemId },
        update: { quantidadeConsumida: { increment: quantidadeSolicitada } },
        create: { itemId, quantidadeConsumida: quantidadeSolicitada },
      });

      return novaAdesao;
    });

    revalidatePath("/catalogo");
    revalidatePath("/orgao");
    redirect(`/adesoes/${adesao.id}`);
  } catch (erro) {
    if (erro instanceof PedidoRecusadoError) {
      return { erro: erro.message };
    }
    throw erro;
  }
}

class PedidoRecusadoError extends Error {}
