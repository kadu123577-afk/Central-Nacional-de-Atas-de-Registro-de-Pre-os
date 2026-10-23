"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { prisma } from "@/lib/prisma";
import { transicaoValida } from "@/lib/credenciamento";
import {
  ERRO_CONFLITO_CREDENCIAMENTO,
  LIMITE_MOTIVO_SUSPENSAO,
  erroDeTransicao,
  normalizarMotivo,
} from "@/lib/credenciamento-view";

/**
 * Credenciamento do consultor, lado do administrador (Projeto RNA, etapa 6,
 * 2026-10-23): credenciar quem já aceitou o compromisso de integridade
 * (aceito → credenciado) e suspender (aceito ou credenciado → suspenso, com
 * motivo). Quem volta de uma suspensão é o próprio consultor, com novo aceite
 * (src/app/vendedor/credenciamento/actions.ts): a tabela de transições de
 * src/lib/credenciamento.ts não dá ao administrador nenhuma saída de
 * "suspenso", e por isso não existe aqui uma ação de "reativar".
 *
 * Toda ação exige admin logado ANTES de ler o formulário. A mudança só grava
 * se o status ainda for o que a tela mostrava (o `where` com o status esperado
 * torna a troca atômica) e a auditoria só é escrita quando algo mudou. O
 * motivo da suspensão vai para a trilha porque a coluna é sobrescrita quando o
 * consultor volta a ser credenciado.
 */

export interface EstadoCredenciamentoAdmin {
  erro?: string;
  ok?: boolean;
  /** O que foi digitado, para repor o formulário depois de um erro. */
  valores?: { motivo: string };
}

const CAMINHO = "/admin/usuarios";
const ERRO_CONSULTOR_INVALIDO = "Consultor inválido. Atualize a página e tente de novo.";

async function exigirAdmin(): Promise<string> {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }
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

/** Credencia o consultor que já aceitou o compromisso. */
export async function credenciarConsultor(
  _estadoAnterior: EstadoCredenciamentoAdmin,
  formData: FormData,
): Promise<EstadoCredenciamentoAdmin> {
  // Primeiro a sessão: nada do formulário é lido antes de saber quem chama.
  const adminId = await exigirAdmin();

  const vendedorId = campo(formData, "vendedorId").trim();
  if (!idComFormaValida(vendedorId)) return { erro: ERRO_CONSULTOR_INVALIDO };

  const atual = await prisma.credenciamentoConsultor.findUnique({
    where: { vendedorId },
    select: { status: true },
  });
  if (!atual || !transicaoValida(atual.status, "credenciado", "admin")) {
    return { erro: erroDeTransicao("credenciar", atual?.status) };
  }

  const { count } = await prisma.credenciamentoConsultor.updateMany({
    where: { vendedorId, status: atual.status },
    data: {
      status: "credenciado",
      credenciadoEm: new Date(),
      credenciadoPorId: adminId,
      // Credenciado não carrega suspensão: o histórico fica na trilha de auditoria.
      suspensoEm: null,
      motivo: null,
    },
  });
  if (count === 0) {
    revalidatePath(CAMINHO);
    return { erro: ERRO_CONFLITO_CREDENCIAMENTO };
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.credenciarConsultor",
    alvo: vendedorId,
    detalhe: `${atual.status} → credenciado`,
  });
  revalidatePath(CAMINHO);
  revalidatePath("/vendedor/credenciamento");
  return { ok: true };
}

/** Suspende o consultor (aceito ou credenciado); o motivo é obrigatório e o consultor o vê na tela dele. */
export async function suspenderConsultor(
  _estadoAnterior: EstadoCredenciamentoAdmin,
  formData: FormData,
): Promise<EstadoCredenciamentoAdmin> {
  const adminId = await exigirAdmin();

  const vendedorId = campo(formData, "vendedorId").trim();
  if (!idComFormaValida(vendedorId)) return { erro: ERRO_CONSULTOR_INVALIDO };

  const motivo = normalizarMotivo(campo(formData, "motivo"));
  // Repõe o que foi digitado quando algo der errado (o React zera o formulário).
  const valores = { motivo };
  if (!motivo) return { erro: "Informe o motivo da suspensão.", valores };
  if (motivo.length > LIMITE_MOTIVO_SUSPENSAO) {
    return {
      erro: `O motivo tem ${motivo.length} caracteres; o limite é ${LIMITE_MOTIVO_SUSPENSAO}. Resuma o texto.`,
      valores,
    };
  }

  const atual = await prisma.credenciamentoConsultor.findUnique({
    where: { vendedorId },
    select: { status: true },
  });
  if (!atual || !transicaoValida(atual.status, "suspenso", "admin")) {
    return { erro: erroDeTransicao("suspender", atual?.status), valores };
  }

  const { count } = await prisma.credenciamentoConsultor.updateMany({
    where: { vendedorId, status: atual.status },
    data: { status: "suspenso", suspensoEm: new Date(), motivo },
  });
  if (count === 0) {
    revalidatePath(CAMINHO);
    return { erro: ERRO_CONFLITO_CREDENCIAMENTO, valores };
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.suspenderConsultor",
    alvo: vendedorId,
    detalhe: `${atual.status} → suspenso. Motivo: ${motivo}`,
  });
  revalidatePath(CAMINHO);
  revalidatePath("/vendedor/credenciamento");
  return { ok: true };
}
