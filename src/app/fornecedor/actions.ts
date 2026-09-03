"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { criarSessaoFornecedor, encerrarSessaoFornecedor, verificarSenha } from "@/lib/auth";

export interface EstadoLoginFornecedor {
  erro?: string;
}

export async function loginFornecedor(
  _estadoAnterior: EstadoLoginFornecedor,
  formData: FormData,
): Promise<EstadoLoginFornecedor> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const fornecedor = await prisma.fornecedor.findUnique({ where: { email } });
  if (!fornecedor?.senhaHash) {
    return { erro: "E-mail ou senha inválidos." };
  }

  const senhaCorreta = await verificarSenha(senha, fornecedor.senhaHash);
  if (!senhaCorreta) {
    return { erro: "E-mail ou senha inválidos." };
  }

  await criarSessaoFornecedor(fornecedor.id);
  redirect("/fornecedor");
}

export async function logoutFornecedor(): Promise<void> {
  await encerrarSessaoFornecedor();
  redirect("/fornecedor/login");
}
