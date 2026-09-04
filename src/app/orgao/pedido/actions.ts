"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { orgaoIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verificarAdesao } from "@/lib/saldo";
import { ataDisponivelParaAdesao } from "@/lib/atas";
import { verificarElegibilidadeEsfera } from "@/lib/esferas";

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

  const [item, orgaoAderente] = await Promise.all([
    prisma.item.findUnique({
      where: { id: itemId },
      include: { ata: { include: { orgaoGerenciador: true } } },
    }),
    prisma.orgao.findUnique({ where: { id: orgaoId } }),
  ]);
  if (!item || item.ata.status !== "APROVADA") {
    return { erro: "Item não encontrado." };
  }
  if (!orgaoAderente) {
    return { erro: "Órgão não encontrado." };
  }
  if (!ataDisponivelParaAdesao(item.ata)) {
    return {
      erro: `Recusado: a Ata ${item.ata.numero} está fora da vigência (venceu em ${item.ata.dataVigenciaFim.toLocaleDateString("pt-BR")}) e não aceita mais adesões.`,
    };
  }

  // Elegibilidade por esfera federativa — art. 86, §§ 3º e 8º da Lei
  // 14.133/2021 (achado da revisão de 2026-09-04, direção corrigida no
  // mesmo dia depois de conferir o texto literal): órgão federal só
  // adere a ata gerenciada por federal; estadual/distrital adere a
  // federal/estadual/distrital; município adere a ata gerenciada por
  // qualquer esfera. Ver src/lib/esferas.ts pra regra completa e fontes.
  const elegibilidade = verificarElegibilidadeEsfera(
    orgaoAderente.esfera,
    item.ata.orgaoGerenciador.esfera,
  );
  if (!elegibilidade.permitido) {
    const mensagens: Record<string, string> = {
      ESFERA_NAO_CONFIRMADA:
        "Recusado: não foi possível confirmar a esfera federativa do seu órgão ou do órgão gerenciador desta ata (art. 86, §§ 3º e 8º da Lei 14.133/2021 exigem essa checagem).",
      NIVEL_NAO_PERMITIDO: `Recusado: um órgão da esfera "${orgaoAderente.esfera}" não pode aderir a uma ata gerenciada por órgão da esfera "${item.ata.orgaoGerenciador.esfera}" (art. 86, §§ 3º e 8º da Lei 14.133/2021).`,
    };
    return { erro: mensagens[elegibilidade.motivo!] };
  }

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
