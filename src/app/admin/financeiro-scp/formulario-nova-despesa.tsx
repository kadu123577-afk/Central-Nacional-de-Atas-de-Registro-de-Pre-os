"use client";

import { useActionState } from "react";
import { criarDespesa, type EstadoDespesa } from "./actions";
import { Aviso } from "@/components/ui/aviso";
import { LIMITE_CATEGORIA_DESPESA, LIMITE_DESCRICAO_DESPESA } from "./leitura";

const estadoInicial: EstadoDespesa = {};

/** Um sócio nas opções de "quem pagou". */
export interface OpcaoSocio {
  id: string;
  nome: string;
}

/** Lançamento de uma despesa nova: data, valor em reais, descrição curta, categoria e quem pagou (opcionais). */
export function FormularioNovaDespesa({ socios, hoje }: { socios: OpcaoSocio[]; hoje: string }) {
  const [estado, formAction, pendente] = useActionState(criarDespesa, estadoInicial);
  // Depois de um erro o React zera o formulário; repõe o que foi digitado.
  const v = estado.valores;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="rotulo-campo">Data</span>
          <input
            name="data"
            type="date"
            required
            min="2000-01-01"
            max="2100-12-31"
            defaultValue={v?.data ?? hoje}
            className="campo-atas"
          />
        </label>
        <label className="block text-sm">
          <span className="rotulo-campo">Valor (R$)</span>
          <input
            name="valor"
            type="text"
            inputMode="decimal"
            required
            autoComplete="off"
            defaultValue={v?.valor ?? ""}
            placeholder="Ex.: 1.234,56"
            className="campo-atas"
          />
        </label>
        <label className="block text-sm">
          <span className="rotulo-campo">
            Quem pagou <small>(opcional)</small>
          </span>
          <select name="pagaPorSocioId" defaultValue={v?.pagaPorSocioId ?? ""} className="campo-atas">
            <option value="">—</option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="rotulo-campo">Descrição</span>
          <input
            name="descricao"
            type="text"
            required
            maxLength={LIMITE_DESCRICAO_DESPESA}
            autoComplete="off"
            defaultValue={v?.descricao ?? ""}
            className="campo-atas"
          />
        </label>
        <label className="block text-sm">
          <span className="rotulo-campo">
            Categoria <small>(opcional)</small>
          </span>
          <input
            name="categoria"
            type="text"
            maxLength={LIMITE_CATEGORIA_DESPESA}
            autoComplete="off"
            defaultValue={v?.categoria ?? ""}
            className="campo-atas"
          />
        </label>
      </div>

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
      {estado.ok && !estado.erro && <Aviso tom="sucesso">Despesa lançada.</Aviso>}

      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Lançando..." : "Lançar despesa"}
      </button>
    </form>
  );
}
