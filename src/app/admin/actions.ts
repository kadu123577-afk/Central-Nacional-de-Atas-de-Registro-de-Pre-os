"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  adminIdLogado,
  criarSessaoAdmin,
  encerrarSessaoAdmin,
  hashSenha,
  verificarSenha,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { EstadoTrocarSenha } from "@/components/ui/formulario-trocar-senha";

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

export interface EstadoCompletarAta {
  erro?: string;
}

/**
 * Corrige o fornecedor de uma ata importada do PNCP sem fornecedor real
 * identificado. NÃO edita o fornecedor-placeholder em si (CNPJ
 * 00000000000000) — ele é compartilhado por qualquer ata PNCP ainda sem
 * fornecedor confirmado, editar em cima dele mudaria o fornecedor de
 * TODAS as outras atas que ainda apontam pra ele. Em vez disso, faz
 * upsert de um fornecedor real (por CNPJ) e reaponta só esta ata pra ele.
 */
export async function completarFornecedorDaAta(
  _estadoAnterior: EstadoCompletarAta,
  formData: FormData,
): Promise<EstadoCompletarAta> {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const ataId = String(formData.get("ataId") ?? "");
  const razaoSocial = String(formData.get("razaoSocial") ?? "").trim();
  const cnpj = String(formData.get("cnpj") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!ataId || !razaoSocial || !cnpj || !email) {
    return { erro: "Preencha razão social, CNPJ e e-mail do fornecedor." };
  }

  const fornecedorReal = await prisma.fornecedor.upsert({
    where: { cnpj },
    update: { razaoSocial, email },
    create: { razaoSocial, cnpj, email },
  });

  await prisma.ata.update({ where: { id: ataId }, data: { fornecedorId: fornecedorReal.id } });
  revalidatePath(`/admin/atas/${ataId}/completar`);
  revalidatePath("/admin");
  return {};
}

export interface EstadoAdicionarItem {
  erro?: string;
}

export async function adicionarItemNaAta(
  _estadoAnterior: EstadoAdicionarItem,
  formData: FormData,
): Promise<EstadoAdicionarItem> {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const ataId = String(formData.get("ataId") ?? "");
  const descricao = String(formData.get("descricao") ?? "").trim();
  const categoria = String(formData.get("categoria") ?? "").trim();
  const unidade = String(formData.get("unidade") ?? "").trim();
  const quantidadeRegistrada = Number(formData.get("quantidadeRegistrada"));
  const valorUnitario = String(formData.get("valorUnitario") ?? "").trim();

  if (
    !ataId ||
    !descricao ||
    !categoria ||
    !unidade ||
    !valorUnitario ||
    !Number.isFinite(quantidadeRegistrada) ||
    quantidadeRegistrada <= 0
  ) {
    return { erro: "Preencha todos os campos do item com valores válidos." };
  }

  await prisma.item.create({
    data: {
      ataId,
      descricao,
      categoria,
      unidade,
      quantidadeRegistrada,
      valorUnitario,
      saldo: { create: {} },
    },
  });

  revalidatePath(`/admin/atas/${ataId}/completar`);
  revalidatePath("/admin");
  return {};
}

export async function trocarSenhaAdmin(
  _estadoAnterior: EstadoTrocarSenha,
  formData: FormData,
): Promise<EstadoTrocarSenha> {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const senhaAtual = String(formData.get("senhaAtual") ?? "");
  const senhaNova = String(formData.get("senhaNova") ?? "");
  const confirmacao = String(formData.get("confirmacaoSenhaNova") ?? "");

  if (senhaNova.length < 8) {
    return { erro: "A nova senha precisa ter ao menos 8 caracteres." };
  }
  if (senhaNova !== confirmacao) {
    return { erro: "A confirmação não bate com a nova senha." };
  }

  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) {
    return { erro: "Conta inválida." };
  }

  const senhaAtualCorreta = await verificarSenha(senhaAtual, admin.senhaHash);
  if (!senhaAtualCorreta) {
    return { erro: "Senha atual incorreta." };
  }

  const senhaHash = await hashSenha(senhaNova);
  await prisma.admin.update({ where: { id: adminId }, data: { senhaHash } });
  return { sucesso: true };
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
