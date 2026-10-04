/**
 * Negociação de atas (2026-10-04): a ata não some pros outros vendedores;
 * o vendedor pede municípios e o admin libera. Cada município liberado
 * tem prazo de 10 dias — renovado a cada movimento no Kanban; vencido
 * sem avanço, expira e o município volta a ficar livre pra novo pedido.
 */
export const PRAZO_NEGOCIACAO_DIAS = 10;

/** Estágios em que o prazo corre (aderiu/recusado são finais). */
export const ESTAGIOS_COM_PRAZO = ["a_contatar", "em_negociacao"] as const;

export const STATUS_PEDIDO = ["pendente", "aprovado", "negado"] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export function calcularPrazo(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + PRAZO_NEGOCIACAO_DIAS * 24 * 60 * 60 * 1000);
}

/** Estágio final não tem prazo; os demais renovam o prazo ao se mover. */
export function prazoParaEstagio(estagio: string, agora: Date = new Date()): Date | null {
  return (ESTAGIOS_COM_PRAZO as readonly string[]).includes(estagio) ? calcularPrazo(agora) : null;
}
