/**
 * Regras de apresentação da vitrine (saldo e vigência). Funções puras, sem
 * banco, para poder testar. O limite de adesão segue o art. 86 §5º da Lei
 * 14.133/2021, o mesmo de src/lib/saldo.ts: o total de adesões não passa do
 * dobro da quantidade registrada.
 */

import { limiteAgregado } from "@/lib/saldo";

/** Fração (0 a 1) do limite de adesão ainda disponível num item. */
export function saldoDoItem(quantidadeRegistrada: number, quantidadeConsumida: number): number {
  const limite = limiteAgregado(quantidadeRegistrada);
  if (limite <= 0) return 0;
  return Math.max(0, limite - quantidadeConsumida) / limite;
}

/** Média do saldo dos itens (0 a 1); 0 se não houver itens. */
export function saldoMedio(saldos: number[]): number {
  if (saldos.length === 0) return 0;
  return saldos.reduce((soma, s) => soma + s, 0) / saldos.length;
}

export const DIA_MS = 86_400_000;

/** Dias até o fim da vigência (negativo se já venceu). */
export function diasAte(fim: Date, agora: Date = new Date()): number {
  return Math.ceil((fim.getTime() - agora.getTime()) / DIA_MS);
}

export interface ExibicaoVigencia {
  /** "" (normal), "atencao" ou "alerta" — a cor do selo. */
  tom: "" | "atencao" | "alerta" | "critico";
  linha1: string;
  linha2?: string;
}

/**
 * Vigência para o visitante: só uma faixa ("mais de 6 meses"), nunca a data
 * exata, que ajudaria a localizar a ata em outras fontes.
 */
export function vigenciaPublica(dias: number): ExibicaoVigencia {
  if (dias <= 30) return { tom: "atencao", linha1: "menos de 30 dias" };
  if (dias <= 90) return { tom: "", linha1: "até 3 meses" };
  if (dias <= 180) return { tom: "", linha1: "3 a 6 meses" };
  return { tom: "", linha1: "mais de 6 meses" };
}

/** Vigência completa (equipe interna): data de fim e dias restantes. */
export function vigenciaCompleta(fim: Date, dias: number, formatarData: (d: Date) => string): ExibicaoVigencia {
  const plural = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;
  if (dias < 0) return { tom: "critico", linha1: `vencida em ${formatarData(fim)}` };
  if (dias === 0) return { tom: "alerta", linha1: "último dia de vigência" };
  const tom = dias <= 3 ? "alerta" : dias <= 30 ? "atencao" : "";
  return {
    tom,
    linha1: `até ${formatarData(fim)}`,
    linha2: `${dias <= 30 ? "faltam " : ""}${plural(dias)}`,
  };
}

/**
 * Código público de uma ata: curto e estável, derivado do id interno. O
 * número real da ata não aparece para o visitante (junto com a UF e o objeto
 * ele permitiria achar a ata no PNCP e o fornecedor).
 */
export function codigoPublico(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(-6);
}
