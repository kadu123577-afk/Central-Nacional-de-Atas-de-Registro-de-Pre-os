"use client";

import { useActionState } from "react";
import { analisarAta, type EstadoAnaliseAta } from "../../../actions";
import { ITENS_CONFORMIDADE, type RespostasConformidade } from "@/lib/conformidade";
import { Aviso } from "@/components/ui/aviso";

interface Props {
  ataId: string;
  respostasAtuais: RespostasConformidade;
  parecerAtual: string;
  /** Quem tem "atas.conformidade" marca o checklist e escreve o parecer. */
  podeConferir: boolean;
  /** Motivo de a etapa ainda não abrir (a anterior não foi cumprida), ou null. Desativa os botões. */
  bloqueio?: string | null;
  /** A conformidade já foi concluída e a ata está liberada para a venda. */
  liberada?: boolean;
}

const estadoInicial: EstadoAnaliseAta = {};

export function FormularioAnalise({
  ataId,
  respostasAtuais,
  parecerAtual,
  podeConferir,
  bloqueio = null,
  liberada = false,
}: Props) {
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
                disabled={!podeConferir}
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
          Parecer <small>(obrigatório para concluir com itens não confirmados)</small>
        </span>
        <textarea
          name="parecer"
          rows={3}
          defaultValue={estado.valores?.parecer ?? parecerAtual}
          disabled={!podeConferir}
          className="campo-atas"
        />
      </label>

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
      {estado.mensagem && <Aviso tom="sucesso">{estado.mensagem}</Aviso>}

      <div className="flex flex-wrap gap-2">
        {podeConferir && (
          <button
            type="submit"
            name="decisao"
            value="rascunho"
            disabled={pendente || bloqueio !== null}
            title={bloqueio ?? undefined}
            className="botao-atas secundario"
          >
            {liberada ? "Salvar alterações" : "Salvar rascunho"}
          </button>
        )}
        {podeConferir && !liberada && (
          <button
            type="submit"
            name="decisao"
            value="concluir"
            disabled={pendente || bloqueio !== null}
            title={bloqueio ?? undefined}
            className="botao-atas"
          >
            Concluir e liberar a ata
          </button>
        )}
      </div>
    </form>
  );
}
