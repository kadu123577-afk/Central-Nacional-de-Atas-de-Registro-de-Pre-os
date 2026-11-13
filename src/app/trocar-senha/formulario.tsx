"use client";

import { useActionState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { definirSenhaDefinitiva, type EstadoTrocaObrigatoria } from "./actions";

const estadoInicial: EstadoTrocaObrigatoria = {};

export function FormularioTrocaObrigatoria() {
  const [estado, formAction, pendente] = useActionState(definirSenhaDefinitiva, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="block">
        <span className="rotulo-campo">
          Nova senha <small>(mín. 12 caracteres)</small>
        </span>
        <input name="senhaNova" type="password" required autoComplete="new-password" className="campo-atas" />
      </label>
      <label className="block">
        <span className="rotulo-campo">Repita a nova senha</span>
        <input name="confirmacao" type="password" required autoComplete="new-password" className="campo-atas" />
      </label>

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}

      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Salvando..." : "Definir senha e entrar"}
      </button>
    </form>
  );
}
