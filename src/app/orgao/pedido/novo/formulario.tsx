"use client";

import { useActionState } from "react";
import { solicitarAdesao, type EstadoPedidoAdesao } from "../actions";

const estadoInicial: EstadoPedidoAdesao = {};

export function FormularioPedido({ itemId, unidade }: { itemId: string; unidade: string }) {
  const [estado, formAction, pendente] = useActionState(solicitarAdesao, estadoInicial);

  return (
    <form action={formAction} className="painel flex flex-col gap-4 p-5">
      <input type="hidden" name="itemId" value={itemId} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
          Quantidade solicitada ({unidade})
        </span>
        <input name="quantidadeSolicitada" type="number" min="1" required className="campo-atas" />
      </label>

      {estado.erro && (
        <p
          className="rounded-[var(--raio)] border px-4 py-3 text-sm"
          style={{
            borderColor: "var(--cor-critico)",
            background: "var(--cor-critico-fundo)",
            color: "var(--cor-critico)",
          }}
        >
          {estado.erro}
        </p>
      )}

      <button type="submit" disabled={pendente} className="botao-atas w-full">
        {pendente ? "Enviando..." : "Confirmar pedido de adesão"}
      </button>
    </form>
  );
}
