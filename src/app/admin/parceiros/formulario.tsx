"use client";

import { useActionState } from "react";
import { criarParceiro, type EstadoParceiro } from "../actions";
import { Secao } from "@/components/ui/secao";
import { CATEGORIAS_ATAS } from "@/lib/categorias";

const estadoInicial: EstadoParceiro = {};

export function FormularioNovoParceiro() {
  const [estado, formAction, pendente] = useActionState(criarParceiro, estadoInicial);

  return (
    <Secao titulo="Novo parceiro">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Nome" name="nome" required />
          <Campo label="Contato (e-mail ou telefone)" name="contato" required />
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium" style={{ color: "var(--cor-texto-2)" }}>
            Categorias de interesse
          </span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CATEGORIAS_ATAS.map((c) => (
              <label key={c.slug} className="flex items-center gap-2 text-sm" style={{ color: "var(--cor-texto)" }}>
                <input type="checkbox" name="categoriasInteresse" value={c.slug} />
                {c.rotuloCurto ?? c.rotulo}
              </label>
            ))}
          </div>
        </div>

        <Campo
          label="UFs de interesse (separadas por vírgula)"
          name="ufsInteresse"
          placeholder="SP, RJ, MG"
        />

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
          {pendente ? "Salvando..." : "Cadastrar parceiro"}
        </button>
      </form>
    </Secao>
  );
}

function Campo({
  label,
  name,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
        {label}
      </span>
      <input name={name} required={required} placeholder={placeholder} className="campo-atas" />
    </label>
  );
}
