/**
 * Comparativo AUXILIAR de preço ("vantajosidade") — 2026-10-22, Projeto RNA
 * etapa 4.
 *
 * Quem adere a uma ata precisa demonstrar que o preço é vantajoso (Lei
 * 14.133/2021, art. 86) e a pesquisa de preços formal (art. 23) é do ÓRGÃO.
 * A plataforma só ajuda: põe o preço unitário de cada item da ata ao lado de
 * preços praticados em contratações públicas, vindos da API oficial de
 * pesquisa de preços do Compras.gov.br. Nada aqui afirma que um preço é
 * vantajoso; a linguagem é sempre "compatível com os preços consultados".
 *
 * Tudo é puro (sem banco nem rede) para poder ser testado. A consulta à API e
 * a gravação em ReferenciaPreco ficam em outro módulo.
 *
 * Regras de cálculo:
 *  - descarta valores que não são número finito maior que zero (string
 *    numérica também é descartada: dado sujo não vira número por adivinhação);
 *  - com 8 ou mais valores válidos, descarta outliers pelo critério do
 *    intervalo interquartil (fora de Q1 - 1,5 x IQR e Q3 + 1,5 x IQR), uma
 *    única passada;
 *  - percentis por interpolação linear (mesma regra do PERCENTIL.INC do
 *    Excel);
 *  - NADA é arredondado no cálculo; o arredondamento para 2 casas é só da
 *    apresentação (arredondar2 / formatarReais).
 */

/** Menos preços que isso: não dá para dizer nada ("amostra_insuficiente"). */
export const AMOSTRA_MINIMA = 5;
/** Só descarta outliers quando há pelo menos esta quantidade de valores válidos. */
export const MINIMO_PARA_OUTLIERS = 8;
/** Fator do intervalo interquartil para considerar um valor outlier. */
export const FATOR_IQR = 1.5;
/** Diferença para a mediana (em fração) até a qual o preço ainda é "compatível". */
export const TOLERANCIA_COMPATIVEL = 0.1;
/** Folga numérica para a borda de 10% não depender de ponto flutuante (1,1 vs 1,0). */
const FOLGA = 1e-9;

export const TEXTO_AVISO_VANTAJOSIDADE =
  "Comparativo auxiliar, feito com preços de contratações públicas do Compras.gov.br. Não substitui a pesquisa de preços do órgão (Lei 14.133/2021, art. 23), que é de responsabilidade do órgão aderente.";

// ------------------------------------------------------------- tipos

export interface AmostraPreco {
  valorUnitario: number;
  /** AAAA-MM-DD, quando a API informa. */
  data?: string;
  uf?: string;
  /** Unidade de fornecimento (ex.: "CAIXA 50 UN"); preços de unidades diferentes não se comparam. */
  unidade?: string;
}

export interface OpcoesEstatistica {
  /** Padrão: true. Com false, só descarta valores inválidos. */
  descartarOutliers?: boolean;
  /** Padrão: MINIMO_PARA_OUTLIERS. */
  minimoParaOutliers?: number;
  /** Padrão: FATOR_IQR. */
  fatorIqr?: number;
}

export interface EstatisticasPrecos {
  /** Quantas amostras chegaram (inclusive as descartadas). */
  n: number;
  /** Quantas sobraram depois do descarte de inválidas e outliers. */
  nUsadas: number;
  minimo: number;
  p25: number;
  mediana: number;
  p75: number;
  maximo: number;
  media: number;
}

export type SituacaoPreco = "abaixo" | "compativel" | "acima" | "amostra_insuficiente" | "sem_referencia";

export interface ClassificacaoPreco {
  situacao: SituacaoPreco;
  /** Em %, em relação à MEDIANA: negativo = preço da ata mais barato. Nulo quando não há comparação confiável. */
  diferencaPercentual: number | null;
  explicacao: string;
}

export interface ItemParaResumo {
  descricao: string;
  precoAta: number;
  quantidade: number;
  referencia: EstatisticasPrecos | null;
}

export interface ResumoAta {
  /** Itens com comparação conclusiva (abaixo + compativeis + acima). */
  itensComReferencia: number;
  itensTotal: number;
  acima: number;
  abaixo: number;
  compativeis: number;
  /** Sem referência utilizável: sem preços, amostra insuficiente ou preço da ata inválido. */
  semReferencia: number;
  /**
   * % do VALOR (preço x quantidade) dos itens com referência que está "acima".
   * Nulo quando não há valor para basear o percentual.
   */
  pesoAcima: number | null;
}

// ------------------------------------------------------------- apresentação

/** Arredonda para 2 casas (metade para longe do zero). Só para exibir. */
export function arredondar2(valor: number): number {
  if (!Number.isFinite(valor)) return valor;
  const sinal = valor < 0 ? -1 : 1;
  // "+ 0" troca o -0 (de um negativo minúsculo) por 0: Intl mostraria "-0".
  return (sinal * Math.round((Math.abs(valor) + Number.EPSILON) * 100)) / 100 + 0;
}

/** "R$ 1.234,50". Valor positivo menor que meio centavo mostra 4 casas para não virar "R$ 0,00". */
export function formatarReais(valor: number): string {
  const casas = valor > 0 && valor < 0.005 ? 4 : 2;
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function formatarPercentual(pontos: number): string {
  return `${Math.abs(pontos).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

// ------------------------------------------------------------- estatística

/** Percentil de uma lista JÁ ORDENADA, por interpolação linear (p entre 0 e 1). */
function percentil(ordenados: number[], p: number): number {
  const posicao = p * (ordenados.length - 1);
  const baixo = Math.floor(posicao);
  const alto = Math.ceil(posicao);
  if (baixo === alto) return ordenados[baixo];
  return ordenados[baixo] + (posicao - baixo) * (ordenados[alto] - ordenados[baixo]);
}

function valorValido(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Estatísticas de uma lista de preços. Nulo quando não sobra nenhum valor
 * utilizável (lista vazia ou só dado inválido).
 */
export function estatisticasDePrecos(
  amostras: AmostraPreco[],
  opcoes: OpcoesEstatistica = {},
): EstatisticasPrecos | null {
  if (!Array.isArray(amostras) || amostras.length === 0) return null;

  const n = amostras.length;
  let valores = amostras
    .map((a) => (a ? a.valorUnitario : undefined))
    .filter(valorValido)
    .sort((a, b) => a - b);
  if (valores.length === 0) return null;

  const descartar = opcoes.descartarOutliers ?? true;
  const minimoParaOutliers = opcoes.minimoParaOutliers ?? MINIMO_PARA_OUTLIERS;
  const fator = opcoes.fatorIqr ?? FATOR_IQR;

  if (descartar && valores.length >= minimoParaOutliers) {
    const q1 = percentil(valores, 0.25);
    const q3 = percentil(valores, 0.75);
    const iqr = q3 - q1;
    const limiteInferior = q1 - fator * iqr;
    const limiteSuperior = q3 + fator * iqr;
    // Os quartis sempre ficam dentro dos limites, então nunca sobra lista vazia.
    valores = valores.filter((v) => v >= limiteInferior && v <= limiteSuperior);
  }

  const soma = valores.reduce((acc, v) => acc + v, 0);
  return {
    n,
    nUsadas: valores.length,
    minimo: valores[0],
    p25: percentil(valores, 0.25),
    mediana: percentil(valores, 0.5),
    p75: percentil(valores, 0.75),
    maximo: valores[valores.length - 1],
    media: soma / valores.length,
  };
}

// ------------------------------------------------------------- classificação

function semComparacao(situacao: SituacaoPreco, explicacao: string): ClassificacaoPreco {
  return { situacao, diferencaPercentual: null, explicacao };
}

function referenciaUtilizavel(r: EstatisticasPrecos): boolean {
  return (
    // nUsadas ausente ou inválido (ex.: linha do banco mal convertida) não pode
    // virar "NaN preços consultados" no texto nem escapar da amostra mínima.
    Number.isFinite(r.nUsadas) &&
    Number.isFinite(r.mediana) &&
    r.mediana > 0 &&
    Number.isFinite(r.p25) &&
    Number.isFinite(r.p75) &&
    r.p25 <= r.mediana &&
    r.mediana <= r.p75
  );
}

/**
 * Compara o preço unitário da ata com a referência de preços consultados.
 *  - compativel: entre p25 e p75 (inclusive) OU a até 10% da mediana;
 *  - abaixo: menor que p25 e mais de 10% abaixo da mediana;
 *  - acima: maior que p75 e mais de 10% acima da mediana.
 * Nunca diz que o preço "é vantajoso": só como ele se situa frente aos preços
 * que a plataforma conseguiu consultar.
 */
export function classificarPreco(entrada: {
  precoAta: number;
  referencia: EstatisticasPrecos | null | undefined;
}): ClassificacaoPreco {
  const { precoAta, referencia } = entrada;

  if (!valorValido(precoAta)) {
    return semComparacao(
      "sem_referencia",
      "O preço da ata não é válido (está zerado, negativo ou não é um número), então não foi possível comparar.",
    );
  }
  if (!referencia) {
    return semComparacao(
      "sem_referencia",
      "Não há preços consultados para este item. Informe o código do catálogo (CATMAT ou CATSER) ou faça a pesquisa de preços direto nas fontes oficiais.",
    );
  }
  if (!referenciaUtilizavel(referencia)) {
    return semComparacao(
      "sem_referencia",
      "Os preços consultados para este item vieram incompletos, então não foi possível comparar.",
    );
  }
  if (referencia.nUsadas < AMOSTRA_MINIMA) {
    return semComparacao(
      "amostra_insuficiente",
      `Há poucos preços consultados para este item (${referencia.nUsadas}; o mínimo para comparar é ${AMOSTRA_MINIMA}). Com tão poucos preços, não dá para dizer se o preço da ata é compatível.`,
    );
  }

  const fracao = (precoAta - referencia.mediana) / referencia.mediana;
  const diferencaPercentual = fracao * 100;
  const dentroDaFaixa = precoAta >= referencia.p25 && precoAta <= referencia.p75;
  const dentroDaTolerancia = Math.abs(fracao) <= TOLERANCIA_COMPATIVEL + FOLGA;

  const precoTxt = formatarReais(precoAta);
  const medianaTxt = formatarReais(referencia.mediana);
  const base = `${referencia.nUsadas} preços consultados`;

  if (dentroDaFaixa || dentroDaTolerancia) {
    const posicao =
      Math.abs(diferencaPercentual) < 0.05
        ? "praticamente igual à mediana"
        : `${formatarPercentual(diferencaPercentual)} ${diferencaPercentual < 0 ? "abaixo" : "acima"} da mediana`;
    return {
      situacao: "compativel",
      diferencaPercentual,
      explicacao: `O preço da ata (${precoTxt}) é compatível com os preços consultados: está ${posicao} (${medianaTxt}). Referência: ${base}, com faixa central de ${formatarReais(referencia.p25)} a ${formatarReais(referencia.p75)}.`,
    };
  }

  if (precoAta < referencia.p25) {
    return {
      situacao: "abaixo",
      diferencaPercentual,
      explicacao: `O preço da ata (${precoTxt}) está abaixo dos preços consultados: ${formatarPercentual(diferencaPercentual)} menos que a mediana (${medianaTxt}) e abaixo da faixa central, que começa em ${formatarReais(referencia.p25)} (${base}). Confira se o item é equivalente ao da pesquisa: preço muito baixo pode indicar especificação ou unidade diferente.`,
    };
  }

  return {
    situacao: "acima",
    diferencaPercentual,
    explicacao: `O preço da ata (${precoTxt}) está acima dos preços consultados: ${formatarPercentual(diferencaPercentual)} mais que a mediana (${medianaTxt}) e acima da faixa central, que vai até ${formatarReais(referencia.p75)} (${base}). Vale conferir se a especificação e as condições são equivalentes e se há justificativa para a diferença.`,
  };
}

// ------------------------------------------------------------- resumo da ata

/** Resumo da ata inteira: quantos itens ficaram acima, abaixo e compatíveis, e quanto do valor está "acima". */
export function resumirAta(itens: ItemParaResumo[]): ResumoAta {
  const resumo: ResumoAta = {
    itensComReferencia: 0,
    itensTotal: 0,
    acima: 0,
    abaixo: 0,
    compativeis: 0,
    semReferencia: 0,
    pesoAcima: null,
  };
  if (!Array.isArray(itens)) return resumo;

  let valorComReferencia = 0;
  let valorAcima = 0;

  for (const item of itens) {
    resumo.itensTotal += 1;
    const { situacao } = classificarPreco({ precoAta: item.precoAta, referencia: item.referencia });

    if (situacao === "sem_referencia" || situacao === "amostra_insuficiente") {
      resumo.semReferencia += 1;
      continue;
    }

    resumo.itensComReferencia += 1;
    if (situacao === "acima") resumo.acima += 1;
    else if (situacao === "abaixo") resumo.abaixo += 1;
    else resumo.compativeis += 1;

    // Quantidade inválida pesa zero: o item continua contado, mas não entra no valor.
    const quantidade = Number.isFinite(item.quantidade) && item.quantidade > 0 ? item.quantidade : 0;
    const valor = item.precoAta * quantidade;
    valorComReferencia += valor;
    if (situacao === "acima") valorAcima += valor;
  }

  resumo.pesoAcima = valorComReferencia > 0 ? (valorAcima / valorComReferencia) * 100 : null;
  return resumo;
}
