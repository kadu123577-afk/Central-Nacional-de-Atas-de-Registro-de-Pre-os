import { somarDiasUteis, type Feriados } from "@/lib/dias-uteis";

/**
 * Negociação de atas (2026-10-04): a ata não some pros outros vendedores;
 * o vendedor pede municípios e o admin libera. Cada município liberado
 * tem prazo de 10 dias úteis (desde 2026-11-14; antes eram 10 dias corridos),
 * renovado a cada movimento no Kanban; vencido sem avanço, expira e o
 * município volta a ficar livre pra novo pedido.
 */
export const PRAZO_NEGOCIACAO_DIAS_UTEIS = 10;

/** Estágios em que o prazo corre (aderiu/recusado são finais). */
export const ESTAGIOS_COM_PRAZO = ["a_contatar", "em_negociacao"] as const;

export const STATUS_PEDIDO = ["pendente", "aprovado", "negado"] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

/**
 * Prazo de 10 dias úteis a partir de agora. `feriadosExtras` são os cadastrados pela equipe
 * (src/lib/feriados-db.ts); sem eles valem só fim de semana e feriados nacionais.
 */
export function calcularPrazo(agora: Date = new Date(), feriadosExtras?: Feriados): Date {
  return somarDiasUteis(agora, PRAZO_NEGOCIACAO_DIAS_UTEIS, feriadosExtras);
}

/** Estágio final não tem prazo; os demais renovam o prazo ao se mover. */
export function prazoParaEstagio(estagio: string, agora: Date = new Date(), feriadosExtras?: Feriados): Date | null {
  return (ESTAGIOS_COM_PRAZO as readonly string[]).includes(estagio) ? calcularPrazo(agora, feriadosExtras) : null;
}
