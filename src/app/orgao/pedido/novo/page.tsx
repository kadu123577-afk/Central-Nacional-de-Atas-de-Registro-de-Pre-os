import { redirect } from "next/navigation";

/**
 * Pedido de adesão por item (fluxo antigo, desativado em 2026-10-20). Ele
 * mostrava ao órgão a descrição do item, o limite e o saldo, dados que
 * permitem achar a ata no PNCP e contratar direto, sem a plataforma. Agora o
 * órgão pede a adesão pela página da ata (/catalogo/<id>), sem ver os itens, e a
 * equipe monta o pedido. A ação de criar o pedido continua em ../actions.ts para
 * uso futuro pela equipe.
 */
export default function PedidoPorItemDesativado() {
  redirect("/catalogo");
}