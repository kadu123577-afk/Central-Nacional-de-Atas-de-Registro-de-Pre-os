"use client";

import { useActionState } from "react";
import { criarSocio, type EstadoSocio } from "./actions";
import { Aviso } from "@/components/ui/aviso";
import { ROTULO_TIPO_SOCIO, TIPOS_SOCIO } from "@/lib/financeiro-scp";
import { LIMITE_NOME_SOCIO } from "./leitura";

const estadoInicial: EstadoSocio = {};

/** Cadastro de um sócio novo (nome e tipo). A participação dele na partilha se define à parte. */
export function FormularioNovoSocio() {
  const [estado, formAction, pendente] = useActionState(criarSocio, estadoInicial);
  // Depois de um erro o React zera o formulário; repõe o que foi digitado.
  const v = estado.valores;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="rotulo-campo">Nome</span>
          <input
            name="nome"
            type="text"
            required
            maxLength={LIMITE_NOME_SOCIO}
            autoComplete="off"
            defaultValue={v?.nome ?? ""}
            className="campo-atas"
          />
        </label>
        <label className="block text-sm">
          <span className="rotulo-campo">Tipo</span>
          <select name="tipo" required defaultValue={v?.tipo ?? "participante"} className="campo-atas">
            {TIPOS_SOCIO.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ROTULO_TIPO_SOCIO[tipo]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
      {estado.ok && !estado.erro && <Aviso tom="sucesso">Sócio cadastrado. Defina a participação dele na divisão da partilha.</Aviso>}

      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Cadastrando..." : "Cadastrar sócio"}
      </button>
    </form>
  );
}
