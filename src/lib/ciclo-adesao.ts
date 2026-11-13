import { somarDiasUteis, type Feriados } from "@/lib/dias-uteis";
import { situacaoDoVencimento, type SituacaoDoPrazo } from "@/lib/ciclo-ata";
import type { Permissao } from "@/lib/permissoes";

/**
 * Ciclo da adesão, atividades 8 a 17 do workflow (2026-11-14): do pedido do município até o pós-venda.
 * Regras puras, sem banco e sem relógio. Em que etapa o município está é DERIVADO dos dados que o
 * sistema já guarda (nada novo para a equipe preencher). Os prazos (dias úteis) são os do documento
 * "Workflow principal da Central de Atas" e contam do que o banco registra de cada etapa anterior:
 * a contagem é aproximada, serve para cobrar.
 *
 * A etapa 8 (pedir o município) nunca "espera": quando o pedido existe, ela está feita e o que
 * espera é a liberação (9). A etapa 17 (pós-venda e renovação) é contínua e não tem prazo.
 */

export type NumeroEtapaAdesao = 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17;

export interface EtapaDaAdesao {
  numero: NumeroEtapaAdesao;
  titulo: string;
  /** Quem faz, pelo papel (as pessoas mudam; o papel não). */
  papel: string;
  /** Prazo em dias úteis; null = contínuo, sem prazo. */
  prazoDiasUteis: number | null;
  /** Permissão de quem trabalha nesta etapa no painel; null = quem faz não é do painel (consultor, órgão, fornecedor). */
  permissao: Permissao | null;
  /** O que a pessoa faz na tela. */
  acao: string;
}

export const ETAPAS_DA_ADESAO: readonly EtapaDaAdesao[] = [
  { numero: 8, titulo: "Pedir o município", papel: "Equipe de vendas", prazoDiasUteis: 2, permissao: null, acao: "Pedir o município" },
  { numero: 9, titulo: "Liberar o município", papel: "Administração", prazoDiasUteis: 1, permissao: "municipios.liberar", acao: "Liberar ou negar o pedido" },
  { numero: 10, titulo: "Abordar e negociar", papel: "Equipe de vendas", prazoDiasUteis: 10, permissao: null, acao: "Acompanhar a negociação" },
  { numero: 11, titulo: "Instruir a adesão", papel: "Aprovador, com o órgão aderente", prazoDiasUteis: 15, permissao: "adesao.instruir", acao: "Marcar a instrução" },
  { numero: 12, titulo: "Declarar a conformidade da adesão", papel: "Jurídico", prazoDiasUteis: 2, permissao: "adesao.declarar", acao: "Declarar a conformidade" },
  { numero: 13, titulo: "Registrar a adesão", papel: "Captação (estagiário)", prazoDiasUteis: 1, permissao: "adesao.registrar", acao: "Registrar a adesão" },
  { numero: 14, titulo: "Contrato ou empenho e publicação no PNCP", papel: "Órgão aderente, acompanhado pela equipe", prazoDiasUteis: 10, permissao: "adesao.acompanhar", acao: "Confirmar o contrato detectado" },
  { numero: 15, titulo: "Entrega e liquidação", papel: "Fornecedor e órgão, acompanhados pela equipe", prazoDiasUteis: 30, permissao: "comissao.cobrar", acao: "Lançar a liquidação" },
  { numero: 16, titulo: "Cobrar e receber a comissão", papel: "Administração (cobrança)", prazoDiasUteis: 5, permissao: "comissao.cobrar", acao: "Cobrar a comissão" },
  { numero: 17, titulo: "Pós-venda e renovação", papel: "Equipe de vendas", prazoDiasUteis: null, permissao: null, acao: "Acompanhar o pós-venda" },
];

export function etapaDaAdesaoPorNumero(numero: number): EtapaDaAdesao | undefined {
  return ETAPAS_DA_ADESAO.find((e) => e.numero === numero);
}

/** Tela onde a etapa se resolve, dado o município (a oportunidade). */
export function caminhoDaEtapaDaAdesao(numero: NumeroEtapaAdesao, oportunidadeId: string | null): string {
  switch (numero) {
    case 9:
      return "/admin/negociacoes";
    case 11:
    case 12:
    case 13:
      return oportunidadeId ? `/admin/adesoes/${oportunidadeId}` : "/admin/adesoes";
    case 14:
      return "/admin/contratos-detectados";
    case 15:
    case 16:
      return "/admin/recebiveis-vendedores";
    default:
      return "/admin/pipeline";
  }
}

// ---------------------------------------------------------------------------------------------
// Da negociação ao registro (etapas 10 a 13)
// ---------------------------------------------------------------------------------------------

export interface DadosDaNegociacao {
  /** Já tem pelo menos um item obrigatório da instrução marcado. */
  instrucaoIniciada: boolean;
  /** Todos os itens obrigatórios da instrução feitos. */
  instrucaoCompleta: boolean;
  /** Data da declaração de conformidade do jurídico; null = ainda não declarada. */
  declaradaEm: Date | null;
}

/**
 * 10 negociando · 11 instruindo (começou a marcar) · 12 instrução completa, espera a declaração ·
 * 13 declarada, espera o registro do estagiário.
 */
export function etapaDaNegociacao(d: DadosDaNegociacao): 10 | 11 | 12 | 13 {
  if (d.declaradaEm) return 13;
  if (d.instrucaoCompleta) return 12;
  if (d.instrucaoIniciada) return 11;
  return 10;
}

// ---------------------------------------------------------------------------------------------
// Da adesão registrada ao pós-venda (etapas 14 a 17)
// ---------------------------------------------------------------------------------------------

export interface DadosDaAdesaoRegistrada {
  registradaEm: Date;
  /** Quando o vínculo com o contrato público (PNCP) foi confirmado; null = ainda não confirmado. */
  contratoConfirmadoEm: Date | null;
  liquidacoes: { dataLiquidacao: Date; statusCobranca: string }[];
}

export interface PosicaoDaAdesao {
  etapa: 14 | 15 | 16 | 17;
  /** Desde quando espera (null no pós-venda, que é contínuo). */
  desde: Date | null;
}

/**
 * 14 espera o contrato ser confirmado · 15 contrato confirmado, espera a liquidação · 16 há liquidação
 * com a comissão ainda por receber (conta da liquidação mais antiga) · 17 tudo recebido: pós-venda.
 * Liquidação lançada vale como prova de que o contrato e a entrega aconteceram, mesmo que o vínculo
 * com o PNCP não tenha sido confirmado (o lançamento manual é a verdade do que foi liquidado).
 */
export function posicaoDaAdesaoRegistrada(d: DadosDaAdesaoRegistrada): PosicaoDaAdesao {
  if (d.liquidacoes.length > 0) {
    const porReceber = d.liquidacoes.filter((l) => l.statusCobranca !== "recebida");
    if (porReceber.length === 0) return { etapa: 17, desde: null };
    const maisAntiga = porReceber.reduce((a, b) => (a.dataLiquidacao <= b.dataLiquidacao ? a : b));
    return { etapa: 16, desde: maisAntiga.dataLiquidacao };
  }
  if (d.contratoConfirmadoEm) return { etapa: 15, desde: d.contratoConfirmadoEm };
  return { etapa: 14, desde: d.registradaEm };
}

// ---------------------------------------------------------------------------------------------
// Prazo
// ---------------------------------------------------------------------------------------------

/** Vencimento da etapa a partir de quando ela espera; null se a etapa não tem prazo. */
export function vencimentoDaEtapaDaAdesao(
  numero: NumeroEtapaAdesao,
  desde: Date,
  feriados?: Feriados,
): Date | null {
  const prazo = etapaDaAdesaoPorNumero(numero)?.prazoDiasUteis ?? null;
  return prazo === null ? null : somarDiasUteis(desde, prazo, feriados);
}

/** Em dia, vence hoje ou atrasado (dias úteis), ou null quando não há vencimento. */
export function situacaoDoPrazoDaAdesao(
  vencimento: Date | null,
  agora: Date,
  feriados?: Feriados,
): SituacaoDoPrazo | null {
  return vencimento ? situacaoDoVencimento(vencimento, agora, feriados) : null;
}
