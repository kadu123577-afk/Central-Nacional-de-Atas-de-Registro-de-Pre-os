import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

/**
 * Sessão por cookie assinado (HMAC-SHA256), sem serviço externo — a
 * "solução equivalente" ao Supabase Auth prevista no plano para os logins
 * de fornecedor e de órgão comprador, usada porque o projeto Supabase ainda
 * não existe. O contrato (login seta um cookie httpOnly, cada painel lê sua
 * sessão) foi desenhado para ser substituído por Supabase Auth sem mudar as
 * páginas que o consomem, quando a conta for provisionada.
 */

type TipoSessao = "fornecedor" | "orgao" | "admin";

const COOKIE_POR_TIPO: Record<TipoSessao, string> = {
  fornecedor: "fornecedor_sessao",
  orgao: "orgao_sessao",
  admin: "admin_sessao",
};
const DURACAO_SESSAO_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

function segredoSessao(): string {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo) {
    throw new Error(
      "SESSION_SECRET não definido — configure uma string aleatória longa no .env",
    );
  }
  return segredo;
}

function assinar(payload: string): string {
  return createHmac("sha256", segredoSessao()).update(payload).digest("hex");
}

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 12);
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

async function criarSessao(tipo: TipoSessao, id: string): Promise<void> {
  const expiraEm = Date.now() + DURACAO_SESSAO_MS;
  const payload = `${id}.${expiraEm}`;
  const assinatura = assinar(payload);
  const valorCookie = `${payload}.${assinatura}`;

  const store = await cookies();
  store.set(COOKIE_POR_TIPO[tipo], valorCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiraEm),
  });
}

async function encerrarSessao(tipo: TipoSessao): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_POR_TIPO[tipo]);
}

async function idLogado(tipo: TipoSessao): Promise<string | null> {
  const store = await cookies();
  const valorCookie = store.get(COOKIE_POR_TIPO[tipo])?.value;
  if (!valorCookie) return null;

  const partes = valorCookie.split(".");
  if (partes.length !== 3) return null;
  const [id, expiraEmStr, assinatura] = partes;

  const payload = `${id}.${expiraEmStr}`;
  const assinaturaEsperada = assinar(payload);

  const bufferRecebido = Buffer.from(assinatura);
  const bufferEsperado = Buffer.from(assinaturaEsperada);
  if (
    bufferRecebido.length !== bufferEsperado.length ||
    !timingSafeEqual(bufferRecebido, bufferEsperado)
  ) {
    return null;
  }

  const expiraEm = Number(expiraEmStr);
  if (!Number.isFinite(expiraEm) || expiraEm < Date.now()) {
    return null;
  }

  return id;
}

export const criarSessaoFornecedor = (fornecedorId: string) =>
  criarSessao("fornecedor", fornecedorId);
export const encerrarSessaoFornecedor = () => encerrarSessao("fornecedor");
export const fornecedorIdLogado = () => idLogado("fornecedor");

export const criarSessaoOrgao = (orgaoId: string) => criarSessao("orgao", orgaoId);
export const encerrarSessaoOrgao = () => encerrarSessao("orgao");
export const orgaoIdLogado = () => idLogado("orgao");

export const criarSessaoAdmin = (adminId: string) => criarSessao("admin", adminId);
export const encerrarSessaoAdmin = () => encerrarSessao("admin");
export const adminIdLogado = () => idLogado("admin");
