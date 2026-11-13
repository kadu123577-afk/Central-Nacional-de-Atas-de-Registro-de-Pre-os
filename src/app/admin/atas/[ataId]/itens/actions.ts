"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  LIMITE_CARACTERES_IMPORTACAO,
  interpretarPlanilhaDeItens,
  type ErroImportacao,
  type ItemImportado,
} from "@/lib/importar-itens";
import { lerArquivoDeItens } from "@/lib/importar-itens-arquivo";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";

/**
 * Importação de itens da ata (2026-11-14), em duas etapas: "Conferir" lê o texto e mostra o que
 * entraria e o que está errado, sem gravar; "Gravar" lê de novo o mesmo texto e só grava se não
 * houver nenhum erro (tudo ou nada). A fonte pode ser o texto colado, um arquivo (Excel .xlsx, PDF
 * ou CSV) ou o documento já anexado à ata (PDF ou Excel): arquivo e PDF viram o mesmo texto de
 * planilha, que volta para o campo para a pessoa conferir e corrigir. Exige "atas.itens" (ou
 * "atas.captar"), conferida antes de ler o formulário. O id da ata vem do navegador: só passa o que
 * tem forma de id e existe.
 */
export interface EstadoImportacaoItens {
  erro?: string;
  /** Resultado da conferência, mostrado na tela. */
  previa?: { itens: ItemImportado[]; erros: ErroImportacao[]; linhasLidas: number };
  /** O texto conferido, devolvido para o botão "Gravar" reenviar o mesmo conteúdo. */
  texto?: string;
  gravados?: number;
  /** De que tipo era o arquivo lido (para a tela dizer "Li o PDF", "Li o Excel"). */
  formato?: "xlsx" | "pdf" | "texto";
  /** Recado sobre o que foi lido e o que conferir. */
  aviso?: string;
  /** Linhas do PDF que não pareciam item (para a pessoa digitar, se forem). */
  naoLidas?: string[];
}

/** Excel e PDF são binários e maiores que o CSV; o limite do corpo da requisição está em next.config.ts. */
const TAMANHO_MAXIMO_ARQUIVO = 10 * 1024 * 1024;

function idComFormaValida(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

async function exigirCaptacao(): Promise<string> {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, ["atas.itens", "atas.captar"], "admin.importarItens");
  return adminId;
}

interface TextoLido {
  texto: string;
  formato?: "xlsx" | "pdf" | "texto";
  aviso?: string;
  naoLidas?: string[];
}

async function lerArquivo(nome: string, bytes: Uint8Array): Promise<TextoLido | { erro: string }> {
  const lido = await lerArquivoDeItens(nome, bytes);
  if (!lido.ok) return { erro: lido.erro };
  return {
    texto: lido.texto,
    formato: lido.formato,
    aviso: lido.aviso ?? undefined,
    naoLidas: lido.naoLidas.length > 0 ? lido.naoLidas : undefined,
  };
}

/**
 * De onde vem o texto da planilha, em ordem de prioridade: o documento já anexado à ata (botão
 * "Ler itens deste documento"), o arquivo enviado (Excel, PDF ou CSV) e, por último, o que foi colado.
 */
async function lerTexto(formData: FormData, ataId: string): Promise<TextoLido | { erro: string }> {
  const documentoId = formData.get("documentoId");
  if (typeof documentoId === "string" && documentoId !== "") {
    if (!idComFormaValida(documentoId)) return { erro: "Documento inválido. Atualize a página." };
    const documento = await prisma.documentoAta.findFirst({
      where: { id: documentoId, ataId },
      select: { nomeArquivo: true, conteudo: true },
    });
    if (!documento) return { erro: "Este documento não está mais na ata. Atualize a página." };
    return lerArquivo(documento.nomeArquivo, new Uint8Array(documento.conteudo));
  }

  const arquivo = formData.get("arquivo");
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) return { erro: "O arquivo passa de 10 MB. Divida em partes menores." };
    return lerArquivo(arquivo.name, new Uint8Array(await arquivo.arrayBuffer()));
  }
  const colado = formData.get("planilha");
  return { texto: typeof colado === "string" ? colado : "" };
}

async function carregarAta(ataId: unknown): Promise<{ id: string; categoria: string | null } | null> {
  if (!idComFormaValida(ataId)) return null;
  return prisma.ata.findUnique({ where: { id: ataId }, select: { id: true, categoria: true } });
}

export async function conferirItens(
  ataId: string,
  _estadoAnterior: EstadoImportacaoItens,
  formData: FormData,
): Promise<EstadoImportacaoItens> {
  await exigirCaptacao();
  const ata = await carregarAta(ataId);
  if (!ata) return { erro: "Ata não encontrada." };

  const lido = await lerTexto(formData, ata.id);
  if ("erro" in lido) return { erro: lido.erro };
  if (lido.texto.length > LIMITE_CARACTERES_IMPORTACAO) {
    return { erro: "O arquivo tem texto demais. Divida a planilha em partes menores." };
  }

  const previa = interpretarPlanilhaDeItens(lido.texto, ata.categoria);
  return { previa, texto: lido.texto, formato: lido.formato, aviso: lido.aviso, naoLidas: lido.naoLidas };
}

export async function gravarItens(
  ataId: string,
  _estadoAnterior: EstadoImportacaoItens,
  formData: FormData,
): Promise<EstadoImportacaoItens> {
  const adminId = await exigirCaptacao();
  const ata = await carregarAta(ataId);
  if (!ata) return { erro: "Ata não encontrada." };

  const texto = formData.get("planilha");
  if (typeof texto !== "string") return { erro: "Confira a planilha antes de gravar." };
  // Lê de novo, do zero: o que vale é o texto reenviado, não o que a tela mostrou.
  const resultado = interpretarPlanilhaDeItens(texto, ata.categoria);
  if (resultado.erros.length > 0 || resultado.itens.length === 0) {
    return { erro: "A planilha tem erros ou está vazia. Corrija e confira de novo.", previa: resultado, texto };
  }

  await prisma.$transaction(
    resultado.itens.map((i) =>
      prisma.item.create({
        data: {
          ataId: ata.id,
          descricao: i.descricao,
          categoria: i.categoria,
          marca: i.marca,
          unidade: i.unidade,
          quantidadeRegistrada: i.quantidadeRegistrada,
          valorUnitario: i.valorUnitario,
          codigoCatalogo: i.codigoCatalogo,
          saldo: { create: {} },
        },
      }),
    ),
  );

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.importarItens",
    alvo: ata.id,
    detalhe: `${resultado.itens.length} item(ns) importado(s) por planilha`,
  });
  revalidatePath(`/admin/atas/${ata.id}/itens`);
  revalidatePath(`/admin/atas/${ata.id}/completar`);
  revalidatePath("/admin/atas-itens");
  revalidatePath("/admin");
  return { gravados: resultado.itens.length };
}
