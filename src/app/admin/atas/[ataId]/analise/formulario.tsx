"use client";

import { useActionState } from "react";
import { analisarAta, type EstadoAnaliseAta } from "../../../actions";
import { ITENS_CONFORMIDADE, type RespostasConformidade } from "@/lib/conformidade";

interface Props {
  ataId: string;
  respostasAtuais: RespostasConformidade;
  parecerAtual: string;
}

const estadoInicial: EstadoAnaliseAta = {};

export function FormularioAnalise({ ataId, respostasAtuais, parecerAtual }: Props) {
  const acaoComId = analisarAta.bind(null, ataId);
  const [estado, formAction, pendente] = useActionState(acaoComId, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {ITENS_CONFORMIDADE.map((item) => (
          <li key={item.campo}>
            <label className="flex items-start gap-2 text-sm" style={{ color: "var(--cor-texto)" }}>
              <input
                type="checkbox"
                name={item.campo}
                defaultChecked={respostasAtuais[item.campo]}
                className="mt-1"
              />
              {item.rotulo}
            </label>
          </li>
        ))}
      </ul>

      <label className="block text-sm">
        <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
          Parecer (obrigatório para aprovar com itens não confirmados)
        </span>
        <textarea name="parecer" rows={3} defaultValue={parecerAtual} className="campo-atas" />
      </label>

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
      {estado.mensagem && (
        <p className="text-sm" style={{ color: "var(--cor-marca-clara)" }}>
          {estado.mensagem}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" name="decisao" value="salvar" disabled={pendente} className="botao-atas secundario">
          Salvar análise
        </button>
        <button type="submit" name="decisao" value="aprovar" disabled={pendente} className="botao-atas">
          Aprovar ata
        </button>
      </div>
    </form>
  );
}
