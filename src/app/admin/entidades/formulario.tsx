"use client";

import { useActionState } from "react";
import { criarEntidadeAlvo, type EstadoEntidadeAlvo } from "../actions";
import { Secao } from "@/components/ui/secao";
import { ESFERAS_ORGAO } from "@/lib/esferas";
import { ROTULO_TIPO_ENTIDADE, TIPOS_ENTIDADE_ALVO } from "@/lib/entidades-alvo";

const estadoInicial: EstadoEntidadeAlvo = {};

export function FormularioNovaEntidade() {
  const [estado, formAction, pendente] = useActionState(criarEntidadeAlvo, estadoInicial);

  return (
    <Secao titulo="Nova entidade (prefeitura, secretaria, ministério...)">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Nome" name="nome" required placeholder="Prefeitura de Aquiraz" />
          <label className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
              Tipo
            </span>
            <select name="tipo" required className="campo-atas" defaultValue="">
              <option value="" disabled>
                Selecione...
              </option>
              {TIPOS_ENTIDADE_ALVO.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_ENTIDADE[t]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
              Esfera (opcional)
            </span>
            <select name="esfera" className="campo-atas" defaultValue="">
              <option value="">—</option>
              {ESFERAS_ORGAO.map((e) => (
                <option key={e} value={e}>
                  {e[0].toUpperCase() + e.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <Campo label="UF" name="uf" />
          <Campo label="Município" name="municipio" />
        </div>

        <Campo label="Endereço" name="endereco" />

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
          {pendente ? "Salvando..." : "Cadastrar entidade"}
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
