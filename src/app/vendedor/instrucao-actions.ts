"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdLogado, vendedorIdLogado } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  ITENS_INSTRUCAO,
  VERSAO_DECLARACAO,
  itemInstrucaoValido,
  marcarItem,
  normalizarJustificativa,
  resumirInstrucao,
  validarDeclaracao,
} from "@/lib/instrucao-adesao";
import {
  apagarDeclaracao,
  atualizarItens,
  buscarOportunidadeDaInstrucao,
  lerInstrucao,
  registrarDeclaracao,
  type OportunidadeDaInstrucao,
} from "@/lib/instrucao-adesao-db";

/**
 * Instrução por adesão, lado do vendedor (Projeto RNA, etapa 3, 2026-10-21):
 * marcar os itens do checklist do órgão aderente, registrar a declaração
 * interna de conformidade e revogá-la. A plataforma só organiza a
 * informação e o pedido; a decisão de aderir é do órgão aderente, do órgão
 * gerenciador e do fornecedor. Quem pode: o vendedor dono da oportunidade ou
 * um administrador logado; oportunidade expirada não aceita nada.
 *
 * Os três retornos seguem o padrão useActionState dos outros formulários
 * (`{ erro }` ou `{ ok }`), e toda mudança vai para a trilha de auditoria
 * com o ator "vendedor:<id>" ou "admin:<id>".
 */

export interface EstadoInstrucao {
  erro?: string;
  ok?: boolean;
}

const ESTAGIO_ADERIU = "aderiu";
const ERRO_NAO_ENCONTRADA = "Oportunidade não encontrada.";
const ERRO_EXPIRADA = "O prazo deste município venceu. Faça um novo pedido de negociação.";
const ERRO_CONFLITO = "A instrução foi alterada por outra pessoa ao mesmo tempo. Confira os itens e tente de novo.";

type Ator = { tipo: "admin" | "vendedor"; id: string };

/** Primeiro a sessão: nada do formulário nem do banco é lido antes de saber quem chama. */
async function exigirSessao(): Promise<{ vendedorId: string | null; adminId: string | null }> {
  const [vendedorId, adminId] = await Promise.all([vendedorIdLogado(), adminIdLogado()]);
  if (!vendedorId && !adminId) {
    redirect("/vendedor/login");
  }
  return { vendedorId, adminId };
}

/** Os ids vêm do navegador (argumento da action): só passa o que tem cara de id (cuid). */
function idComFormaValida(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function campoTexto(formData: FormData, nome: string): string | null {
  const valor = formData.get(nome);
  // Arquivo anexado a um campo de texto (requisição montada à mão) não é texto.
  return typeof valor === "string" ? valor : null;
}

/** O vendedor só mexe no que é dele; o admin, em qualquer uma. Expirada não aceita nada. */
async function autorizar(
  sessao: { vendedorId: string | null; adminId: string | null },
  oportunidadeId: string,
): Promise<{ ator: Ator; oportunidade: OportunidadeDaInstrucao } | { erro: string }> {
  if (!idComFormaValida(oportunidadeId)) return { erro: ERRO_NAO_ENCONTRADA };
  const oportunidade = await buscarOportunidadeDaInstrucao(oportunidadeId);
  if (!oportunidade) return { erro: ERRO_NAO_ENCONTRADA };

  let ator: Ator | null = null;
  if (sessao.vendedorId && oportunidade.vendedorId === sessao.vendedorId) {
    ator = { tipo: "vendedor", id: sessao.vendedorId };
  } else if (sessao.adminId) {
    ator = { tipo: "admin", id: sessao.adminId };
  }
  // Mesma resposta para "não existe" e "é de outro vendedor": não revela o que não é dele.
  if (!ator) return { erro: ERRO_NAO_ENCONTRADA };
  if (oportunidade.expiradaEm) return { erro: ERRO_EXPIRADA };
  return { ator, oportunidade };
}

function revalidarTelas(ataId: string): void {
  revalidatePath(`/vendedor/atas/${ataId}`);
  revalidatePath("/admin/pipeline");
}

/** Dia de hoje no fuso de Brasília (AAAA-MM-DD): às 22h daqui o UTC já virou o dia seguinte. */
function diaDeHoje(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Marca ou desmarca um item do checklist. O formulário manda `feito`
 * ("true" ou "false": como o item deve ficar) e, opcionalmente, `nota`:
 * sem o campo a observação que já existia é mantida, com o campo vazio ela
 * é apagada.
 *
 * Decisão: desmarcar um item obrigatório DEPOIS de a declaração ter sido
 * registrada não apaga a declaração. Ela continua valendo (foi um ato
 * datado de quem declarou), a mudança é auditada com "declaração mantida" e
 * a tela avisa que a declaração ficou à frente do checklist. Quem quiser
 * refazer, revoga e registra de novo.
 */
export async function marcarItemInstrucao(
  oportunidadeId: string,
  chave: string,
  _estadoAnterior: EstadoInstrucao,
  formData: FormData,
): Promise<EstadoInstrucao> {
  const sessao = await exigirSessao();

  if (!itemInstrucaoValido(chave)) return { erro: "Item da instrução inválido." };
  const feitoTexto = campoTexto(formData, "feito");
  if (feitoTexto !== "true" && feitoTexto !== "false") return { erro: "Não foi possível ler a marcação do item." };
  const feito = feitoTexto === "true";
  const nota = campoTexto(formData, "nota") ?? undefined;

  const acesso = await autorizar(sessao, oportunidadeId);
  if ("erro" in acesso) return { erro: acesso.erro };
  const { ator, oportunidade } = acesso;

  const hoje = diaDeHoje();
  const resultado = await atualizarItens(oportunidade.id, (atual) => marcarItem(atual, chave, feito, hoje, nota));
  if (!resultado.ok) return { erro: ERRO_CONFLITO };
  if (!resultado.mudou) return { ok: true };

  const antes = resultado.antes[chave];
  const depois = resultado.depois[chave];
  const mudancas: string[] = [];
  if ((antes?.feito ?? false) !== (depois?.feito ?? false)) {
    mudancas.push(depois?.feito ? "marcado" : "desmarcado");
  }
  if ((antes?.nota ?? "") !== (depois?.nota ?? "")) {
    mudancas.push(depois?.nota ? "nota alterada" : "nota apagada");
  }
  const obrigatorio = ITENS_INSTRUCAO.find((i) => i.chave === chave)?.obrigatorio === true;
  if (obrigatorio && antes?.feito && !depois?.feito && resultado.declaracaoEm) {
    mudancas.push("declaração mantida");
  }

  await registrarAuditoria({
    ator: `${ator.tipo}:${ator.id}`,
    acao: `${ator.tipo}.marcarItemInstrucao`,
    alvo: oportunidade.id,
    detalhe: `item ${chave}: ${mudancas.join("; ") || "atualizado"}`,
  });
  revalidarTelas(oportunidade.ataId);
  return { ok: true };
}

/**
 * Registra a declaração interna de conformidade da instrução. Com todos os
 * obrigatórios feitos ela vale sem justificativa; com pendência exige
 * `justificativaExcecao` (a regra é de validarDeclaracao) e a justificativa
 * fica gravada junto. Não declara por cima de outra: primeiro se revoga.
 */
export async function declararConformidade(
  oportunidadeId: string,
  _estadoAnterior: EstadoInstrucao,
  formData: FormData,
): Promise<EstadoInstrucao> {
  const sessao = await exigirSessao();
  const justificativa = campoTexto(formData, "justificativaExcecao") ?? "";

  const acesso = await autorizar(sessao, oportunidadeId);
  if ("erro" in acesso) return { erro: acesso.erro };
  const { ator, oportunidade } = acesso;

  const atual = await lerInstrucao(oportunidade.id);
  if (atual?.declaracaoEm) {
    return { erro: "Já existe uma declaração registrada para este município. Para registrar outra, revogue a atual antes." };
  }

  const mapa = atual?.itens ?? {};
  const validacao = validarDeclaracao({ mapa, justificativaExcecao: justificativa });
  if (!validacao.ok) return { erro: validacao.erro };

  // A exceção só é gravada quando havia pendência obrigatória; com tudo feito a justificativa é irrelevante.
  const resumo = resumirInstrucao(mapa);
  const excecao = resumo.completo ? null : normalizarJustificativa(justificativa);

  const gravou = await registrarDeclaracao(oportunidade.id, atual?.atualizadoEm ?? null, {
    declaracaoEm: new Date(),
    declaracaoPorTipo: ator.tipo,
    declaracaoPorId: ator.id,
    declaracaoVersao: VERSAO_DECLARACAO,
    declaracaoExcecao: excecao,
  });
  if (!gravou) return { erro: ERRO_CONFLITO };

  // A justificativa vai também para a auditoria: revogar apaga a da linha, e o histórico não pode se perder.
  await registrarAuditoria({
    ator: `${ator.tipo}:${ator.id}`,
    acao: `${ator.tipo}.declararConformidade`,
    alvo: oportunidade.id,
    detalhe: excecao
      ? `versão ${VERSAO_DECLARACAO}; com exceção (${resumo.pendentesObrigatorios.length} obrigatório(s) pendente(s)); justificativa: ${excecao}`
      : `versão ${VERSAO_DECLARACAO}; todos os itens obrigatórios feitos`,
  });
  revalidarTelas(oportunidade.ataId);
  return { ok: true };
}

/**
 * Apaga a declaração (data, quem, versão e exceção). Só enquanto o município
 * não está em "Aderiu": depois disso a declaração já sustentou uma adesão.
 */
export async function revogarDeclaracao(
  oportunidadeId: string,
  _estadoAnterior: EstadoInstrucao,
): Promise<EstadoInstrucao> {
  const sessao = await exigirSessao();

  const acesso = await autorizar(sessao, oportunidadeId);
  if ("erro" in acesso) return { erro: acesso.erro };
  const { ator, oportunidade } = acesso;

  if (oportunidade.estagio === ESTAGIO_ADERIU) {
    return { erro: "Com o município em Aderiu, a declaração não pode mais ser revogada." };
  }
  const atual = await lerInstrucao(oportunidade.id);
  if (!atual?.declaracaoEm) return { erro: "Não há declaração registrada para revogar." };

  const apagou = await apagarDeclaracao(oportunidade.id, ESTAGIO_ADERIU);
  if (!apagou) {
    return { erro: "Não foi possível revogar: a declaração já foi revogada ou o município passou para Aderiu." };
  }

  await registrarAuditoria({
    ator: `${ator.tipo}:${ator.id}`,
    acao: `${ator.tipo}.revogarDeclaracao`,
    alvo: oportunidade.id,
    detalhe: `declaração de ${atual.declaracaoEm.toISOString()} (${atual.declaracaoPorTipo ?? "?"}:${atual.declaracaoPorId ?? "?"}, versão ${atual.declaracaoVersao ?? "?"}${atual.declaracaoExcecao ? `, com exceção: ${atual.declaracaoExcecao}` : ""}) revogada`,
  });
  revalidarTelas(oportunidade.ataId);
  return { ok: true };
}
