"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { prisma } from "@/lib/prisma";
import type { StatusTermo, StatusVinculo } from "@/lib/acompanhamento";

/**
 * Decisões do gestor sobre os contratos detectados no PNCP (Projeto RNA,
 * etapa 2, 2026-10-21). Toda ação exige admin logado e só mexe no que ainda
 * está pendente: o `where` com o status esperado torna a troca atômica, então
 * dois cliques (ou duas abas) nunca sobrescrevem uma decisão já tomada. A
 * auditoria só registra quando algo mudou de fato.
 */

const CAMINHO = "/admin/contratos-detectados";
const LIMITE_MOTIVO = 200;

async function exigirAdmin(): Promise<string> {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }
  return adminId;
}

function campo(formData: FormData, nome: string): string {
  return String(formData.get(nome) ?? "").trim();
}

async function decidirVinculo(
  formData: FormData,
  novoStatus: Extract<StatusVinculo, "confirmado" | "descartado">,
  acao: string,
  motivo?: string,
): Promise<void> {
  const adminId = await exigirAdmin();
  const vinculoId = campo(formData, "vinculoId");
  if (!vinculoId) return;

  const vinculo = await prisma.vinculoContrato.findUnique({
    where: { id: vinculoId },
    select: { contrato: { select: { numeroControlePncp: true } } },
  });
  if (!vinculo) return;

  const { count } = await prisma.vinculoContrato.updateMany({
    where: { id: vinculoId, status: "sugerido" },
    data: { status: novoStatus, decididoPorId: adminId, decididoEm: new Date() },
  });

  if (count > 0) {
    await registrarAuditoria({
      ator: `admin:${adminId}`,
      acao,
      alvo: vinculoId,
      detalhe: `contrato ${vinculo.contrato.numeroControlePncp}${motivo ? ` — motivo: ${motivo}` : ""}`,
    });
  }
  revalidatePath(CAMINHO);
}

export async function confirmarVinculoContrato(formData: FormData): Promise<void> {
  await decidirVinculo(formData, "confirmado", "admin.confirmarVinculoContrato");
}

/** O motivo é opcional e não tem coluna própria: fica só na trilha de auditoria. */
export async function descartarVinculoContrato(formData: FormData): Promise<void> {
  const motivo = campo(formData, "motivo").slice(0, LIMITE_MOTIVO);
  await decidirVinculo(formData, "descartado", "admin.descartarVinculoContrato", motivo || undefined);
}

async function decidirTermo(
  formData: FormData,
  novoStatus: Extract<StatusTermo, "lancado" | "sem_comissao">,
  acao: string,
): Promise<void> {
  const adminId = await exigirAdmin();
  const termoId = campo(formData, "termoId");
  if (!termoId) return;

  const termo = await prisma.termoContratoPublico.findUnique({
    where: { id: termoId },
    select: { tipo: true, contrato: { select: { numeroControlePncp: true } } },
  });
  if (!termo) return;

  // Só vale para aditivo ainda a acompanhar de contrato com vínculo confirmado.
  const { count } = await prisma.termoContratoPublico.updateMany({
    where: {
      id: termoId,
      cobrancaStatus: "a_acompanhar",
      contrato: { vinculo: { status: "confirmado" } },
    },
    data: { cobrancaStatus: novoStatus },
  });

  if (count > 0) {
    await registrarAuditoria({
      ator: `admin:${adminId}`,
      acao,
      alvo: termoId,
      detalhe: `${termo.tipo} do contrato ${termo.contrato.numeroControlePncp} → ${novoStatus}`,
    });
  }
  revalidatePath(CAMINHO);
}

export async function marcarTermoSemComissao(formData: FormData): Promise<void> {
  await decidirTermo(formData, "sem_comissao", "admin.marcarTermoSemComissao");
}

export async function marcarTermoLancado(formData: FormData): Promise<void> {
  await decidirTermo(formData, "lancado", "admin.marcarTermoLancado");
}
