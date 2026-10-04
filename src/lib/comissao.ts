/**
 * Faixa de comissão pactuada com o fornecedor (SCP cl. 4 e Projeto RNA §2,
 * 2026-10-04): entre 3% e 15% sobre o valor bruto das notas fiscais
 * liquidadas. O percentual vive no contrato de intermediação da ata
 * (ContratoIntermediacao), não na oportunidade do vendedor.
 */
export const COMISSAO_MINIMA_PERCENTUAL = 3;
export const COMISSAO_MAXIMA_PERCENTUAL = 15;

export type ResultadoPercentualComissao =
  | { ok: true; fracao: string }
  | { ok: false; erro: string };

/**
 * Lê o percentual digitado em % (aceita vírgula, ex.: "7,5") e devolve a
 * fração com 4 casas (0.0750) pra gravar em Decimal(5,4) e multiplicar
 * direto pelo valor liquidado.
 */
export function interpretarPercentualComissao(bruto: string): ResultadoPercentualComissao {
  const texto = bruto.trim().replace(",", ".");
  const numero = Number(texto);
  if (!texto || !Number.isFinite(numero)) {
    return { ok: false, erro: "Informe o percentual de comissão." };
  }
  if (numero < COMISSAO_MINIMA_PERCENTUAL || numero > COMISSAO_MAXIMA_PERCENTUAL) {
    return {
      ok: false,
      erro: `O percentual de comissão deve ficar entre ${COMISSAO_MINIMA_PERCENTUAL}% e ${COMISSAO_MAXIMA_PERCENTUAL}%.`,
    };
  }
  return { ok: true, fracao: (Math.round(numero * 100) / 10000).toFixed(4) };
}
