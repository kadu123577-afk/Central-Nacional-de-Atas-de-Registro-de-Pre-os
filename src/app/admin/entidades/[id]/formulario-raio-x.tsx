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
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
      <input type="hidden" name="entidadeAlvoId" value={entidadeAlvoId} />
      {estado.erro && (
        <span role="alert" className="max-w-xs text-[12.5px] font-medium" style={{ color: "var(--cor-critico)" }}>
          {estado.erro}
        </span>
      )}
      <button type="submit" disabled={pendente || !temCnpj} className="botao-atas secundario">
        {pendente ? "Consultando o PNCP..." : "Atualizar"}
      </button>
    </form>
  );
}
