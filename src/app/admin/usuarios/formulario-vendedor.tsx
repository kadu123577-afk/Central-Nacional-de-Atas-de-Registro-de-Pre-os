"use client";

import { useActionState } from "react";
import { criarVendedorAdmin, type EstadoCriarVendedor } from "../actions";
import { Secao } from "@/components/ui/secao";
import { ROTULO_TIPO_VENDEDOR, TIPOS_VENDEDOR } from "@/lib/vendedores";

const estadoInicial: EstadoCriarVendedor = {};

export function FormularioNovoVendedor() {
  const [estado, formAction, pendente] = useActionState(criarVendedorAdmin, estadoInicial);

  return (
    <Secao titulo="Novo vendedor">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Nome" name="nome" required />
          <Campo label="E-mail" name="email" type="email" required />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Senha (mín. 8 caracteres)" name="senha" type="password" required />
          <label className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
              Tipo
            </span>
            <select name="tipo" required className="campo-atas" defaultValue="interno">
              {TIPOS_VENDEDOR.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_VENDEDOR[t]}
                </option>
              ))}
            </select>
          </label>
        </div>

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
          {pendente ? "Salvando..." : "Cadastrar vendedor"}
        </button>
      </form>
    </Secao>
  );
}

function Campo({
  label,
  name,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
        {label}
      </span>
      <input name={name} type={type} required={required} className="campo-atas" />
    </label>
  );
}
