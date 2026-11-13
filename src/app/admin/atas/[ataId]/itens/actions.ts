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
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";

/**
 * Importação de itens da ata por planilha (2026-11-14), em duas etapas: "Conferir" lê o texto e
 * mostra o que entraria e o que está errado, sem gravar; "Gravar" lê de novo o mesmo texto e só
 * grava se não houver nenhum erro (tudo ou nada). Exige "atas.itens" (ou "atas.captar"), conferida antes de ler o
 * formulário. O id da ata vem do navegador: só passa o que tem forma de id e existe.
 */
export interface EstadoImportacaoItens {
  erro?: string;
  /** Resultado da conferência, mostrado na tela. */
  previa?: { itens: ItemImportado[]; erros: ErroImportacao[]; linhasLidas: number };
  /** O texto conferido, devolvido para o botão "Gravar" reenviar o mesmo conteúdo. */
  texto?: string;
  gravados?: number;
}

const TAMANHO_MAXIMO_ARQUIVO = LIMITE_CARACTERES_IMPORTACAO * 3;

function idComFormaValida(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

async function exigirCaptacao(): Promise<string> {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, ["atas.itens", "atas.captar"], "admin.importarItens");
  return adminId;
}

/** Texto da planilha: o arquivo enviado (CSV ou texto) tem prioridade sobre o que foi colado. */
async function lerTexto(formData: FormData): Promise<{ texto: string } | { erro: string }> {
  const arquivo = formData.get("arquivo");
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) return { erro: "O arquivo é grande demais. Divida a planilha em partes menores." };
    if (/\.(xlsx?|ods)$/i.test(arquivo.name)) {
      return { erro: "Salve a planilha como CSV (separado por ponto e vírgula) ou copie as células e cole no campo." };
    }
    return { texto: await arquivo.text() };
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

  const lido = await lerTexto(formData);
  if ("erro" in lido) return { erro: lido.erro };

  const previa = interpretarPlanilhaDeItens(lido.texto, ata.categoria);
  return { previa, texto: lido.texto };
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
  revalidatePath("/admin");
  return { gravados: resultado.itens.length };
}
