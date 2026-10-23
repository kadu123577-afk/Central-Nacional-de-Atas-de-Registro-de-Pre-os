"use client";

import { useActionState } from "react";
import { criarFaixa, type EstadoFaixa } from "./actions";
import { Aviso } from "@/components/ui/aviso";
import { LIMITE_DESCRICAO_FAIXA } from "./leitura";

const estadoInicial: EstadoFaixa = {};

/** Cadastro de uma faixa nova. Nasce ativa; o valor inicial não pode repetir o de outra faixa. */
export function FormularioNovaFaixa() {
  const [estado, formAction, pendente] = useActionState(criarFaixa, estadoInicial);
  // Depois de um erro o React zera o formulário; repõe o que foi digitado.
  const v = estado.valores;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="rotulo-campo">Valor total da ata a partir de (R$)</span>
          <input
            name="valorMinimo"
            type="text"
            inputMode="decimal"
            required
            autoComplete="off"
            defaultValue={v?.valorMinimo ?? ""}
            placeholder="Ex.: 100.000,00"
            className="campo-atas"
          />
        </label>
        <label className="block text-sm">
          <span className="rotulo-campo">Percentual (%)</span>
          <input
            name="percentual"
            type="text"
            inputMode="decimal"
            required
            autoComplete="off"
            defaultValue={v?.percentual ?? ""}
            placeholder="Ex.: 5,25"
            className="campo-atas"
          />
        </label>
        <label className="block text-sm">
          <span className="rotulo-campo">
            Descrição <small>(opcional)</small>
          </span>
          <input
            name="descricao"
            type="text"
            maxLength={LIMITE_DESCRICAO_FAIXA}
            autoComplete="off"
            defaultValue={v?.descricao ?? ""}
            className="campo-atas"
          />
        </label>
      </div>

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
      {estado.ok && !estado.erro && <Aviso tom="sucesso">Faixa cadastrada.</Aviso>}

      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Cadastrando..." : "Cadastrar faixa"}
      </button>
    </form>
  );
}
