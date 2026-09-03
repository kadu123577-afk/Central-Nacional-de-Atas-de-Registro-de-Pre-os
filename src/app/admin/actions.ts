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
