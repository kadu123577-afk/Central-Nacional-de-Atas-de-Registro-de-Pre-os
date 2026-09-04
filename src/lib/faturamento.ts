/**
 * Motor de cálculo da cobrança gerada quando uma adesão chega em EMPENHADA
 * (Sprint 8) — o "contas a receber" da Tech 10.
 *
 * A taxa de intermediação é de 5% sobre o valor do contrato (confirmado
 * pela Tech 10), configurável via TAXA_INTERMEDIACAO_PERCENTUAL caso mude.
 *
 * O repasse à empresa desenvolvedora é um acerto privado entre a Tech 10 e
 * a desenvolvedora, fora da plataforma — este motor não calcula nem
 * registra esse repasse. O valor aqui é sempre o total devido à Tech 10.
 */

export const PERCENTUAL_TAXA_INTERMEDIACAO_PADRAO = 0.05;

export interface Faturamento {
  valorContrato: number;
  percentualTaxa: number;
  valorTaxaIntermediacao: number;
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

  return {
    valorContrato,
    percentualTaxa,
    valorTaxaIntermediacao,
  };
}
