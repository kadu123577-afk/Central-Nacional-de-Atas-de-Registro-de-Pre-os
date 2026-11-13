import { redirect } from "next/navigation";
import { registrarAuditoria } from "@/lib/auditoria";
import { prisma } from "@/lib/prisma";
import { normalizarPermissoes, temAlguma, type Permissao } from "@/lib/permissoes";

/**
 * Conferência de permissão no banco (2026-11-13). As regras puras estão em
 * src/lib/permissoes.ts. A lista é lida a cada chamada, então revogar vale na
 * hora, sem esperar a sessão expirar (mesma regra do financeiro da SCP).
 *
 * Onde chamar: logo depois de saber quem está logado (o adminId que a página ou
 * a ação já tem) e ANTES de ler formulário ou banco da área protegida.
 */

/** Para onde vai quem não tem permissão: o painel, que explica o motivo. */
export const CAMINHO_SEM_PERMISSAO = "/admin?acesso=negado";

export const ACAO_PERMISSAO_NEGADA = "permissao.negada";

/** Permissões da conta, ou null se ela não existe ou foi desativada. */
export async function permissoesDoAdmin(adminId: string): Promise<Permissao[] | null> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { permissoes: true, ativo: true },
  });
  if (!admin || !admin.ativo) return null;
  return normalizarPermissoes(admin.permissoes);
}

/**
 * Garante que a conta tem pelo menos uma das permissões pedidas. Sem ela,
 * registra "permissao.negada" na auditoria e leva ao painel (lança, então nunca
 * retorna sem permissão). Conta desativada ou apagada volta ao login.
 */
export async function exigirPermissaoDe(
  adminId: string,
  chaves: Permissao | readonly Permissao[],
  detalhe?: string,
): Promise<void> {
  const pedidas = Array.isArray(chaves) ? (chaves as readonly Permissao[]) : [chaves as Permissao];
  const permissoes = await permissoesDoAdmin(adminId);
  if (permissoes === null) redirect("/admin/login");
  if (temAlguma(permissoes, pedidas)) return;

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: ACAO_PERMISSAO_NEGADA,
    detalhe: [pedidas.join("|"), detalhe].filter(Boolean).join(" "),
  });
  redirect(CAMINHO_SEM_PERMISSAO);
}

/** Resposta sem redirecionar, para ações que devolvem erro na própria tela. */
export async function adminTemPermissao(adminId: string, chave: Permissao): Promise<boolean> {
  const permissoes = await permissoesDoAdmin(adminId);
  return permissoes !== null && temAlguma(permissoes, [chave]);
}
