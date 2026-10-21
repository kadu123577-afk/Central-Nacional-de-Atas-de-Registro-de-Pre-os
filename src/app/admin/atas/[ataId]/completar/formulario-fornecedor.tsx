"use client";

import { useActionState } from "react";
import { completarFornecedorDaAta, type EstadoCompletarAta } from "../../../actions";
import { Aviso } from "@/components/ui/aviso";

const estadoInicial: EstadoCompletarAta = {};

export function FormularioCompletarFornecedor({ ataId }: { ataId: string }) {
  const [estado, formAction, pendente] = useActionState(completarFornecedorDaAta, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="ataId" value={ataId} />
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
        <Campo label="Razão social" name="razaoSocial" required />
        <Campo label="CNPJ" name="cnpj" required />
        <Campo label="E-mail" name="email" type="email" required />
      </div>

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}

      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Salvando..." : "Confirmar fornecedor"}
      </button>
    </form>
  );
}

function Campo({
  label,
  name,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="rotulo-campo">{label}</span>
      <input name={name} type={type} required={required} className="campo-atas" />
    </label>
  );
}
