"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { prisma } from "@/lib/prisma";
import { estagioProspeccaoValido, podeMoverEstagio } from "@/lib/radar-atas";
import { dataParaCampo, lerDataSoDia, LIMITE_OBSERVACOES, normalizarObservacao } from "@/lib/radar-atas-view";

/**
 * Funil de prospecção de fornecedores (Projeto RNA, etapa 5, 2026-10-22): o
 * gestor move cada fornecedor entre os estágios e anota o próximo contato.
 * Toda ação exige admin logado ANTES de ler o formulário. O estágio só muda
 * se ainda for o que a tela mostrava (o `where` com o estágio esperado torna
 * a troca atômica: dois cliques ou duas abas não se atropelam) e a auditoria
 * só é escrita quando algo mudou de fato. A trilha guarda o CNPJ (dado
 * público da empresa), nunca o texto das observações.
 */

const CAMINHO = "/admin/prospeccao-fornecedores";

export interface EstadoProspeccao {
  /** Mensagem de erro para a tela. */
  erro?: string;
  /** A ação terminou sem erro (houve mudança ou não). */
  ok?: boolean;
  /** Complemento neutro ("Nada mudou."). */
  aviso?: string;
  /** O que foi digitado, para repor o formulário depois de um erro. */
  valores?: { proximoContatoEm: string; observacoes: string };
}

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
  return typeof valor === "string" ? valor.trim() : "";
}

/** O id vem de campo oculto, ou seja, do navegador: só passa o que tem forma de cuid. */
function idComFormaDeCuid(id: string): boolean {
  return /^c[a-z0-9]{15,40}$/.test(id);
}

/** Texto bruto de um campo, sem apará-lo: a normalização das observações é nossa. */
function campoBruto(formData: FormData, nome: string): string {
  const valor = formData.get(nome);
  return typeof valor === "string" ? valor : "";
}

/** Move o fornecedor de estágio, respeitando as transições de podeMoverEstagio. */
export async function moverEstagioProspeccao(
  _estadoAnterior: EstadoProspeccao,
  formData: FormData,
): Promise<EstadoProspeccao> {
  // Primeiro a sessão: nada do formulário é lido antes de saber quem chama.
  const adminId = await exigirAdmin();

  const id = campo(formData, "id");
  if (!idComFormaDeCuid(id)) return { erro: "Fornecedor inválido. Atualize a página e tente de novo." };

  const destino = campo(formData, "estagio");
  if (!estagioProspeccaoValido(destino)) return { erro: "Escolha um estágio válido." };

  const atual = await prisma.prospeccaoFornecedor.findUnique({
    where: { id },
    select: { estagio: true, cnpj: true },
  });
  if (!atual) return { erro: "Este fornecedor não está mais no funil. Atualize a página." };

  const regra = podeMoverEstagio(atual.estagio, destino);
  if (!regra.ok) return { erro: regra.erro ?? "Essa mudança de estágio não é permitida." };

  // Mesmo estágio: não há o que gravar nem auditar.
  if (atual.estagio === destino) return { ok: true, aviso: "O fornecedor já estava neste estágio." };

  const { count } = await prisma.prospeccaoFornecedor.updateMany({
    where: { id, estagio: atual.estagio },
    data: { estagio: destino, atualizadoPorTipo: "admin", atualizadoPorId: adminId },
  });

  if (count === 0) {
    revalidatePath(CAMINHO);
    return { erro: "O estágio deste fornecedor mudou enquanto você olhava a tela. Veja o estágio atual e tente de novo." };
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.moverEstagioProspeccao",
    alvo: id,
    detalhe: `CNPJ ${atual.cnpj}: ${atual.estagio} → ${destino}`,
  });
  revalidatePath(CAMINHO);
  return { ok: true };
}

/** Atualiza o próximo contato e as observações (os dois são opcionais; vazio apaga). */
export async function atualizarProspeccao(
  _estadoAnterior: EstadoProspeccao,
  formData: FormData,
): Promise<EstadoProspeccao> {
  const adminId = await exigirAdmin();

  const id = campo(formData, "id");
  if (!idComFormaDeCuid(id)) return { erro: "Fornecedor inválido. Atualize a página e tente de novo." };

  const dataBruta = campo(formData, "proximoContatoEm");
  const observacoesTexto = normalizarObservacao(campoBruto(formData, "observacoes"));
  // Repõe o que foi digitado quando algo der errado (o React zera o formulário).
  const valores = { proximoContatoEm: dataBruta, observacoes: observacoesTexto };

  const data = lerDataSoDia(dataBruta);
  if (!data.ok) {
    return { erro: "Data do próximo contato inválida. Escolha uma data real.", valores };
  }
  if (observacoesTexto.length > LIMITE_OBSERVACOES) {
    return {
      erro: `As observações têm ${observacoesTexto.length} caracteres; o limite é ${LIMITE_OBSERVACOES}. Resuma o texto.`,
      valores,
    };
  }
  const observacoes = observacoesTexto === "" ? null : observacoesTexto;

  const atual = await prisma.prospeccaoFornecedor.findUnique({
    where: { id },
    select: { cnpj: true, proximoContatoEm: true, observacoes: true },
  });
  if (!atual) return { erro: "Este fornecedor não está mais no funil. Atualize a página.", valores };

  const mudouData = dataParaCampo(atual.proximoContatoEm) !== dataParaCampo(data.data);
  const mudouObservacoes = (atual.observacoes ?? null) !== observacoes;
  if (!mudouData && !mudouObservacoes) return { ok: true, aviso: "Nada mudou." };

  const { count } = await prisma.prospeccaoFornecedor.updateMany({
    where: { id },
    data: {
      ...(mudouData ? { proximoContatoEm: data.data } : {}),
      ...(mudouObservacoes ? { observacoes } : {}),
      atualizadoPorTipo: "admin",
      atualizadoPorId: adminId,
    },
  });
  if (count === 0) return { erro: "Este fornecedor não está mais no funil. Atualize a página.", valores };

  const mudancas: string[] = [];
  if (mudouData) mudancas.push(data.data ? `próximo contato ${dataParaCampo(data.data)}` : "próximo contato removido");
  if (mudouObservacoes) mudancas.push(observacoes ? "observações atualizadas" : "observações removidas");
  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.atualizarProspeccao",
    alvo: id,
    detalhe: `CNPJ ${atual.cnpj}: ${mudancas.join("; ")}`,
  });
  revalidatePath(CAMINHO);
  return { ok: true };
}
