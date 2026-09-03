"use client";

import { useActionState } from "react";
import { avancarEstagioAdesao, type EstadoAvancoEstagio } from "../actions";

const estadoInicial: EstadoAvancoEstagio = {};

export function BotaoAvancar({ adesaoId }: { adesaoId: string }) {
  const [estado, formAction, pendente] = useActionState(avancarEstagioAdesao, estadoInicial);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="adesaoId" value={adesaoId} />
      {estado.erro && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{estado.erro}</p>
      )}
      <button
        type="submit"
        disabled={pendente}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pendente ? "Avançando..." : "Avançar para o próximo estágio"}
      </button>
    </form>
  );
}
