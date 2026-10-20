"use client";

import { useActionState } from "react";
import { criarEntidadeAlvo, type EstadoEntidadeAlvo } from "../actions";
import { Secao } from "@/components/ui/secao";
import { Aviso } from "@/components/ui/aviso";
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
          <label className="block">
            <span className="rotulo-campo">Tipo</span>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="rotulo-campo">
              Esfera <small>(opcional)</small>
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

        {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}

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
    <label className="block">
      <span className="rotulo-campo">{label}</span>
      <input name={name} required={required} placeholder={placeholder} className="campo-atas" />
    </label>
  );
}
