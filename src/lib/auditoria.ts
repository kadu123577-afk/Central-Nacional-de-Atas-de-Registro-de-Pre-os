import { prisma } from "@/lib/prisma";
import { ipDaRequisicao } from "@/lib/limite-tentativas";

/**
 * Trilha de auditoria (2026-10-20): registra eventos de segurança e ações
 * sensíveis do admin. É "melhor esforço" de propósito — uma falha ao gravar
 * o log nunca pode derrubar o login ou a ação que está sendo auditada.
 * Não grave senhas, códigos nem dados pessoais desnecessários em `detalhe`.
 */
export async function registrarAuditoria(evento: {
  ator: string;
  acao: string;
  alvo?: string;
  detalhe?: string;
}): Promise<void> {
  try {
    let ip: string | null = null;
    try {
      ip = await ipDaRequisicao();
    } catch {
      // fora de uma requisição (script, teste) — sem IP.
    }
    await prisma.logAuditoria.create({
      data: {
        ator: evento.ator,
        acao: evento.acao,
        alvo: evento.alvo ?? null,
        detalhe: evento.detalhe?.slice(0, 500) ?? null,
        ip,
      },
    });
  } catch (erro) {
    console.error("Falha ao registrar auditoria:", erro);
  }
}
