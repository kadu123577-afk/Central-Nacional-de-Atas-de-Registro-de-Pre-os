"use client";

import { useActionState } from "react";
import { atualizarRaioXConsumo, type EstadoRaioXConsumo } from "../../actions";

const estadoInicial: EstadoRaioXConsumo = {};

export function FormularioRaioXConsumo({
  entidadeAlvoId,
  temCnpj,
}: {
  entidadeAlvoId: string;
  temCnpj: boolean;
}) {
  const [estado, formAction, pendente] = useActionState(atualizarRaioXConsumo, estadoInicial);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="entidadeAlvoId" value={entidadeAlvoId} />
      <button type="submit" disabled={pendente || !temCnpj} className="botao-atas secundario">
        {pendente ? "Consultando o PNCP..." : "Atualizar"}
      </button>
      {estado.erro && (
        <span className="text-xs" style={{ color: "var(--cor-critico)" }}>
          {estado.erro}
        </span>
      )}
    </form>
  );
}
