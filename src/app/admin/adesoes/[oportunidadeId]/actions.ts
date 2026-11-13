"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { condicaoParaAderiu } from "@/lib/instrucao-adesao";
import { carregarFeriadosExtras } from "@/lib/feriados-db";
import { prazoParaEstagio } from "@/lib/negociacao";
import { limiteAgregado } from "@/lib/saldo";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";
import { calcularRegistroDeAdesao, lerQuantidadesDoFormulario } from "@/lib/registrar-adesao";
import { carregarParaRegistro } from "@/lib/registrar-adesao-db";

/**
 * Registrar a adesão (atividade 13 do workflow, 2026-11-14), feito pela captação/administração com
 * a quantidade de cada item. Exige "adesao.registrar". Só registra depois da declaração de
 * conformidade do jurídico e com contrato de intermediação na ata (as mesmas travas do Kanban),
 * e só se a quantidade de cada item cabe nos limites do art. 86 (50% por município, 200% no
 * total). Grava as quantidades, faz o saldo da ata andar e leva a oportunidade para "Aderiu" com o
 * valor calculado dos itens (nunca digitado). Tudo ou nada, numa transação. Não edita adesão já
 * registrada: ajuste é com o jurídico.
 */
export interface EstadoRegistroAdesao {
  erros?: string[];
  ok?: boolean;
  /**
   * Devolvido junto dos erros: o React zera o formulário depois da ação, e isto repõe o que a pessoa
   * digitou (numa ata com centenas de itens, redigitar tudo seria inviável). `nonce` muda a cada
   * resposta para a tela remontar os campos.
   */
  valores?: { quantidades: Record<string, string>; observacoes: string; nonce: string };
}

/** Só os campos qtd_<id> e a observação, com tamanho limitado: é o que volta ao navegador. */
function valoresDigitados(formData: FormData): NonNullable<EstadoRegistroAdesao["valores"]> {
  const quantidades: Record<string, string> = {};
  for (const [nome, valor] of formData.entries()) {
    if (nome.startsWith("qtd_") && typeof valor === "string" && valor.trim() && Object.keys(quantidades).length < 2000) {
      quantidades[nome.slice(4)] = valor.trim().slice(0, 20);
    }
  }
  const observacoes = formData.get("observacoes");
  return { quantidades, observacoes: typeof observacoes === "string" ? observacoes.slice(0, 1000) : "", nonce: randomUUID() };
}

const MENSAGEM_JURIDICO =
  "A declaração de conformidade do jurídico ainda não foi registrada. Sem ela a adesão não pode ser registrada.";

function idComFormaValida(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

class RegistroRecusado extends Error {}

export async function registrarAdesaoPeloAdmin(
  oportunidadeId: string,
  _estadoAnterior: EstadoRegistroAdesao,
  formData: FormData,
): Promise<EstadoRegistroAdesao> {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "adesao.registrar", "admin.registrarAdesao");

  const recusar = (...erros: string[]): EstadoRegistroAdesao => ({ erros, valores: valoresDigitados(formData) });

  if (!idComFormaValida(oportunidadeId)) return recusar("Oportunidade não encontrada.");
  const dados = await carregarParaRegistro(oportunidadeId);
  if (!dados) return recusar("Oportunidade não encontrada.");
  const { oportunidade, itens } = dados;

  if (oportunidade.expirada) return recusar("O prazo deste município venceu. A equipe de vendas precisa fazer um novo pedido.");
  if (oportunidade.estagio === "aderiu") return recusar("A adesão deste município já está registrada. Ajustes são feitos pelo jurídico.");
  if (!condicaoParaAderiu({ declaracaoEm: oportunidade.declaradaEm }).permitido) return recusar(MENSAGEM_JURIDICO);
  if (!oportunidade.percentualContrato) {
    return recusar("Esta ata ainda não tem contrato de intermediação cadastrado. Peça ao jurídico antes de registrar.");
  }

  const { pedidos, erros: errosDeLeitura } = lerQuantidadesDoFormulario(formData, itens);
  if (errosDeLeitura.length > 0) return recusar(...errosDeLeitura);
  const calculo = calcularRegistroDeAdesao(itens, pedidos);
  if (!calculo.ok) return recusar(...calculo.erros);

  const observacoes = formData.get("observacoes");
  const observacoesLimpa = typeof observacoes === "string" ? observacoes.trim().slice(0, 1000) || null : null;
  const valorAderido = (calculo.valorTotalCentavos / 100).toFixed(2);
  const registradoPor = `admin:${adminId}`;

  try {
    await prisma.$transaction(async (tx) => {
      for (const linha of calculo.linhas) {
        const item = itens.find((i) => i.itemId === linha.itemId)!;
        // O saldo só anda se ainda couber agora (outro registro pode ter consumido nesse meio tempo).
        const andou = await tx.saldo.updateMany({
          where: {
            itemId: linha.itemId,
            quantidadeConsumida: { lte: Math.floor(limiteAgregado(item.quantidadeRegistrada)) - linha.quantidade },
          },
          data: { quantidadeConsumida: { increment: linha.quantidade } },
        });
        if (andou.count === 0) throw new RegistroRecusado(`"${linha.descricao}": o saldo da ata mudou e a quantidade não cabe mais. Confira e tente de novo.`);
        await tx.adesaoItem.create({
          data: { oportunidadeId: oportunidade.id, itemId: linha.itemId, quantidade: linha.quantidade, registradoPor },
        });
      }
      const gravou = await tx.oportunidadeVenda.updateMany({
        where: {
          id: oportunidade.id,
          estagio: { not: "aderiu" },
          expiradaEm: null,
          instrucao: { is: { declaracaoEm: { not: null } } },
        },
        data: {
          estagio: "aderiu",
          valorAderido,
          percentualComissao: oportunidade.percentualContrato!,
          prazoEm: null,
          ...(observacoesLimpa ? { observacoes: observacoesLimpa } : {}),
        },
      });
      if (gravou.count === 0) throw new RegistroRecusado("A oportunidade mudou enquanto você registrava (prazo vencido, já aderida ou declaração revogada). Recarregue a página.");

      const contato = await tx.pontoFocal.findFirst({
        where: { entidadeAlvoId: oportunidade.entidadeAlvoId, ativo: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (contato) {
        await tx.interacaoPontoFocal.create({
          data: {
            pontoFocalId: contato.id,
            ataId: oportunidade.ataId,
            resultado: "Converteu",
            observacao: observacoesLimpa,
          },
        });
      }
    });
  } catch (erro) {
    if (erro instanceof RegistroRecusado) return recusar(erro.message);
    throw erro;
  }

  await registrarAuditoria({
    ator: registradoPor,
    acao: "admin.registrarAdesao",
    alvo: oportunidade.id,
    detalhe: `${calculo.linhas.length} item(ns); valor aderido R$ ${valorAderido}`,
  });
  revalidatePath("/admin/adesoes");
  revalidatePath(`/admin/adesoes/${oportunidade.id}`);
  revalidatePath(`/vendedor/atas/${oportunidade.ataId}`);
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Desfazer um registro feito por engano (ajuste é com o jurídico: "adesao.declarar"). Devolve ao
 * saldo da ata o que foi consumido, apaga as quantidades e volta a oportunidade para "em
 * negociação". Não desfaz se já há liquidação (nota fiscal) em cima dessa adesão.
 */
export async function desfazerRegistroDeAdesao(oportunidadeId: string): Promise<EstadoRegistroAdesao> {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "adesao.declarar", "admin.desfazerRegistroAdesao");

  if (!idComFormaValida(oportunidadeId)) return { erros: ["Oportunidade não encontrada."] };

  const feriados = await carregarFeriadosExtras();
  let desfeitos = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const op = await tx.oportunidadeVenda.findUnique({
        where: { id: oportunidadeId },
        select: { id: true, ataId: true, estagio: true },
      });
      if (!op) throw new RegistroRecusado("Oportunidade não encontrada.");
      if (op.estagio !== "aderiu") throw new RegistroRecusado("Esta oportunidade não está registrada como aderida.");
      const liquidacoes = await tx.liquidacao.count({ where: { oportunidadeId: op.id } });
      if (liquidacoes > 0) {
        throw new RegistroRecusado(`Já há ${liquidacoes} liquidação(ões) em cima desta adesão. Ela não pode ser desfeita por aqui.`);
      }
      const itens = await tx.adesaoItem.findMany({ where: { oportunidadeId: op.id }, select: { itemId: true, quantidade: true } });
      for (const i of itens) {
        await tx.saldo.update({ where: { itemId: i.itemId }, data: { quantidadeConsumida: { decrement: i.quantidade } } });
      }
      await tx.adesaoItem.deleteMany({ where: { oportunidadeId: op.id } });
      await tx.oportunidadeVenda.update({
        where: { id: op.id },
        data: { estagio: "em_negociacao", valorAderido: null, percentualComissao: null, prazoEm: prazoParaEstagio("em_negociacao", new Date(), feriados) },
      });
      desfeitos = itens.length;
    });
  } catch (erro) {
    if (erro instanceof RegistroRecusado) return { erros: [erro.message] };
    throw erro;
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.desfazerRegistroAdesao",
    alvo: oportunidadeId,
    detalhe: `${desfeitos} item(ns) devolvido(s) ao saldo`,
  });
  revalidatePath("/admin/adesoes");
  revalidatePath(`/admin/adesoes/${oportunidadeId}`);
  revalidatePath("/admin");
  return { ok: true };
}
