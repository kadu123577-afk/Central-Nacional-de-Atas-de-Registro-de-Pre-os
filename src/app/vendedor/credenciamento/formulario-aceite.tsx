"use client";

import { useActionState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { TEXTO_CONFIRMACAO_ACEITE } from "@/lib/credenciamento";
import { aceitarIntegridade, type EstadoAceiteIntegridade } from "./actions";

const estadoInicial: EstadoAceiteIntegridade = {};

/**
 * Caixa "Li e aceito" e botão de enviar. A versão do texto que a tela mostrou
 * vai junto, para o servidor recusar se o texto mudou no meio do caminho.
 */
export function FormularioAceite({ versao }: { versao: number }) {
  const [estado, formAction, pendente] = useActionState(aceitarIntegridade, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="versao" value={versao} />
      <label
        className="flex cursor-pointer items-start gap-3 rounded-[var(--raio)] border px-4 py-3 text-[14px] transition-colors hover:border-[var(--cor-marca-borda)] has-[:checked]:border-[var(--cor-marca-borda)] has-[:checked]:bg-[var(--cor-marca-fundo)]"
        style={{ borderColor: "var(--cor-borda)", color: "var(--cor-texto)" }}
      >
        <input type="checkbox" name="aceito" required className="mt-0.5 size-4 shrink-0 accent-[var(--cor-marca)]" />
        <span className="font-semibold">{TEXTO_CONFIRMACAO_ACEITE}</span>
      </label>

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}

      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Enviando..." : "Aceitar e solicitar credenciamento"}
      </button>
    </form>
  );
}
