"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  criarSessaoOrgao,
  encerrarSessaoOrgao,
  hashSenha,
  verificarSenha,
} from "@/lib/auth";
import { esferaValida } from "@/lib/esferas";

export interface EstadoFormularioOrgao {
  erro?: string;
}

export async function cadastrarOrgao(
  _estadoAnterior: EstadoFormularioOrgao,
  formData: FormData,
): Promise<EstadoFormularioOrgao> {
  const nome = String(formData.get("nome") ?? "").trim();
  const cnpj = String(formData.get("cnpj") ?? "").trim();
  const uf = String(formData.get("uf") ?? "").trim().toUpperCase();
  const municipio = String(formData.get("municipio") ?? "").trim();
  const esfera = String(formData.get("esfera") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!nome || !cnpj || !uf || !municipio || !esfera || !email || senha.length < 8) {
    return {
      erro: "Preencha todos os campos (senha precisa ter ao menos 8 caracteres).",
    };
  }
  if (!esferaValida(esfera)) {
    return { erro: "Selecione uma esfera válida (federal, estadual, distrital ou municipal)." };
  }

  const jaExiste = await prisma.orgao.findFirst({
    where: { OR: [{ cnpj }, { email }] },
  });
  if (jaExiste) {
    return { erro: "Já existe um órgão cadastrado com esse CNPJ ou e-mail." };
  }

  const senhaHash = await hashSenha(senha);
  const orgao = await prisma.orgao.create({
    data: { nome, cnpj, uf, municipio, esfera, email, senhaHash },
  });

  await criarSessaoOrgao(orgao.id);
  redirect("/orgao");
}

export async function loginOrgao(
  _estadoAnterior: EstadoFormularioOrgao,
  formData: FormData,
): Promise<EstadoFormularioOrgao> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const orgao = await prisma.orgao.findUnique({ where: { email } });
  if (!orgao?.senhaHash) {
    return { erro: "E-mail ou senha inválidos." };
  }

  const senhaCorreta = await verificarSenha(senha, orgao.senhaHash);
  if (!senhaCorreta) {
    return { erro: "E-mail ou senha inválidos." };
  }

  if (!orgao.ativo) {
    return { erro: "Esta conta foi desativada. Fale com a Tech 10 para reativar o acesso." };
  }

  await criarSessaoOrgao(orgao.id);
  redirect("/orgao");
}

export async function logoutOrgao(): Promise<void> {
  await encerrarSessaoOrgao();
  redirect("/orgao/login");
}
