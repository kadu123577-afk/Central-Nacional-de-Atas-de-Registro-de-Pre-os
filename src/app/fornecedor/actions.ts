"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  criarSessaoFornecedor,
  encerrarSessaoFornecedor,
  fornecedorIdLogado,
  gastarTempoDeHash,
  hashSenha,
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

  if (!razaoSocial || !cnpj || !email) {
    return { erro: "Preencha razão social, CNPJ e e-mail." };
  }
  const erroSenha = validarSenhaNova(senha, email);
  if (erroSenha) {
    return { erro: erroSenha };
  }

  const limiteCadastro = await checarLimiteCadastro();
  if (limiteCadastro) {
    return { erro: limiteCadastro };
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

  await registrarAuditoria({
    ator: `fornecedor:${fornecedor.id}`,
    acao: "fornecedor.cadastro",
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

  const bloqueio = await checarBloqueioLogin("fornecedor", email);
  if (bloqueio) {
    return { erro: bloqueio };
  }

  const fornecedor = await prisma.fornecedor.findUnique({ where: { email } });
  if (!fornecedor?.senhaHash) {
    await gastarTempoDeHash(senha);
    await registrarFalhaLogin("fornecedor", email);
    return { erro: "E-mail ou senha inválidos." };
  }

  const senhaCorreta = await verificarSenha(senha, fornecedor.senhaHash);
  if (!senhaCorreta) {
    await registrarFalhaLogin("fornecedor", email);
    await registrarAuditoria({
      ator: `fornecedor:${fornecedor.id}`,
      acao: "fornecedor.login_falhou",
    });
    return { erro: "E-mail ou senha inválidos." };
  }

  if (!fornecedor.ativo) {
    return { erro: "Esta conta foi desativada. Fale com a Tech 10 para reativar o acesso." };
  }

  await registrarSucessoLogin("fornecedor", email);
  await registrarAuditoria({ ator: `fornecedor:${fornecedor.id}`, acao: "fornecedor.login" });
  await criarSessaoFornecedor(fornecedor.id);
  redirect(destinoSeguro(formData.get("destino"), "fornecedor", "/fornecedor"));
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

  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: fornecedorId } });
  const erroSenha = validarSenhaNova(senhaNova, fornecedor?.email);
  if (erroSenha) {
    return { erro: erroSenha };
  }
  if (senhaNova !== confirmacao) {
    return { erro: "A confirmação não bate com a nova senha." };
  }

  if (!fornecedor?.senhaHash) {
    return { erro: "Conta inválida." };
  }

  const senhaAtualCorreta = await verificarSenha(senhaAtual, fornecedor.senhaHash);
  if (!senhaAtualCorreta) {
    return { erro: "Senha atual incorreta." };
  }

  const senhaHash = await hashSenha(senhaNova);
  // Incrementar sessaoVersao derruba as outras sessões abertas desta conta;
  // a sessão atual é reemitida logo em seguida.
  await prisma.fornecedor.update({
    where: { id: fornecedorId },
    data: { senhaHash, sessaoVersao: { increment: 1 } },
  });
  await criarSessaoFornecedor(fornecedorId);
  await registrarAuditoria({ ator: `fornecedor:${fornecedorId}`, acao: "fornecedor.troca_senha" });
  return { sucesso: true };
}
