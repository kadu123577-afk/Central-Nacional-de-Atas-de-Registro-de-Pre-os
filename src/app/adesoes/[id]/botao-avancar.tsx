"use client";

import { useActionState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { avancarEstagioAdesao, type EstadoAvancoEstagio } from "../actions";

const estadoInicial: EstadoAvancoEstagio = {};

export function BotaoAvancar({ adesaoId }: { adesaoId: string }) {
  const [estado, formAction, pendente] = useActionState(avancarEstagioAdesao, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="adesaoId" value={adesaoId} />
      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Avançando..." : "Avançar para o próximo estágio"}
      </button>
    </form>
  );
}
