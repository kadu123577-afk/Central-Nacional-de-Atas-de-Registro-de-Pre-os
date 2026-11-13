import { ESTAGIOS_COM_PRAZO } from "@/lib/negociacao";

/**
 * Reserva da ata durante a negociação (decisão de Carlos, 14/11/2026): qualquer consultor pode
 * pegar e negociar qualquer ata, mas, enquanto um consultor negocia nela, a ata fica SUSPENSA para
 * os outros. Ela volta a ficar disponível quando a negociação termina (adesão fechada ou município
 * recusado) ou quando o prazo vence sem avanço (10 dias úteis, renovado a cada movimento no Kanban).
 *
 * Regras puras, sem banco: quem chama já leu as oportunidades da ata (e já expirou as vencidas).
 */

/** O que a regra precisa saber de cada oportunidade (município em negociação) da ata. */
export interface OportunidadeParaReserva {
  vendedorId?: string;
  estagio?: string;
  expiradaEm?: Date | null;
  prazoEm?: Date | null;
}

export interface ReservaDaAta {
  /** Até quando vale a reserva: o maior prazo entre os municípios do outro consultor. */
  ate: Date;
}

/**
 * A ata está reservada para um OUTRO consultor? Conta a oportunidade de outro consultor que ainda
 * corre: não expirou, está em estágio com prazo (a contatar ou em negociação) e tem prazo ainda por
 * vencer. Oportunidade SEM prazo gravado (registro anterior à regra do prazo) não reserva: como a
 * expiração se baseia no prazo, ela nunca venceria e prenderia a ata para sempre. As oportunidades do
 * próprio consultor nunca o impedem: quem negocia pode pedir mais municípios.
 */
export function reservaDaAta(
  oportunidades: readonly OportunidadeParaReserva[],
  vendedorId: string,
  agora: Date = new Date(),
): ReservaDaAta | null {
  const dosOutros = oportunidades.filter(
    (o) =>
      o.vendedorId !== vendedorId &&
      !o.expiradaEm &&
      (ESTAGIOS_COM_PRAZO as readonly (string | undefined)[]).includes(o.estagio) &&
      o.prazoEm instanceof Date &&
      o.prazoEm.getTime() >= agora.getTime(),
  );
  if (dosOutros.length === 0) return null;
  return { ate: new Date(Math.max(...dosOutros.map((o) => (o.prazoEm as Date).getTime()))) };
}

/** Dia da reserva como a equipe lê (fuso de Brasília). */
export function diaDaReserva(ate: Date): string {
  return ate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** O que o consultor lê quando tenta pedir uma ata reservada por outro. */
export function mensagemDeAtaReservada(reserva: ReservaDaAta): string {
  return `Esta ata está reservada até ${diaDaReserva(reserva.ate)}: outro consultor está negociando nela. Ela volta a ficar disponível quando a negociação terminar ou o prazo vencer sem avanço.`;
}

/** O que a equipe lê no motivo do pedido negado por causa da reserva. */
export function motivoDePedidoNegadoPorReserva(reserva: ReservaDaAta): string {
  return `Ata reservada até ${diaDaReserva(reserva.ate)}: outro consultor está negociando nela. Peça de novo quando ela voltar a ficar disponível.`;
}
