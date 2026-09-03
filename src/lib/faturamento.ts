/**
 * Motor de cálculo da cobrança gerada quando uma adesão chega em EMPENHADA
 * (Sprint 8) — ver plano de gestão comercial da Tech 10 Digital.
 *
 * A divisão 95%/5% entre Tech 10 e a empresa desenvolvedora é uma regra de
 * negócio fixa do plano ("Participação de 5% nos Resultados Diretos").
 *
 * O percentual da taxa de intermediação em si — o que o fornecedor paga
 * sobre o valor do contrato — não veio definido em nenhum documento do
 * plano; fica configurável via TAXA_INTERMEDIACAO_PERCENTUAL (padrão 3%,
 * um placeholder até a Tech 10 confirmar o percentual comercial real).
 */

export const PERCENTUAL_REPASSE_DESENVOLVEDORA = 0.05;
export const PERCENTUAL_TECH10 = 1 - PERCENTUAL_REPASSE_DESENVOLVEDORA;
export const PERCENTUAL_TAXA_INTERMEDIACAO_PADRAO = 0.03;

export interface Faturamento {
  valorContrato: number;
  percentualTaxa: number;
  valorTaxaIntermediacao: number;
  valorTech10: number;
  valorDesenvolvedora: number;
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function percentualTaxaIntermediacaoConfigurado(): number {
  const valor = Number(process.env.TAXA_INTERMEDIACAO_PERCENTUAL);
  return Number.isFinite(valor) && valor > 0 ? valor : PERCENTUAL_TAXA_INTERMEDIACAO_PADRAO;
}

export function calcularFaturamento(
  quantidadeSolicitada: number,
  valorUnitario: number,
  percentualTaxa: number = percentualTaxaIntermediacaoConfigurado(),
): Faturamento {
  const valorContrato = arredondar(quantidadeSolicitada * valorUnitario);
  const valorTaxaIntermediacao = arredondar(valorContrato * percentualTaxa);
  const valorDesenvolvedora = arredondar(
    valorTaxaIntermediacao * PERCENTUAL_REPASSE_DESENVOLVEDORA,
  );
  const valorTech10 = arredondar(valorTaxaIntermediacao - valorDesenvolvedora);

  return {
    valorContrato,
    percentualTaxa,
    valorTaxaIntermediacao,
    valorTech10,
    valorDesenvolvedora,
  };
}
