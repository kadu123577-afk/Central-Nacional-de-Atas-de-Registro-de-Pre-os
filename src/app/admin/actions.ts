"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdLogado, criarSessaoAdmin, encerrarSessaoAdmin, verificarSenha } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface EstadoLoginAdmin {
  erro?: string;
}

export async function loginAdmin(
  _estadoAnterior: EstadoLoginAdmin,
  formData: FormData,
): Promise<EstadoLoginAdmin> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) {
    return { erro: "E-mail ou senha inválidos." };
  }

  const senhaCorreta = await verificarSenha(senha, admin.senhaHash);
  if (!senhaCorreta) {
    return { erro: "E-mail ou senha inválidos." };
  }

  await criarSessaoAdmin(admin.id);
  redirect("/admin");
}

export async function logoutAdmin(): Promise<void> {
  await encerrarSessaoAdmin();
  redirect("/admin/login");
}

async function exigirAdmin(): Promise<void> {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }
}

export async function aprovarAta(formData: FormData): Promise<void> {
  await exigirAdmin();
  const ataId = String(formData.get("ataId") ?? "");
  if (!ataId) return;

  await prisma.ata.update({ where: { id: ataId }, data: { status: "APROVADA" } });
  revalidatePath("/admin");
  revalidatePath("/catalogo");
}

export async function rejeitarAta(formData: FormData): Promise<void> {
  await exigirAdmin();
  const ataId = String(formData.get("ataId") ?? "");
  if (!ataId) return;

  await prisma.ata.update({ where: { id: ataId }, data: { status: "REJEITADA" } });
  revalidatePath("/admin");
  revalidatePath("/catalogo");
}

/**
 * Gestão de usuários (2026-09-04) — desativar bloqueia login (checado em
 * loginFornecedor/loginOrgao), sem apagar nada: atas, adesões e
 * faturamento já existentes continuam intactos. Sessão já aberta no
 * momento da desativação não é revogada na hora — expira sozinha em até
 * 7 dias (mesma duração de qualquer sessão, ver src/lib/auth.ts).
 */
export async function alternarStatusFornecedor(formData: FormData): Promise<void> {
  await exigirAdmin();
  const fornecedorId = String(formData.get("fornecedorId") ?? "");
  if (!fornecedorId) return;

  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: fornecedorId } });
  if (!fornecedor) return;

  await prisma.fornecedor.update({
    where: { id: fornecedorId },
    data: { ativo: !fornecedor.ativo },
  });
  revalidatePath("/admin/usuarios");
}

export async function alternarStatusOrgao(formData: FormData): Promise<void> {
  await exigirAdmin();
  const orgaoId = String(formData.get("orgaoId") ?? "");
  if (!orgaoId) return;

  const orgao = await prisma.orgao.findUnique({ where: { id: orgaoId } });
  if (!orgao) return;

  await prisma.orgao.update({
    where: { id: orgaoId },
    data: { ativo: !orgao.ativo },
  });
  revalidatePath("/admin/usuarios");
}

export interface EstadoMarcarFaturamento {
  erro?: string;
}

export async function marcarFaturamentoComoPago(
  _estadoAnterior: EstadoMarcarFaturamento,
  formData: FormData,
): Promise<EstadoMarcarFaturamento> {
  await exigirAdmin();
  const faturamentoId = String(formData.get("faturamentoId") ?? "");
  if (!faturamentoId) return { erro: "Registro inválido." };

  try {
    await prisma.faturamento.update({
      where: { id: faturamentoId },
      data: { pago: true, pagoEm: new Date() },
    });
  } catch {
    return { erro: "Não foi possível marcar como recebido. Tente de novo." };
  }
  revalidatePath("/admin/faturamento");
  revalidatePath("/admin");
  return {};
}

export async function marcarFaturamentoComoPendente(
  _estadoAnterior: EstadoMarcarFaturamento,
  formData: FormData,
): Promise<EstadoMarcarFaturamento> {
  await exigirAdmin();
  const faturamentoId = String(formData.get("faturamentoId") ?? "");
  if (!faturamentoId) return { erro: "Registro inválido." };

  try {
    await prisma.faturamento.update({
      where: { id: faturamentoId },
      data: { pago: false, pagoEm: null },
    });
  } catch {
    return { erro: "Não foi possível marcar como pendente. Tente de novo." };
  }
  revalidatePath("/admin/faturamento");
  revalidatePath("/admin");
  return {};
}
