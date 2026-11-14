"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdLogado, hashSenha } from "@/lib/auth";
import { gerarSenhaProvisoria } from "@/lib/senha-provisoria";
import { registrarAuditoria } from "@/lib/auditoria";
import { normalizarPermissoes, perfilPorChave, type Permissao } from "@/lib/permissoes";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";
import { validarSenhaNova } from "@/lib/senha";
import { lerTelefone } from "@/lib/telefone";
import { tipoVendedorValido } from "@/lib/vendedores";

/**
 * Equipe interna (2026-11-13): cria contas de admin com permissões por
 * atividade, edita a conta (nome, e-mail, cargo e permissões), ativa, desativa ou exclui. Os
 * consultores (vendedores) têm o mesmo: editar e excluir (a exclusão só vale para conta sem
 * histórico; com histórico, desativa). Tudo exige "usuarios.gerir" e vai para a trilha de auditoria. O acesso ao
 * financeiro da SCP NÃO é concedido aqui: continua só por script
 * (npm run admin:financeiro), com 2FA.
 *
 * Trava contra bloqueio: nunca deixa a base sem pelo menos uma conta ativa com
 * "usuarios.gerir", senão ninguém mais conseguiria cuidar da equipe.
 */

export interface EstadoEquipe {
  erro?: string;
  ok?: boolean;
  /** Senha provisória gerada pelo sistema: aparece uma vez, na tela de quem criou ou redefiniu a conta. */
  senhaProvisoria?: string;
}

const LIMITE_CARGO = 60;
const LIMITE_NOME = 120;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ERRO_ULTIMO_GESTOR = "Esta mudança deixaria o sistema sem nenhum gestor de usuários ativo. Dê a permissão a outra conta antes.";
const ERRO_EMAIL_REPETIDO = "Já existe uma conta com esse e-mail.";

/** Erro de chave única do Prisma (e-mail repetido). */
function emailRepetido(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && (erro as { code?: string }).code === "P2002";
}

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
  const senhaDigitada = campo(formData, "senha");
  const senha = senhaDigitada || gerarSenhaProvisoria();
  const cargo = campo(formData, "cargo").trim().slice(0, LIMITE_CARGO) || null;
  const perfil = perfilPorChave(campo(formData, "perfil"));

  if (!nome || !email) return { erro: "Informe nome e e-mail." };
  if (!FORMATO_EMAIL.test(email)) return { erro: "Informe um e-mail válido." };
  const telefone = lerTelefone(campo(formData, "telefone"));
  if (!telefone.ok) return { erro: telefone.erro };
  const erroSenha = validarSenhaNova(senha, email);
  if (erroSenha) return { erro: erroSenha };

  const marcadas = permissoesDoFormulario(formData);
  const permissoes = marcadas.length > 0 ? marcadas : normalizarPermissoes(perfil?.permissoes ?? []);

  const senhaHash = await hashSenha(senha);
  let criadoId: string;
  try {
    const criado = await prisma.admin.create({
      data: { nome, email, senhaHash, cargo, permissoes, senhaProvisoria: true, telefone: telefone.valor },
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
    detalhe: `cargo ${cargo ?? "—"}; permissões: ${permissoes.join(", ") || "nenhuma"}; ${telefone.valor ? "com celular; " : ""}senha ${senhaDigitada ? "digitada" : "gerada"}, a trocar no primeiro acesso`,
  });
  revalidatePath("/admin/usuarios");
  return senhaDigitada ? { ok: true } : { ok: true, senhaProvisoria: senha };
}

export async function atualizarMembroEquipe(_estadoAnterior: EstadoEquipe, formData: FormData): Promise<EstadoEquipe> {
  const adminId = await exigirGestor();

  const alvoId = campo(formData, "adminId");
  if (!idComFormaValida(alvoId)) return { erro: "Conta não encontrada." };
  const alvo = await prisma.admin.findUnique({
    where: { id: alvoId },
    select: { id: true, ativo: true, cargo: true, permissoes: true, nome: true, email: true, telefone: true },
  });
  if (!alvo) return { erro: "Conta não encontrada." };

  const cargo = campo(formData, "cargo").trim().slice(0, LIMITE_CARGO) || null;
  const permissoes = permissoesDoFormulario(formData);

  // Nome e e-mail só mudam quando o formulário os traz (a tela de edição traz; chamadas antigas, não).
  let nome: string | undefined;
  if (formData.has("nome")) {
    nome = campo(formData, "nome").trim().slice(0, LIMITE_NOME);
    if (!nome) return { erro: "Informe o nome." };
  }
  let email: string | undefined;
  if (formData.has("email")) {
    email = campo(formData, "email").trim().toLowerCase();
    if (!FORMATO_EMAIL.test(email)) return { erro: "Informe um e-mail válido." };
  }
  // O celular só muda quando o formulário o traz (a tela de edição traz); vazio apaga.
  let telefone: string | null | undefined;
  if (formData.has("telefone")) {
    const lido = lerTelefone(campo(formData, "telefone"));
    if (!lido.ok) return { erro: lido.erro };
    telefone = lido.valor;
  }
  const mudouNome = nome !== undefined && nome !== alvo.nome;
  const mudouEmail = email !== undefined && email !== alvo.email;
  const mudouTelefone = telefone !== undefined && telefone !== alvo.telefone;

  if (alvo.ativo && !permissoes.includes("usuarios.gerir") && !(await existeOutroGestor(alvo.id))) {
    return { erro: ERRO_ULTIMO_GESTOR };
  }

  try {
    await prisma.admin.update({
      where: { id: alvo.id },
      data: {
        cargo,
        permissoes,
        ...(mudouNome ? { nome } : {}),
        ...(mudouEmail ? { email } : {}),
        ...(mudouTelefone ? { telefone } : {}),
      },
    });
  } catch (erro) {
    if (emailRepetido(erro)) return { erro: ERRO_EMAIL_REPETIDO };
    throw erro;
  }
  // A trilha guarda o que mudou, não o e-mail, o nome nem o celular novos.
  const outras = [mudouNome ? "nome alterado" : null, mudouEmail ? "e-mail alterado" : null, mudouTelefone ? "celular alterado" : null]
    .filter(Boolean)
    .join("; ");
  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.atualizarMembroEquipe",
    alvo: alvo.id,
    detalhe: `antes: ${normalizarPermissoes(alvo.permissoes).join(", ") || "nenhuma"}; depois: ${permissoes.join(", ") || "nenhuma"}${outras ? `; ${outras}` : ""}`,
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

/**
 * Exclui a conta da equipe, em definitivo. Ninguém exclui a própria conta, e a exclusão nunca deixa o
 * sistema sem um gestor de usuários ativo. As ações que a pessoa fez ficam na trilha de auditoria (que
 * guarda o id e não depende da conta). Para quem já trabalhou no sistema, desativar costuma ser melhor.
 */
export async function excluirMembroEquipe(_estadoAnterior: EstadoEquipe, formData: FormData): Promise<EstadoEquipe> {
  const adminId = await exigirGestor();

  const alvoId = campo(formData, "adminId");
  if (!idComFormaValida(alvoId)) return { erro: "Conta não encontrada." };
  if (alvoId === adminId) return { erro: "Você não pode excluir a própria conta." };
  const alvo = await prisma.admin.findUnique({
    where: { id: alvoId },
    select: { id: true, nome: true, cargo: true, ativo: true, permissoes: true },
  });
  if (!alvo) return { erro: "Conta não encontrada." };

  if (alvo.ativo && normalizarPermissoes(alvo.permissoes).includes("usuarios.gerir") && !(await existeOutroGestor(alvo.id))) {
    return { erro: ERRO_ULTIMO_GESTOR };
  }

  const { count } = await prisma.admin.deleteMany({ where: { id: alvo.id } });
  if (count === 0) return { erro: "Conta não encontrada." };

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.excluirMembroEquipe",
    alvo: alvo.id,
    detalhe: `conta de ${alvo.nome}${alvo.cargo ? ` (${alvo.cargo})` : ""} excluída`,
  });
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

/** Edita nome, e-mail, celular e tipo (interno ou externo) de um consultor de vendas. A senha não muda aqui (use Redefinir senha). */
export async function atualizarVendedor(_estadoAnterior: EstadoEquipe, formData: FormData): Promise<EstadoEquipe> {
  const adminId = await exigirGestor();

  const alvoId = campo(formData, "vendedorId");
  if (!idComFormaValida(alvoId)) return { erro: "Consultor não encontrado." };
  const alvo = await prisma.vendedor.findUnique({
    where: { id: alvoId },
    select: { id: true, nome: true, email: true, tipo: true, telefone: true },
  });
  if (!alvo) return { erro: "Consultor não encontrado." };

  const nome = campo(formData, "nome").trim().slice(0, LIMITE_NOME);
  const email = campo(formData, "email").trim().toLowerCase();
  const tipo = campo(formData, "tipo").trim();
  if (!nome) return { erro: "Informe o nome." };
  if (!FORMATO_EMAIL.test(email)) return { erro: "Informe um e-mail válido." };
  if (!tipoVendedorValido(tipo)) return { erro: "Selecione um tipo de consultor válido." };
  let telefone: string | null | undefined;
  if (formData.has("telefone")) {
    const lido = lerTelefone(campo(formData, "telefone"));
    if (!lido.ok) return { erro: lido.erro };
    telefone = lido.valor;
  }

  const mudou = [
    nome !== alvo.nome ? "nome" : null,
    email !== alvo.email ? "e-mail" : null,
    tipo !== alvo.tipo ? "tipo" : null,
    telefone !== undefined && telefone !== alvo.telefone ? "celular" : null,
  ].filter(Boolean);
  if (mudou.length === 0) return { ok: true };

  try {
    await prisma.vendedor.update({
      where: { id: alvo.id },
      data: { nome, email, tipo, ...(telefone !== undefined && telefone !== alvo.telefone ? { telefone } : {}) },
    });
  } catch (erro) {
    if (emailRepetido(erro)) return { erro: ERRO_EMAIL_REPETIDO };
    throw erro;
  }
  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.atualizarVendedor",
    alvo: alvo.id,
    detalhe: `alterado: ${mudou.join(", ")}`,
  });
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

/**
 * Exclui um consultor de vendas, em definitivo, só se ele não tem história: nenhuma ata, nenhum município
 * e nenhum pedido de negociação. Com história (que também alimenta o financeiro), o caminho é desativar.
 */
export async function excluirVendedor(_estadoAnterior: EstadoEquipe, formData: FormData): Promise<EstadoEquipe> {
  const adminId = await exigirGestor();

  const alvoId = campo(formData, "vendedorId");
  if (!idComFormaValida(alvoId)) return { erro: "Consultor não encontrado." };
  const alvo = await prisma.vendedor.findUnique({
    where: { id: alvoId },
    select: { id: true, nome: true, _count: { select: { atas: true, oportunidades: true, pedidosNegociacao: true } } },
  });
  if (!alvo) return { erro: "Consultor não encontrado." };

  const { atas, oportunidades, pedidosNegociacao } = alvo._count;
  if (atas + oportunidades + pedidosNegociacao > 0) {
    return { erro: "Este consultor tem atas, municípios ou pedidos no histórico: não dá para excluir. Desative a conta." };
  }

  try {
    await prisma.$transaction([
      prisma.credenciamentoConsultor.deleteMany({ where: { vendedorId: alvo.id } }),
      prisma.vendedor.delete({ where: { id: alvo.id } }),
    ]);
  } catch {
    return { erro: "Não foi possível excluir: a conta tem histórico no sistema. Desative a conta." };
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.excluirVendedor",
    alvo: alvo.id,
    detalhe: `consultor ${alvo.nome} excluído`,
  });
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

/**
 * Redefine a senha de uma conta (equipe interna ou vendedor): gera uma senha provisória nova,
 * derruba as sessões abertas e obriga a troca no próximo acesso. A senha aparece uma vez, na
 * tela de quem redefiniu. Ninguém redefine a própria senha por aqui (a tela Perfil faz isso).
 */
export async function redefinirSenha(_estadoAnterior: EstadoEquipe, formData: FormData): Promise<EstadoEquipe> {
  const adminId = await exigirGestor();

  const tipo = campo(formData, "tipo");
  const alvoId = campo(formData, "id");
  if ((tipo !== "admin" && tipo !== "vendedor") || !idComFormaValida(alvoId)) return { erro: "Conta não encontrada." };
  if (tipo === "admin" && alvoId === adminId) return { erro: "Para trocar a sua própria senha, use a tela Perfil." };

  const senha = gerarSenhaProvisoria();
  const dados = { senhaHash: await hashSenha(senha), senhaProvisoria: true, sessaoVersao: { increment: 1 } };
  try {
    if (tipo === "admin") await prisma.admin.update({ where: { id: alvoId }, data: dados });
    else await prisma.vendedor.update({ where: { id: alvoId }, data: dados });
  } catch {
    return { erro: "Conta não encontrada." };
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.redefinirSenha",
    alvo: `${tipo}:${alvoId}`,
    detalhe: "senha provisória gerada; troca obrigatória no próximo acesso",
  });
  revalidatePath("/admin/usuarios");
  return { ok: true, senhaProvisoria: senha };
}
