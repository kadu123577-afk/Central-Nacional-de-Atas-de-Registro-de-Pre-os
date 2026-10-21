"use client";

import { useActionState } from "react";
import { solicitarAdesao, type EstadoPedidoAdesao } from "../actions";
import { Aviso } from "@/components/ui/aviso";

const estadoInicial: EstadoPedidoAdesao = {};

export function FormularioPedido({ itemId, unidade }: { itemId: string; unidade: string }) {
  const [estado, formAction, pendente] = useActionState(solicitarAdesao, estadoInicial);

  return (
    <form action={formAction} className="painel flex flex-col gap-4 p-6">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="rotulo-campo">
            Quantidade solicitada <small>({unidade})</small>
          </span>
          <input name="quantidadeSolicitada" type="number" min="1" required className="campo-atas" />
        </label>
        <button type="submit" disabled={pendente} className="botao-atas">
          {pendente ? "Enviando..." : "Confirmar pedido de adesão"}
        </button>
      </div>

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
    </form>
  );
}
