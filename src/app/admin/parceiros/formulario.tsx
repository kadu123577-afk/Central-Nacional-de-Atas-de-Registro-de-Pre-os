"use client";

import { useActionState } from "react";
import { criarParceiro, type EstadoParceiro } from "../actions";
import { Secao } from "@/components/ui/secao";
import { Aviso } from "@/components/ui/aviso";
import { CATEGORIAS_ATAS } from "@/lib/categorias";

const estadoInicial: EstadoParceiro = {};

export function FormularioNovoParceiro() {
  const [estado, formAction, pendente] = useActionState(criarParceiro, estadoInicial);

  return (
    <Secao titulo="Novo parceiro">
      <form action={formAction} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Nome" name="nome" required />
          <Campo label="Contato (e-mail ou telefone)" name="contato" required />
        </div>

        <fieldset>
          <legend className="rotulo-campo">Categorias de interesse</legend>
          <div
            className="mt-1 grid grid-cols-1 gap-x-4 gap-y-2 rounded-[var(--raio)] border p-4 sm:grid-cols-2 lg:grid-cols-4"
            style={{ borderColor: "var(--cor-borda)", background: "var(--cor-superficie-2)" }}
          >
            {CATEGORIAS_ATAS.map((c) => (
              <label
                key={c.slug}
                className="flex items-center gap-2 text-[13px]"
                style={{ color: "var(--cor-texto-2)" }}
              >
                <input
                  type="checkbox"
                  name="categoriasInteresse"
                  value={c.slug}
                  className="size-4 shrink-0 accent-[var(--cor-marca)]"
                />
                {c.rotuloCurto ?? c.rotulo}
              </label>
            ))}
          </div>
        </fieldset>

        <Campo
          label="UFs de interesse (separadas por vírgula)"
          name="ufsInteresse"
          placeholder="SP, RJ, MG"
        />

        {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}

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
    <label className="block">
      <span className="rotulo-campo">{label}</span>
      <input name={name} required={required} placeholder={placeholder} className="campo-atas" />
    </label>
  );
}
