"use client";

import { useActionState } from "react";
import { adicionarItemNaAta, type EstadoAdicionarItem } from "../../../actions";
import type { CategoriaAta } from "@/lib/categorias";

const estadoInicial: EstadoAdicionarItem = {};

export function FormularioAdicionarItem({
  ataId,
  categorias,
}: {
  ataId: string;
  categorias: readonly CategoriaAta[];
}) {
  const [estado, formAction, pendente] = useActionState(adicionarItemNaAta, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="ataId" value={ataId} />
      <Campo label="Descrição" name="descricao" required />
      <div className="grid grid-cols-2 gap-4 items-start">
        <label className="block text-sm">
          <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
            Categoria
          </span>
          <select name="categoria" required className="campo-atas" defaultValue="">
            <option value="" disabled>
              Selecione...
            </option>
            {categorias.map((c) => (
              <option key={c.slug} value={c.rotulo}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </label>
        <Campo label="Unidade" name="unidade" required />
      </div>
      <div className="grid grid-cols-2 gap-4 items-start">
        <Campo
          label="Quantidade registrada"
          name="quantidadeRegistrada"
          type="number"
          min="1"
          required
        />
        <Campo
          label="Valor unitário (R$)"
          name="valorUnitario"
          type="number"
          step="0.01"
          min="0"
          required
        />
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

      <button type="submit" disabled={pendente} className="botao-atas secundario self-start">
        {pendente ? "Adicionando..." : "+ Adicionar item"}
      </button>
    </form>
  );
}

function Campo({
  label,
  name,
  type = "text",
  required,
  min,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        min={min}
        step={step}
        className="campo-atas"
      />
    </label>
  );
}
