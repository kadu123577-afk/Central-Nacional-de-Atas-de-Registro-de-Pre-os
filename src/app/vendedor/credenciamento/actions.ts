"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { prisma } from "@/lib/prisma";
import { VERSAO_INTEGRIDADE, proximoStatus } from "@/lib/credenciamento";
import { ERRO_CONFLITO_CREDENCIAMENTO, erroDeTransicao } from "@/lib/credenciamento-view";

/**
 * Credenciamento do consultor, lado dele (Projeto RNA, etapa 6, 2026-10-23):
 * aceitar o compromisso de integridade (pendente → aceito, ou suspenso →
 * aceito num novo aceite). Quem libera para atuar é a equipe da plataforma
 * (src/app/admin/usuarios/credenciamento-actions.ts). Primeiro a sessão:
 * nada do formulário é lido antes de saber quem chama. A gravação só vale se
 * o status ainda for o que a tela mostrava (duas abas não se atropelam) e a
 * auditoria só é escrita quando algo mudou; ela guarda a versão do texto, nunca
 * o texto.
 */

export interface EstadoAceiteIntegridade {
  erro?: string;
  ok?: boolean;
}

const CAMINHO = "/vendedor/credenciamento";

function campoTexto(formData: FormData, nome: string): string {
  const valor = formData.get(nome);
  // Arquivo anexado a um campo de texto (requisição montada à mão) não é texto.
  return typeof valor === "string" ? valor : "";
}

/** Violação de chave única do Prisma: outra aba criou o registro entre a leitura e a gravação. */
function ehConflitoDeUnicidade(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && "code" in erro && (erro as { code: unknown }).code === "P2002";
}

export async function aceitarIntegridade(
  _estadoAnterior: EstadoAceiteIntegridade,
  formData: FormData,
): Promise<EstadoAceiteIntegridade> {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  // Só vale o aceite explícito da caixa "Li e aceito" (checkbox marcado envia "on").
  if (campoTexto(formData, "aceito") !== "on") {
    return { erro: "Marque a caixa “Li e aceito” para continuar." };
  }
  // O consultor aceita o texto que leu: se ele mudou desde que a tela abriu, pede nova leitura.
  if (Number(campoTexto(formData, "versao")) !== VERSAO_INTEGRIDADE) {
    return { erro: "O texto do compromisso foi atualizado. Recarregue a página, leia de novo e aceite." };
  }

  const atual = await prisma.credenciamentoConsultor.findUnique({
    where: { vendedorId },
    select: { status: true },
  });
  const novoStatus = proximoStatus(atual?.status, "aceitar");
  if (!novoStatus) return { erro: erroDeTransicao("aceitar", atual?.status) };

  const dados = {
    status: novoStatus,
    integridadeAceitaEm: new Date(),
    integridadeVersao: VERSAO_INTEGRIDADE,
  };

  if (!atual) {
    try {
      await prisma.credenciamentoConsultor.create({ data: { vendedorId, ...dados } });
    } catch (erro) {
      if (!ehConflitoDeUnicidade(erro)) throw erro;
      revalidatePath(CAMINHO);
      return { erro: ERRO_CONFLITO_CREDENCIAMENTO };
    }
  } else {
    const { count } = await prisma.credenciamentoConsultor.updateMany({
      where: { vendedorId, status: atual.status },
      data: dados,
    });
    if (count === 0) {
      revalidatePath(CAMINHO);
      return { erro: ERRO_CONFLITO_CREDENCIAMENTO };
    }
  }

  await registrarAuditoria({
    ator: `vendedor:${vendedorId}`,
    acao: "vendedor.aceitarIntegridade",
    alvo: vendedorId,
    detalhe: `Texto versão ${VERSAO_INTEGRIDADE}: ${atual?.status ?? "pendente"} → ${novoStatus}`,
  });
  revalidatePath(CAMINHO);
  revalidatePath("/vendedor");
  revalidatePath("/admin/usuarios");
  return { ok: true };
}
