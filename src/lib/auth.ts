import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Sessão por cookie assinado (HMAC-SHA256), sem serviço externo — a
 * "solução equivalente" ao Supabase Auth prevista no plano para os logins
 * de fornecedor e de órgão comprador, usada porque o projeto Supabase ainda
 * não existe. O contrato (login seta um cookie httpOnly, cada painel lê sua
 * sessão) foi desenhado para ser substituído por Supabase Auth sem mudar as
 * páginas que o consomem, quando a conta for provisionada.
 *
 * Endurecimento (2026-10-20):
 * - O cookie carrega a `sessaoVersao` do usuário. Trocar a senha incrementa
 *   a versão no banco e derruba todas as sessões antigas.
 * - A cada leitura a conta é conferida no banco: usuário apagado ou
 *   desativado perde o acesso na hora, sem esperar o cookie expirar.
 * - Em produção o cookie usa o prefixo __Host- (só vale com Secure, Path=/
 *   e sem Domain), o que impede que um subdomínio o sobrescreva.
 * - Admin e vendedor têm sessão mais curta e SameSite=Strict.
 */

type TipoSessao = "fornecedor" | "orgao" | "admin" | "vendedor";

const EM_PRODUCAO = process.env.NODE_ENV === "production";
const PREFIXO_COOKIE = EM_PRODUCAO ? "__Host-" : "";

const COOKIE_POR_TIPO: Record<TipoSessao, string> = {
  fornecedor: `${PREFIXO_COOKIE}fornecedor_sessao`,
  orgao: `${PREFIXO_COOKIE}orgao_sessao`,
  admin: `${PREFIXO_COOKIE}admin_sessao`,
  vendedor: `${PREFIXO_COOKIE}vendedor_sessao`,
};

const HORA_MS = 1000 * 60 * 60;
const DURACAO_POR_TIPO: Record<TipoSessao, number> = {
  admin: 8 * HORA_MS,
  vendedor: 24 * HORA_MS,
  fornecedor: 7 * 24 * HORA_MS,
  orgao: 7 * 24 * HORA_MS,
};

const SAMESITE_POR_TIPO: Record<TipoSessao, "strict" | "lax"> = {
  admin: "strict",
  vendedor: "strict",
  fornecedor: "lax",
  orgao: "lax",
};

function segredoSessao(): string {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) {
    throw new Error(
      "SESSION_SECRET ausente ou curto demais — configure uma string aleatória de ao menos 32 caracteres no .env",
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

let hashFalso: string | undefined;

/**
 * Gasta o mesmo tempo de uma conferência de senha. Chamada quando o e-mail
 * não existe, para que o tempo de resposta não revele quais e-mails têm conta.
 */
export async function gastarTempoDeHash(senha: string): Promise<void> {
  hashFalso ??= await bcrypt.hash("senha-falsa-para-igualar-o-tempo", 12);
  await bcrypt.compare(senha, hashFalso);
}

/**
 * Versão atual de sessão da conta, ou null se a conta não existe ou está
 * desativada (nesse caso nenhuma sessão dela vale).
 */
async function versaoAtualDaConta(tipo: TipoSessao, id: string): Promise<number | null> {
  switch (tipo) {
    case "admin": {
      const conta = await prisma.admin.findUnique({
        where: { id },
        select: { sessaoVersao: true },
      });
      return conta ? conta.sessaoVersao : null;
    }
    case "fornecedor": {
      const conta = await prisma.fornecedor.findUnique({
        where: { id },
        select: { sessaoVersao: true, ativo: true },
      });
      return conta?.ativo ? conta.sessaoVersao : null;
    }
    case "orgao": {
      const conta = await prisma.orgao.findUnique({
        where: { id },
        select: { sessaoVersao: true, ativo: true },
      });
      return conta?.ativo ? conta.sessaoVersao : null;
    }
    case "vendedor": {
      const conta = await prisma.vendedor.findUnique({
        where: { id },
        select: { sessaoVersao: true, ativo: true },
      });
      return conta?.ativo ? conta.sessaoVersao : null;
    }
  }
}

async function criarSessao(tipo: TipoSessao, id: string): Promise<void> {
  const versao = (await versaoAtualDaConta(tipo, id)) ?? 0;
  const expiraEm = Date.now() + DURACAO_POR_TIPO[tipo];
  const payload = `${id}.${versao}.${expiraEm}`;
  const assinatura = assinar(payload);
  const valorCookie = `${payload}.${assinatura}`;

  const store = await cookies();
  store.set(COOKIE_POR_TIPO[tipo], valorCookie, {
    httpOnly: true,
    secure: EM_PRODUCAO,
    sameSite: SAMESITE_POR_TIPO[tipo],
    path: "/",
    expires: new Date(expiraEm),
  });
}

async function encerrarSessao(tipo: TipoSessao): Promise<void> {
  const store = await cookies();
  // set com data no passado (e não delete): o prefixo __Host- exige Secure
  // e Path=/ também no Set-Cookie que apaga.
  store.set(COOKIE_POR_TIPO[tipo], "", {
    httpOnly: true,
    secure: EM_PRODUCAO,
    sameSite: SAMESITE_POR_TIPO[tipo],
    path: "/",
    expires: new Date(0),
  });
}

async function idLogado(tipo: TipoSessao): Promise<string | null> {
  const store = await cookies();
  const valorCookie = store.get(COOKIE_POR_TIPO[tipo])?.value;
  if (!valorCookie) return null;

  const partes = valorCookie.split(".");
  if (partes.length !== 4) return null;
  const [id, versaoStr, expiraEmStr, assinatura] = partes;

  const payload = `${id}.${versaoStr}.${expiraEmStr}`;
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

  const versaoCookie = Number(versaoStr);
  const versaoConta = await versaoAtualDaConta(tipo, id);
  if (versaoConta === null || versaoConta !== versaoCookie) {
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

export const criarSessaoVendedor = (vendedorId: string) => criarSessao("vendedor", vendedorId);
export const encerrarSessaoVendedor = () => encerrarSessao("vendedor");
export const vendedorIdLogado = () => idLogado("vendedor");
