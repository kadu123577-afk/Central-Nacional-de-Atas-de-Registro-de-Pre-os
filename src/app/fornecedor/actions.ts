"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  criarSessaoFornecedor,
  encerrarSessaoFornecedor,
  fornecedorIdLogado,
  hashSenha,
  verificarSenha,
} from "@/lib/auth";
import type { EstadoTrocarSenha } from "@/components/ui/formulario-trocar-senha";

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

export async function trocarSenhaFornecedor(
  _estadoAnterior: EstadoTrocarSenha,
  formData: FormData,
): Promise<EstadoTrocarSenha> {
  const fornecedorId = await fornecedorIdLogado();
  if (!fornecedorId) {
    redirect("/fornecedor/login");
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

  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: fornecedorId } });
  if (!fornecedor?.senhaHash) {
    return { erro: "Conta inválida." };
  }

  const senhaAtualCorreta = await verificarSenha(senhaAtual, fornecedor.senhaHash);
  if (!senhaAtualCorreta) {
    return { erro: "Senha atual incorreta." };
  }

  const senhaHash = await hashSenha(senhaNova);
  await prisma.fornecedor.update({ where: { id: fornecedorId }, data: { senhaHash } });
  return { sucesso: true };
}
