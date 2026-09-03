import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

/**
 * Sessão de fornecedor por cookie assinado (HMAC-SHA256), sem serviço externo.
 *
 * É a "solução equivalente" ao Supabase Auth prevista no plano para o Sprint 4
 * — implementada agora porque o projeto Supabase ainda não existe. O contrato
 * (login seta um cookie httpOnly, painel lê `getFornecedorLogado()`) foi
 * desenhado para ser substituído por Supabase Auth sem mudar as páginas que o
 * consomem, quando a conta for provisionada.
 */

const COOKIE_NOME = "fornecedor_sessao";
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

export async function criarSessaoFornecedor(fornecedorId: string): Promise<void> {
  const expiraEm = Date.now() + DURACAO_SESSAO_MS;
  const payload = `${fornecedorId}.${expiraEm}`;
  const assinatura = assinar(payload);
  const valorCookie = `${payload}.${assinatura}`;

  const store = await cookies();
  store.set(COOKIE_NOME, valorCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiraEm),
  });
}

export async function encerrarSessaoFornecedor(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NOME);
}

export async function fornecedorIdLogado(): Promise<string | null> {
  const store = await cookies();
  const valorCookie = store.get(COOKIE_NOME)?.value;
  if (!valorCookie) return null;

  const partes = valorCookie.split(".");
  if (partes.length !== 3) return null;
  const [fornecedorId, expiraEmStr, assinatura] = partes;

  const payload = `${fornecedorId}.${expiraEmStr}`;
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

  return fornecedorId;
}
