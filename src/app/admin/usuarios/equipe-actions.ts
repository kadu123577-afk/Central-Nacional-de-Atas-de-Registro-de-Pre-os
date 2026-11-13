"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdLogado, hashSenha } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { normalizarPermissoes, perfilPorChave, type Permissao } from "@/lib/permissoes";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";
import { validarSenhaNova } from "@/lib/senha";

/**
 * Equipe interna (2026-11-13): cria contas de admin com permissões por
 * atividade, edita o conjunto de permissões e ativa ou desativa a conta. Tudo
 * exige "usuarios.gerir" e vai para a trilha de auditoria. O acesso ao
 * financeiro da SCP NÃO é concedido aqui: continua só por script
 * (npm run admin:financeiro), com 2FA.
 *
 * Trava contra bloqueio: nunca deixa a base sem pelo menos uma conta ativa com
 * "usuarios.gerir", senão ninguém mais conseguiria cuidar da equipe.
 */

export interface EstadoEquipe {
  erro?: string;
  ok?: boolean;
}

const LIMITE_CARGO = 60;
const LIMITE_NOME = 120;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ERRO_ULTIMO_GESTOR = "Esta mudança deixaria o sistema sem nenhum gestor de usuários ativo. Dê a permissão a outra conta antes.";

/** Sessão e permissão antes de ler qualquer campo do formulário. */
async function exigirGestor(): Promise<string> {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "usuarios.gerir");
  return adminId;
}

function campo(formData: FormData, nome: string): string {
  const valor = formData.get(nome);
  // Arquivo anexado a um campo de texto (requisição montada à mão) não é texto.
  return typeof valor === "string" ? valor : "";
}

/** O id vem de campo oculto, ou seja, do navegador: só passa o que tem forma de id. */
function idComFormaValida(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function permissoesDoFormulario(formData: FormData): Permissao[] {
  return normalizarPermissoes(formData.getAll("permissao"));
}

/** Há outra conta ativa, além desta, com "usuarios.gerir"? */
async function existeOutroGestor(alvoId: string): Promise<boolean> {
  const outros = await prisma.admin.count({
    where: { id: { not: alvoId }, ativo: true, permissoes: { has: "usuarios.gerir" } },
  });
  return outros > 0;
}

export async function criarMembroEquipe(_estadoAnterior: EstadoEquipe, formData: FormData): Promise<EstadoEquipe> {
  const adminId = await exigirGestor();

  const nome = campo(formData, "nome").trim().slice(0, LIMITE_NOME);
  const email = campo(formData, "email").trim().toLowerCase();
  const senha = campo(formData, "senha");
  const cargo = campo(formData, "cargo").trim().slice(0, LIMITE_CARGO) || null;
  const perfil = perfilPorChave(campo(formData, "perfil"));

  if (!nome || !email) return { erro: "Informe nome e e-mail." };
  if (!FORMATO_EMAIL.test(email)) return { erro: "Informe um e-mail válido." };
  const erroSenha = validarSenhaNova(senha, email);
  if (erroSenha) return { erro: erroSenha };

  const marcadas = permissoesDoFormulario(formData);
  const permissoes = marcadas.length > 0 ? marcadas : normalizarPermissoes(perfil?.permissoes ?? []);

  const senhaHash = await hashSenha(senha);
  let criadoId: string;
  try {
    const criado = await prisma.admin.create({
      data: { nome, email, senhaHash, cargo, permissoes },
      select: { id: true },
    });
    criadoId = criado.id;
  } catch {
    return { erro: "Já existe uma conta de administração com esse e-mail." };
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.criarMembroEquipe",
    alvo: criadoId,
    detalhe: `cargo ${cargo ?? "—"}; permissões: ${permissoes.join(", ") || "nenhuma"}`,
  });
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function atualizarMembroEquipe(_estadoAnterior: EstadoEquipe, formData: FormData): Promise<EstadoEquipe> {
  const adminId = await exigirGestor();

  const alvoId = campo(formData, "adminId");
  if (!idComFormaValida(alvoId)) return { erro: "Conta não encontrada." };
  const alvo = await prisma.admin.findUnique({
    where: { id: alvoId },
    select: { id: true, ativo: true, cargo: true, permissoes: true },
  });
  if (!alvo) return { erro: "Conta não encontrada." };

  const cargo = campo(formData, "cargo").trim().slice(0, LIMITE_CARGO) || null;
  const permissoes = permissoesDoFormulario(formData);

  if (alvo.ativo && !permissoes.includes("usuarios.gerir") && !(await existeOutroGestor(alvo.id))) {
    return { erro: ERRO_ULTIMO_GESTOR };
  }

  await prisma.admin.update({ where: { id: alvo.id }, data: { cargo, permissoes } });
  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.atualizarMembroEquipe",
    alvo: alvo.id,
    detalhe: `antes: ${normalizarPermissoes(alvo.permissoes).join(", ") || "nenhuma"}; depois: ${permissoes.join(", ") || "nenhuma"}`,
  });
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

/** Ativa ou desativa a conta. Desativar derruba a sessão na hora (src/lib/auth.ts). Ninguém desativa a si mesmo. */
export async function alternarAtivoMembro(_estadoAnterior: EstadoEquipe, formData: FormData): Promise<EstadoEquipe> {
  const adminId = await exigirGestor();

  const alvoId = campo(formData, "adminId");
  if (!idComFormaValida(alvoId)) return { erro: "Conta não encontrada." };
  const alvo = await prisma.admin.findUnique({ where: { id: alvoId }, select: { id: true, ativo: true, permissoes: true } });
  if (!alvo) return { erro: "Conta não encontrada." };

  if (alvo.ativo) {
    if (alvo.id === adminId) return { erro: "Você não pode desativar a própria conta." };
    if (normalizarPermissoes(alvo.permissoes).includes("usuarios.gerir") && !(await existeOutroGestor(alvo.id))) {
      return { erro: ERRO_ULTIMO_GESTOR };
    }
  }

  await prisma.admin.update({ where: { id: alvo.id }, data: { ativo: !alvo.ativo } });
  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: alvo.ativo ? "admin.desativarMembroEquipe" : "admin.ativarMembroEquipe",
    alvo: alvo.id,
  });
  revalidatePath("/admin/usuarios");
  return { ok: true };
}
