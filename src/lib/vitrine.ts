/**
 * Cálculos da vitrine pública (home e catálogo no layout do site): saldo
 * percentual de uma ata e lista de UFs do filtro.
 */
import { limiteAgregado } from "./saldo";

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

interface ItemComSaldo {
  quantidadeRegistrada: number;
  saldo: { quantidadeConsumida: number } | null;
}

/**
 * Quanto ainda pode ser aderido, em % do teto agregado do art. 86 (o dobro
 * da quantidade registrada), somando todos os itens. É o "Saldo para
 * adesão" da tabela do site. Nulo quando a ata não tem item com quantidade.
 */
export function percentualSaldo(itens: ItemComSaldo[]): number | null {
  let teto = 0;
  let disponivel = 0;
  for (const item of itens) {
    const limite = limiteAgregado(item.quantidadeRegistrada);
    if (limite <= 0) continue;
    teto += limite;
    disponivel += Math.max(0, limite - (item.saldo?.quantidadeConsumida ?? 0));
  }
  if (teto === 0) return null;
  return Math.round((disponivel / teto) * 100);
}

/** Saldo de um item só, em % do teto agregado. */
export function percentualSaldoItem(item: ItemComSaldo): number | null {
  return percentualSaldo([item]);
}
