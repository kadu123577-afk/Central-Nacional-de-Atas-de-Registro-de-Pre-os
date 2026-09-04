"use client";

import { useActionState } from "react";
import { avancarEstagioAdesao, type EstadoAvancoEstagio } from "../actions";

const estadoInicial: EstadoAvancoEstagio = {};

export function BotaoAvancar({ adesaoId }: { adesaoId: string }) {
  const [estado, formAction, pendente] = useActionState(avancarEstagioAdesao, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="adesaoId" value={adesaoId} />
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
      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Avançando..." : "Avançar para o próximo estágio"}
      </button>
    </form>
  );
}
