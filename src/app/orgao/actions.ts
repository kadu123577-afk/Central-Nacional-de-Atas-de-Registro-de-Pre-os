"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  criarSessaoOrgao,
  encerrarSessaoOrgao,
  gastarTempoDeHash,
  hashSenha,
  orgaoIdLogado,
  verificarSenha,
} from "@/lib/auth";
import {
  checarBloqueioLogin,
  checarLimiteCadastro,
  registrarFalhaLogin,
  registrarSucessoLogin,
} from "@/lib/limite-tentativas";
import { registrarAuditoria } from "@/lib/auditoria";
import { destinoSeguro } from "@/lib/destino-login";
import { validarSenhaNova } from "@/lib/senha";
import { esferaValida } from "@/lib/esferas";
import type { EstadoTrocarSenha } from "@/components/ui/formulario-trocar-senha";

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

  if (!nome || !cnpj || !uf || !municipio || !esfera || !email) {
    return { erro: "Preencha todos os campos." };
  }
  const erroSenha = validarSenhaNova(senha, email);
  if (erroSenha) {
    return { erro: erroSenha };
  }
  const limiteCadastro = await checarLimiteCadastro();
  if (limiteCadastro) {
    return { erro: limiteCadastro };
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

  await registrarAuditoria({ ator: `orgao:${orgao.id}`, acao: "orgao.cadastro" });
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

  const bloqueio = await checarBloqueioLogin("orgao", email);
  if (bloqueio) {
    return { erro: bloqueio };
  }

  const orgao = await prisma.orgao.findUnique({ where: { email } });
  if (!orgao?.senhaHash) {
    await gastarTempoDeHash(senha);
    await registrarFalhaLogin("orgao", email);
    return { erro: "E-mail ou senha inválidos." };
  }

  const senhaCorreta = await verificarSenha(senha, orgao.senhaHash);
  if (!senhaCorreta) {
    await registrarFalhaLogin("orgao", email);
    await registrarAuditoria({ ator: `orgao:${orgao.id}`, acao: "orgao.login_falhou" });
    return { erro: "E-mail ou senha inválidos." };
  }

  if (!orgao.ativo) {
    return { erro: "Esta conta foi desativada. Fale com a ARCA Capital para reativar o acesso." };
  }

  await registrarSucessoLogin("orgao", email);
  await registrarAuditoria({ ator: `orgao:${orgao.id}`, acao: "orgao.login" });
  await criarSessaoOrgao(orgao.id);
  redirect(destinoSeguro(formData.get("destino"), "orgao", "/orgao"));
}

export async function logoutOrgao(): Promise<void> {
  await encerrarSessaoOrgao();
  redirect("/orgao/login");
}

export async function trocarSenhaOrgao(
  _estadoAnterior: EstadoTrocarSenha,
  formData: FormData,
): Promise<EstadoTrocarSenha> {
  const orgaoId = await orgaoIdLogado();
  if (!orgaoId) {
    redirect("/orgao/login");
  }

  const senhaAtual = String(formData.get("senhaAtual") ?? "");
  const senhaNova = String(formData.get("senhaNova") ?? "");
  const confirmacao = String(formData.get("confirmacaoSenhaNova") ?? "");

  const orgao = await prisma.orgao.findUnique({ where: { id: orgaoId } });
  const erroSenha = validarSenhaNova(senhaNova, orgao?.email ?? undefined);
  if (erroSenha) {
    return { erro: erroSenha };
  }
  if (senhaNova !== confirmacao) {
    return { erro: "A confirmação não bate com a nova senha." };
  }

  if (!orgao?.senhaHash) {
    return { erro: "Conta inválida." };
  }

  const senhaAtualCorreta = await verificarSenha(senhaAtual, orgao.senhaHash);
  if (!senhaAtualCorreta) {
    return { erro: "Senha atual incorreta." };
  }

  const senhaHash = await hashSenha(senhaNova);
  await prisma.orgao.update({
    where: { id: orgaoId },
    data: { senhaHash, sessaoVersao: { increment: 1 } },
  });
  await criarSessaoOrgao(orgaoId);
  await registrarAuditoria({ ator: `orgao:${orgaoId}`, acao: "orgao.troca_senha" });
  return { sucesso: true };
}
