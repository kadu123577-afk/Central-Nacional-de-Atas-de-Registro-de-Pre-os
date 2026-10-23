/**
 * Leitura do credenciamento do consultor no banco (2026-10-23, Projeto RNA
 * etapa 6). As regras ficam em credenciamento.ts; aqui só se busca o status e
 * se decide, com ele, se o consultor pode tomar trabalho novo. Só roda no
 * servidor (importa o Prisma): componentes de navegador usam
 * credenciamento-view.ts.
 */
import { prisma } from "@/lib/prisma";
import {
  mensagemBloqueio,
  normalizarStatusCredenciamento,
  podeAtuar,
  type StatusCredenciamento,
} from "@/lib/credenciamento";
import { comLinkDeCredenciamento } from "@/lib/credenciamento-view";

/** Registro do consultor como a tela dele precisa. */
export interface CredenciamentoDoConsultor {
  status: StatusCredenciamento;
  integridadeAceitaEm: Date | null;
  integridadeVersao: number | null;
  credenciadoEm: Date | null;
  suspensoEm: Date | null;
  motivo: string | null;
}

/** Status atual; sem registro (ou valor desconhecido) conta como "pendente", o lado seguro. */
export async function statusCredenciamentoDoVendedor(vendedorId: string): Promise<StatusCredenciamento> {
  const registro = await prisma.credenciamentoConsultor.findUnique({
    where: { vendedorId },
    select: { status: true },
  });
  return normalizarStatusCredenciamento(registro?.status);
}

/** Registro completo para a tela do consultor; nulo quando ele ainda não começou. */
export async function lerCredenciamentoDoVendedor(vendedorId: string): Promise<CredenciamentoDoConsultor | null> {
  const registro = await prisma.credenciamentoConsultor.findUnique({
    where: { vendedorId },
    select: {
      status: true,
      integridadeAceitaEm: true,
      integridadeVersao: true,
      credenciadoEm: true,
      suspensoEm: true,
      motivo: true,
    },
  });
  if (!registro) return null;
  return { ...registro, status: normalizarStatusCredenciamento(registro.status) };
}

/**
 * Trava de "tomar trabalho novo": nulo quando o consultor está credenciado;
 * senão a mensagem, em português, do que falta, com o caminho da tela de
 * credenciamento. Se o banco falhar, o erro sobe e a ação não prossegue: sem
 * conseguir conferir, não libera.
 */
export async function bloqueioDeCredenciamento(vendedorId: string): Promise<string | null> {
  const status = await statusCredenciamentoDoVendedor(vendedorId);
  if (podeAtuar(status)) return null;
  return comLinkDeCredenciamento(mensagemBloqueio(status));
}
