import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { normalizarMapa, type MapaInstrucao } from "@/lib/instrucao-adesao";

/**
 * Leitura e gravação da InstrucaoAdesao (Projeto RNA, etapa 3, 2026-10-21).
 * Aqui só se fala com o banco: quem pode fazer o quê, o que vale como
 * declaração e o que vai para a auditoria ficam em
 * src/app/vendedor/instrucao-actions.ts, e o vocabulário do checklist em
 * src/lib/instrucao-adesao.ts.
 *
 * A coluna `itens` é um JSON único: duas gravações ao mesmo tempo (o
 * vendedor em duas abas, ou ele e o gestor) poderiam se sobrescrever. Por
 * isso a troca é "condicional": só grava se a linha continua com o
 * `atualizadoEm` que foi lido, e tenta de novo se alguém mexeu no meio.
 */

const TENTATIVAS = 5;

/** O que a action precisa saber da oportunidade para decidir quem pode mexer. */
export interface OportunidadeDaInstrucao {
  id: string;
  ataId: string;
  vendedorId: string;
  estagio: string;
  expiradaEm: Date | null;
}

export async function buscarOportunidadeDaInstrucao(oportunidadeId: string): Promise<OportunidadeDaInstrucao | null> {
  return prisma.oportunidadeVenda.findUnique({
    where: { id: oportunidadeId },
    select: { id: true, ataId: true, vendedorId: true, estagio: true, expiradaEm: true },
  });
}

/** A instrução como está gravada, com o JSON dos itens já normalizado. */
export interface RegistroInstrucao {
  oportunidadeId: string;
  itens: MapaInstrucao;
  declaracaoEm: Date | null;
  declaracaoPorTipo: string | null;
  declaracaoPorId: string | null;
  declaracaoVersao: number | null;
  declaracaoExcecao: string | null;
  atualizadoEm: Date;
}

export async function lerInstrucao(oportunidadeId: string): Promise<RegistroInstrucao | null> {
  const linha = await prisma.instrucaoAdesao.findUnique({ where: { oportunidadeId } });
  if (!linha) return null;
  return {
    oportunidadeId: linha.oportunidadeId,
    itens: normalizarMapa(linha.itens),
    declaracaoEm: linha.declaracaoEm,
    declaracaoPorTipo: linha.declaracaoPorTipo,
    declaracaoPorId: linha.declaracaoPorId,
    declaracaoVersao: linha.declaracaoVersao,
    declaracaoExcecao: linha.declaracaoExcecao,
    atualizadoEm: linha.atualizadoEm,
  };
}

/** Erro do Prisma para "já existe uma linha com este valor único" (a corrida da primeira gravação). */
function violacaoDeUnicidade(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && (erro as { code?: unknown }).code === "P2002";
}

function comoJson(mapa: MapaInstrucao): Prisma.InputJsonObject {
  return mapa as Prisma.InputJsonObject;
}

export type ResultadoAtualizacaoItens =
  | { ok: true; antes: MapaInstrucao; depois: MapaInstrucao; mudou: boolean; declaracaoEm: Date | null }
  | { ok: false; motivo: "conflito" };

/**
 * Lê os itens, deixa `aplicar` (função pura, a regra mora em quem chama)
 * produzir o novo mapa e grava. Se nada mudou, não escreve. Cria a linha na
 * primeira vez. Se outra gravação passou na frente, relê e aplica de novo;
 * depois de TENTATIVAS seguidas sem sucesso, devolve "conflito".
 */
export async function atualizarItens(
  oportunidadeId: string,
  aplicar: (atual: MapaInstrucao) => MapaInstrucao,
): Promise<ResultadoAtualizacaoItens> {
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    const atual = await lerInstrucao(oportunidadeId);
    const antes = atual?.itens ?? {};
    const depois = aplicar(antes);
    const declaracaoEm = atual?.declaracaoEm ?? null;
    // As duas pontas passam por normalizarMapa: a ordem das chaves é a mesma e a comparação é segura.
    if (JSON.stringify(antes) === JSON.stringify(depois)) {
      return { ok: true, antes, depois, mudou: false, declaracaoEm };
    }

    if (!atual) {
      try {
        await prisma.instrucaoAdesao.create({ data: { oportunidadeId, itens: comoJson(depois) } });
        return { ok: true, antes, depois, mudou: true, declaracaoEm };
      } catch (erro) {
        if (violacaoDeUnicidade(erro)) continue; // alguém criou a linha primeiro: relê.
        throw erro;
      }
    }

    const { count } = await prisma.instrucaoAdesao.updateMany({
      where: { oportunidadeId, atualizadoEm: atual.atualizadoEm },
      data: { itens: comoJson(depois) },
    });
    if (count > 0) return { ok: true, antes, depois, mudou: true, declaracaoEm };
  }
  return { ok: false, motivo: "conflito" };
}

export interface DadosDeclaracao {
  declaracaoEm: Date;
  declaracaoPorTipo: string;
  declaracaoPorId: string;
  declaracaoVersao: number;
  declaracaoExcecao: string | null;
}

/**
 * Grava a declaração só se ela ainda não existe E se os itens continuam como
 * foram lidos (`lidoEm` é o `atualizadoEm` da leitura, ou null se a linha não
 * existia). Devolve false quando a condição falhou: alguém declarou ou mexeu
 * nos itens no meio, e quem chama deve pedir para conferir de novo.
 */
export async function registrarDeclaracao(
  oportunidadeId: string,
  lidoEm: Date | null,
  dados: DadosDeclaracao,
): Promise<boolean> {
  if (lidoEm === null) {
    try {
      await prisma.instrucaoAdesao.create({ data: { oportunidadeId, ...dados } });
      return true;
    } catch (erro) {
      if (violacaoDeUnicidade(erro)) return false;
      throw erro;
    }
  }
  const { count } = await prisma.instrucaoAdesao.updateMany({
    where: { oportunidadeId, declaracaoEm: null, atualizadoEm: lidoEm },
    data: dados,
  });
  return count > 0;
}

/**
 * Apaga a declaração (data, quem, versão e exceção) — a menos que a
 * oportunidade já esteja em `estagioQueImpede`. A checagem do estágio vai na
 * mesma instrução SQL do apagamento, então um "Aderiu" que acontece no meio
 * do caminho não é atropelado. Devolve false quando nada foi apagado.
 */
export async function apagarDeclaracao(oportunidadeId: string, estagioQueImpede: string): Promise<boolean> {
  const { count } = await prisma.instrucaoAdesao.updateMany({
    where: {
      oportunidadeId,
      declaracaoEm: { not: null },
      oportunidade: { estagio: { not: estagioQueImpede } },
    },
    data: {
      declaracaoEm: null,
      declaracaoPorTipo: null,
      declaracaoPorId: null,
      declaracaoVersao: null,
      declaracaoExcecao: null,
    },
  });
  return count > 0;
}
