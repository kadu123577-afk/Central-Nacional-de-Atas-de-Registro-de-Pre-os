"use client";

import { useActionState } from "react";
import { analisarAta, type EstadoAnaliseAta } from "../../../actions";
import { ITENS_CONFORMIDADE, type RespostasConformidade } from "@/lib/conformidade";
import { Aviso } from "@/components/ui/aviso";

interface Props {
  ataId: string;
  respostasAtuais: RespostasConformidade;
  parecerAtual: string;
}

const estadoInicial: EstadoAnaliseAta = {};

export function FormularioAnalise({ ataId, respostasAtuais, parecerAtual }: Props) {
  const acaoComId = analisarAta.bind(null, ataId);
  const [estado, formAction, pendente] = useActionState(acaoComId, estadoInicial);
  // Depois de um erro o React zera o formulário; repõe o que foi marcado/digitado.
  const respostas = estado.valores?.respostas ?? respostasAtuais;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <ul className="lista-linhas">
        {ITENS_CONFORMIDADE.map((item) => (
          <li key={item.campo}>
            <label
              className="flex cursor-pointer items-start gap-3 text-[14px] leading-relaxed"
              style={{ color: "var(--cor-texto)" }}
            >
              <input
                type="checkbox"
                name={item.campo}
                defaultChecked={respostas[item.campo]}
                className="mt-1 size-4 shrink-0"
                style={{ accentColor: "var(--cor-marca)" }}
              />
              {item.rotulo}
            </label>
          </li>
        ))}
      </ul>

      <label className="block text-sm">
        <span className="rotulo-campo">
          Parecer <small>(obrigatório para aprovar com itens não confirmados)</small>
        </span>
        <textarea name="parecer" rows={3} defaultValue={estado.valores?.parecer ?? parecerAtual} className="campo-atas" />
      </label>

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
      {estado.mensagem && <Aviso tom="sucesso">{estado.mensagem}</Aviso>}

      <div className="flex flex-wrap gap-2">
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
