"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  formatarPercentual,
  formatarValorFaixa,
  interpretarPercentualDigitado,
  validarFaixa,
} from "@/lib/comissao-sugerida";
import { prisma } from "@/lib/prisma";
import {
  fracaoParaDecimal,
  idComFormaDeCuid,
  interpretarValorDigitado,
  LIMITE_DESCRICAO_FAIXA,
  normalizarDescricao,
} from "./leitura";

/**
 * Faixas de comissão sugerida (Projeto RNA, etapa 6, 2026-10-23): o
 * administrador cadastra, ajusta, ativa/desativa e remove as faixas que a
 * plataforma usa para SUGERIR o percentual ao montar o contrato de
 * intermediação de uma ata. Os números são do administrador (nenhum percentual
 * padrão no código) e a sugestão nunca grava contrato: o que vale é o
 * percentual pactuado, salvo na tela do contrato.
 *
 * Toda ação exige admin logado ANTES de ler o formulário. A validação é no
 * servidor (validarFaixa, de src/lib/comissao-sugerida.ts), a auditoria só é
 * escrita quando algo mudou de fato, e a trilha guarda valor e percentual da
 * faixa (parâmetros da plataforma), nunca o texto da descrição.
 */

const CAMINHO = "/admin/comissao";

export interface EstadoFaixa {
  /** Mensagem de erro para a tela. */
  erro?: string;
  /** A ação terminou sem erro (houve mudança ou não). */
  ok?: boolean;
  /** Complemento neutro ("Nada mudou."). */
  aviso?: string;
  /** O que foi digitado, para repor o formulário depois de um erro. */
  valores?: { valorMinimo?: string; percentual: string; descricao: string };
}

async function exigirAdmin(): Promise<string> {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }
  return adminId;
}

/** Texto bruto de um campo, sem apará-lo. Arquivo anexado a campo de texto não é texto. */
function campoBruto(formData: FormData, nome: string): string {
  const valor = formData.get(nome);
  return typeof valor === "string" ? valor : "";
}

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && (erro as { code?: unknown }).code === "P2002";
}

function mensagemDuplicada(valorMinimo: number, ativo: boolean | null): string {
  const situacao = ativo === null ? "" : ativo ? " ativa" : " inativa";
  return `Já existe uma faixa${situacao} a partir de ${formatarValorFaixa(valorMinimo)}. Edite essa faixa na tabela ou escolha outro valor.`;
}

const ERRO_PERCENTUAL_ILEGIVEL = "Informe o percentual como número, com até 2 casas decimais (ex.: 5,25).";

/** Cadastra uma faixa nova (nasce ativa). Recusa valor inicial que já tenha faixa, ativa ou não. */
export async function criarFaixa(_estadoAnterior: EstadoFaixa, formData: FormData): Promise<EstadoFaixa> {
  // Primeiro a sessão: nada do formulário é lido antes de saber quem chama.
  const adminId = await exigirAdmin();

  const valorBruto = campoBruto(formData, "valorMinimo");
  const percentualBruto = campoBruto(formData, "percentual");
  const descricao = normalizarDescricao(campoBruto(formData, "descricao"));
  // Repõe o que foi digitado quando algo der errado (o React zera o formulário).
  const valores = { valorMinimo: valorBruto.trim(), percentual: percentualBruto.trim(), descricao };

  const valorTexto = interpretarValorDigitado(valorBruto);
  if (valorTexto === null) {
    return {
      erro: "Informe o valor da ata a partir do qual a faixa vale, em reais, com até 2 casas decimais (ex.: 100.000,00).",
      valores,
    };
  }
  const fracao = interpretarPercentualDigitado(percentualBruto);
  if (fracao === null) return { erro: ERRO_PERCENTUAL_ILEGIVEL, valores };

  const valorMinimo = Number(valorTexto);
  const valida = validarFaixa({ valorMinimo, percentual: fracao });
  if (!valida.ok) return { erro: valida.erro, valores };

  if (descricao.length > LIMITE_DESCRICAO_FAIXA) {
    return {
      erro: `A descrição tem ${descricao.length} caracteres; o limite é ${LIMITE_DESCRICAO_FAIXA}. Resuma o texto.`,
      valores,
    };
  }

  const existente = await prisma.faixaComissao.findUnique({
    where: { valorMinimo: valorTexto },
    select: { ativo: true },
  });
  if (existente) return { erro: mensagemDuplicada(valorMinimo, existente.ativo), valores };

  let criada: { id: string };
  try {
    criada = await prisma.faixaComissao.create({
      data: {
        valorMinimo: valorTexto,
        percentual: fracaoParaDecimal(fracao),
        descricao: descricao === "" ? null : descricao,
        ativo: true,
        atualizadoPorId: adminId,
      },
      select: { id: true },
    });
  } catch (erro) {
    // Duas pessoas cadastrando o mesmo valor ao mesmo tempo: a restrição única do banco decide.
    if (ehViolacaoDeUnicidade(erro)) return { erro: mensagemDuplicada(valorMinimo, null), valores };
    throw erro;
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.criarFaixaComissao",
    alvo: criada.id,
    detalhe: `faixa a partir de ${formatarValorFaixa(valorMinimo)}: ${formatarPercentual(fracao)}`,
  });
  revalidatePath(CAMINHO);
  return { ok: true };
}

/** Muda o percentual e a descrição de uma faixa (o valor inicial não muda: para isso, remova e cadastre outra). */
export async function atualizarFaixa(_estadoAnterior: EstadoFaixa, formData: FormData): Promise<EstadoFaixa> {
  const adminId = await exigirAdmin();

  const id = campoBruto(formData, "id").trim();
  if (!idComFormaDeCuid(id)) return { erro: "Faixa inválida. Atualize a página e tente de novo." };

  const percentualBruto = campoBruto(formData, "percentual");
  const descricao = normalizarDescricao(campoBruto(formData, "descricao"));
  const valores = { percentual: percentualBruto.trim(), descricao };

  const fracao = interpretarPercentualDigitado(percentualBruto);
  if (fracao === null) return { erro: ERRO_PERCENTUAL_ILEGIVEL, valores };
  if (descricao.length > LIMITE_DESCRICAO_FAIXA) {
    return {
      erro: `A descrição tem ${descricao.length} caracteres; o limite é ${LIMITE_DESCRICAO_FAIXA}. Resuma o texto.`,
      valores,
    };
  }

  const atual = await prisma.faixaComissao.findUnique({
    where: { id },
    select: { valorMinimo: true, percentual: true, descricao: true },
  });
  if (!atual) return { erro: "Esta faixa não existe mais. Atualize a página.", valores };

  const valorMinimo = Number(atual.valorMinimo);
  const valida = validarFaixa({ valorMinimo, percentual: fracao });
  if (!valida.ok) return { erro: valida.erro, valores };

  const novaDescricao = descricao === "" ? null : descricao;
  const mudouPercentual = Math.round(Number(atual.percentual) * 10_000) !== Math.round(fracao * 10_000);
  const mudouDescricao = (atual.descricao ?? null) !== novaDescricao;
  if (!mudouPercentual && !mudouDescricao) return { ok: true, aviso: "Nada mudou." };

  const { count } = await prisma.faixaComissao.updateMany({
    where: { id },
    data: {
      ...(mudouPercentual ? { percentual: fracaoParaDecimal(fracao) } : {}),
      ...(mudouDescricao ? { descricao: novaDescricao } : {}),
      atualizadoPorId: adminId,
    },
  });
  if (count === 0) return { erro: "Esta faixa não existe mais. Atualize a página.", valores };

  const mudancas: string[] = [];
  if (mudouPercentual) {
    mudancas.push(`percentual ${formatarPercentual(Number(atual.percentual))} → ${formatarPercentual(fracao)}`);
  }
  if (mudouDescricao) mudancas.push(novaDescricao ? "descrição atualizada" : "descrição removida");
  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.atualizarFaixaComissao",
    alvo: id,
    detalhe: `faixa a partir de ${formatarValorFaixa(valorMinimo)}: ${mudancas.join("; ")}`,
  });
  revalidatePath(CAMINHO);
  return { ok: true };
}

/**
 * Ativa ou desativa uma faixa. O formulário diz o estado de destino (ativar =
 * "1" ou "0"), não "inverta": dois cliques ou duas abas levam ao mesmo lugar.
 * Faixa inativa fica de fora da sugestão, mas o histórico permanece.
 */
export async function alternarFaixa(_estadoAnterior: EstadoFaixa, formData: FormData): Promise<EstadoFaixa> {
  const adminId = await exigirAdmin();

  const id = campoBruto(formData, "id").trim();
  if (!idComFormaDeCuid(id)) return { erro: "Faixa inválida. Atualize a página e tente de novo." };

  const destinoBruto = campoBruto(formData, "ativar").trim();
  if (destinoBruto !== "1" && destinoBruto !== "0") {
    return { erro: "Escolha se a faixa fica ativa ou inativa." };
  }
  const destino = destinoBruto === "1";

  const atual = await prisma.faixaComissao.findUnique({
    where: { id },
    select: { valorMinimo: true, ativo: true },
  });
  if (!atual) return { erro: "Esta faixa não existe mais. Atualize a página." };

  // Já está no estado pedido: não há o que gravar nem auditar.
  if (atual.ativo === destino) {
    return { ok: true, aviso: destino ? "A faixa já estava ativa." : "A faixa já estava inativa." };
  }

  // O `where` com o estado esperado torna a troca atômica.
  const { count } = await prisma.faixaComissao.updateMany({
    where: { id, ativo: atual.ativo },
    data: { ativo: destino, atualizadoPorId: adminId },
  });
  if (count === 0) {
    revalidatePath(CAMINHO);
    return { erro: "A faixa mudou enquanto você olhava a tela. Veja a situação atual e tente de novo." };
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: destino ? "admin.ativarFaixaComissao" : "admin.desativarFaixaComissao",
    alvo: id,
    detalhe: `faixa a partir de ${formatarValorFaixa(Number(atual.valorMinimo))}: ${destino ? "ativada" : "desativada"}`,
  });
  revalidatePath(CAMINHO);
  return { ok: true };
}

/** Remove a faixa de vez. Contratos já salvos não são afetados: o percentual deles é o que foi pactuado. */
export async function removerFaixa(_estadoAnterior: EstadoFaixa, formData: FormData): Promise<EstadoFaixa> {
  const adminId = await exigirAdmin();

  const id = campoBruto(formData, "id").trim();
  if (!idComFormaDeCuid(id)) return { erro: "Faixa inválida. Atualize a página e tente de novo." };

  const atual = await prisma.faixaComissao.findUnique({
    where: { id },
    select: { valorMinimo: true, percentual: true },
  });
  if (!atual) {
    revalidatePath(CAMINHO);
    return { ok: true, aviso: "Esta faixa já não existe." };
  }

  const { count } = await prisma.faixaComissao.deleteMany({ where: { id } });
  if (count === 0) {
    revalidatePath(CAMINHO);
    return { ok: true, aviso: "Esta faixa já não existe." };
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.removerFaixaComissao",
    alvo: id,
    detalhe: `faixa a partir de ${formatarValorFaixa(Number(atual.valorMinimo))}: ${formatarPercentual(Number(atual.percentual))} removida`,
  });
  revalidatePath(CAMINHO);
  return { ok: true };
}
