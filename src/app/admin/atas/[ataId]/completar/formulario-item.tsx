"use client";

import { useActionState } from "react";
import { adicionarItemNaAta, type EstadoAdicionarItem } from "../../../actions";
import type { CategoriaAta } from "@/lib/categorias";
import { Aviso } from "@/components/ui/aviso";

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
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-[var(--raio-grande)] border p-5"
      style={{ borderColor: "var(--cor-borda)", background: "var(--cor-superficie-2)" }}
    >
      <input type="hidden" name="ataId" value={ataId} />
      <Campo label="Descrição" name="descricao" required />
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="rotulo-campo">Categoria</span>
          <select name="categoria" required className="campo-atas" defaultValue="">
            <option value="" disabled>
              Selecione...
            </option>
            {categorias.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </label>
        <Campo label="Unidade" name="unidade" required />
      </div>
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
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
      <Campo
        label="Código do catálogo (CATMAT/CATSER)"
        name="codigoCatalogo"
        opcional
        inputMode="numeric"
        ajuda="Número do item no catálogo do Compras.gov.br. Com ele a plataforma compara o preço da ata com preços de contratações públicas."
      />

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}

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
  opcional,
  inputMode,
  ajuda,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
  opcional?: boolean;
  inputMode?: "numeric";
  ajuda?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="rotulo-campo">
        {label}
        {opcional && (
          <>
            {" "}
            <small>(opcional)</small>
          </>
        )}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        min={min}
        step={step}
        inputMode={inputMode}
        className="campo-atas"
      />
      {ajuda && (
        <span className="mt-1 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
          {ajuda}
        </span>
      )}
    </label>
  );
}
