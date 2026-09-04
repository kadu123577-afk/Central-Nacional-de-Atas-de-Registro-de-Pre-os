"use server";

import { revalidatePath } from "next/cache";
import { fornecedorIdLogado, orgaoIdLogado } from "@/lib/auth";
import { proximoEstagio } from "@/lib/adesao";
import { calcularFaturamento } from "@/lib/faturamento";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export interface EstadoAvancoEstagio {
  erro?: string;
}

/**
 * Move a adesão para o próximo estágio da esteira.
 *
 * Fornecedor dono da ata ou órgão que pediu a adesão podem avançar — ainda
 * não há papel de consultor comercial no sistema, então por ora qualquer
 * um dos dois lados envolvidos pode empurrar o pedido adiante, com o
 * histórico registrando exatamente quem fez cada mudança.
 */
export async function avancarEstagioAdesao(
  _estadoAnterior: EstadoAvancoEstagio,
  formData: FormData,
): Promise<EstadoAvancoEstagio> {
  const adesaoId = String(formData.get("adesaoId") ?? "");
  if (!adesaoId) return { erro: "Pedido inválido." };

  const [fornecedorId, orgaoId] = await Promise.all([fornecedorIdLogado(), orgaoIdLogado()]);
  if (!fornecedorId && !orgaoId) {
    return { erro: "Faça login como fornecedor ou como órgão para avançar este pedido." };
  }

  const adesao = await prisma.adesao.findUnique({
    where: { id: adesaoId },
    include: { item: { include: { ata: true } } },
  });
  if (!adesao) return { erro: "Pedido não encontrado." };

  const ehFornecedorDaAta = fornecedorId && fornecedorId === adesao.item.ata.fornecedorId;
  const ehOrgaoAderente = orgaoId && orgaoId === adesao.orgaoAderenteId;
  if (!ehFornecedorDaAta && !ehOrgaoAderente) {
    return { erro: "Você não participa deste pedido de adesão." };
  }

  const proximo = proximoEstagio(adesao.estagio);
  if (!proximo) {
    return { erro: "Este pedido já chegou ao último estágio." };
  }

  const alteradoPor = ehFornecedorDaAta ? `fornecedor:${fornecedorId}` : `orgao:${orgaoId}`;

  const operacoes: Prisma.PrismaPromise<unknown>[] = [
    prisma.adesao.update({
      where: { id: adesaoId },
      data: { estagio: proximo },
    }),
    prisma.adesaoHistorico.create({
      data: {
        adesaoId,
        estagioAnterior: adesao.estagio,
        estagioNovo: proximo,
        alteradoPor,
      },
    }),
  ];

  // Sprint 8: ao chegar em EMPENHADA, a cobrança nasce sozinha — o
  // "contas a receber" da Tech 10 junto ao fornecedor.
  if (proximo === "EMPENHADA") {
    const faturamento = calcularFaturamento(
      adesao.quantidadeSolicitada,
      Number(adesao.item.valorUnitario),
    );
    operacoes.push(
      prisma.faturamento.create({
        data: {
          adesaoId,
          valorContrato: faturamento.valorContrato,
          percentualTaxa: faturamento.percentualTaxa,
          valorTaxaIntermediacao: faturamento.valorTaxaIntermediacao,
        },
      }),
    );
  }

  await prisma.$transaction(operacoes);

  revalidatePath(`/adesoes/${adesaoId}`);
  revalidatePath("/orgao");
  revalidatePath("/fornecedor");
  return {};
}
