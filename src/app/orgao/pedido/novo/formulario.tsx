"use client";

import { useActionState } from "react";
import { solicitarAdesao, type EstadoPedidoAdesao } from "../actions";

const estadoInicial: EstadoPedidoAdesao = {};

export function FormularioPedido({ itemId, unidade }: { itemId: string; unidade: string }) {
  const [estado, formAction, pendente] = useActionState(solicitarAdesao, estadoInicial);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="itemId" value={itemId} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-800">
          Quantidade solicitada ({unidade})
        </span>
        <input
          name="quantidadeSolicitada"
          type="number"
          min="1"
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </label>

      {estado.erro && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{estado.erro}</p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pendente ? "Enviando..." : "Confirmar pedido de adesão"}
      </button>
    </form>
  );
}
