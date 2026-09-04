"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  criarSessaoFornecedor,
  encerrarSessaoFornecedor,
  hashSenha,
  verificarSenha,
} from "@/lib/auth";

export interface EstadoLoginFornecedor {
  erro?: string;
}

export async function cadastrarFornecedor(
  _estadoAnterior: EstadoLoginFornecedor,
  formData: FormData,
): Promise<EstadoLoginFornecedor> {
  const razaoSocial = String(formData.get("razaoSocial") ?? "").trim();
  const cnpj = String(formData.get("cnpj") ?? "").trim();
  const telefone = String(formData.get("telefone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!razaoSocial || !cnpj || !email || senha.length < 8) {
    return {
      erro: "Preencha razão social, CNPJ e e-mail (senha precisa ter ao menos 8 caracteres).",
    };
  }

  const existentePorCnpj = await prisma.fornecedor.findUnique({ where: { cnpj } });
  // Uma ata pode ter sido cadastrada por alguém da Tech 10 antes do fornecedor
  // ter conta própria (fluxo antigo de /atas/nova) — nesse caso o registro já
  // existe mas sem senha, e este cadastro "reivindica" a conta. Se já tem
  // senha, é um fornecedor que já se auto-cadastrou: não upserta por cima
  // (CNPJ não é segredo — permitir upsert livre aqui seria dar a qualquer um
  // que soubesse o CNPJ o poder de trocar a senha de outra empresa).
  if (existentePorCnpj?.senhaHash) {
    return { erro: "Já existe um fornecedor cadastrado com esse CNPJ. Faça login." };
  }

  const emailEmUso = await prisma.fornecedor.findFirst({
    where: { email, ...(existentePorCnpj ? { NOT: { id: existentePorCnpj.id } } : {}) },
  });
  if (emailEmUso) {
    return { erro: "Já existe um fornecedor cadastrado com esse e-mail." };
  }

  const senhaHash = await hashSenha(senha);
  const fornecedor = await prisma.fornecedor.upsert({
    where: { cnpj },
    update: { razaoSocial, telefone: telefone || null, email, senhaHash },
    create: { razaoSocial, cnpj, telefone: telefone || null, email, senhaHash },
  });

  await criarSessaoFornecedor(fornecedor.id);
  redirect("/fornecedor");
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

  if (!fornecedor.ativo) {
    return { erro: "Esta conta foi desativada. Fale com a Tech 10 para reativar o acesso." };
  }

  await criarSessaoFornecedor(fornecedor.id);
  redirect("/fornecedor");
}

export async function logoutFornecedor(): Promise<void> {
  await encerrarSessaoFornecedor();
  redirect("/fornecedor/login");
}
