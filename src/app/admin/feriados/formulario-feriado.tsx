"use client";

import { useActionState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { adicionarFeriado, type EstadoFeriado } from "./actions";

const estadoInicial: EstadoFeriado = {};

export function FormularioFeriado() {
  const [estado, adicionar, enviando] = useActionState(adicionarFeriado, estadoInicial);

  return (
    <form action={adicionar} className="flex flex-col gap-3" key={estado.ok ? "limpo" : "digitando"}>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <label className="block">
          <span className="rotulo-campo">Data</span>
          <input name="data" type="date" required className="campo-atas" />
        </label>
        <label className="block">
          <span className="rotulo-campo">Nome</span>
          <input name="nome" type="text" required minLength={3} maxLength={80} placeholder="Ex.: Aniversário de Goiânia (municipal)" className="campo-atas" />
        </label>
      </div>
      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
      {estado.ok && <Aviso tom="sucesso">Feriado adicionado ao calendário.</Aviso>}
      <button type="submit" disabled={enviando} className="botao-atas self-start">
        {enviando ? "Adicionando..." : "Adicionar feriado"}
      </button>
    </form>
  );
}
