/**
 * Valor unitário do item da ata com até QUATRO casas decimais (14/11/2026): há itens com preço como
 * R$ 0,1005 por grama, que o banco guardava arredondado a duas casas (Item.valorUnitario passou a
 * Decimal(14,4)). Os totais em dinheiro continuam em centavos: a linha (valor unitário x quantidade)
 * é arredondada ao centavo uma vez só, no fim.
 */

/** Texto para o Decimal do banco: até quatro casas, no mínimo duas ("25.90", "0.1005", "0.105"). */
export function textoDoValorUnitario(valor: number): string {
  const t = valor.toFixed(4);
  if (t.endsWith("00")) return t.slice(0, -2);
  if (t.endsWith("0")) return t.slice(0, -1);
  return t;
}

/** O valor tem mais de quatro casas decimais (o banco arredondaria)? */
export function temMaisDeQuatroCasas(valor: number): boolean {
  return Math.abs(valor * 10_000 - Math.round(valor * 10_000)) > 1e-6;
}

const fmtValorUnitario = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** "R$ 25,90" ou "R$ 0,1005": duas casas, e até quatro quando o preço as tem. */
export function formatarValorUnitario(valor: number): string {
  return fmtValorUnitario.format(valor).replace(/ /g, " ");
}

/**
 * Valor de uma linha em centavos inteiros: valor unitário (texto do Decimal, até quatro casas) x
 * quantidade, arredondado ao centavo (meio centavo sobe). A conta é feita em inteiros (décimos de
 * milésimo), sem ponto flutuante: 0,1005 x 1.000 dá R$ 100,50 exatos.
 */
export function centavosDaLinha(valorUnitario: string, quantidade: number): number {
  const decimosDeMilesimo = BigInt(Math.round(Number(valorUnitario) * 10_000));
  const total = decimosDeMilesimo * BigInt(quantidade);
  return Number((total + BigInt(50)) / BigInt(100));
}
