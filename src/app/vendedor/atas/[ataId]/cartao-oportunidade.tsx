"use client";

import { useState } from "react";
import { ESTAGIOS_OPORTUNIDADE, ROTULO_ESTAGIO_OPORTUNIDADE } from "@/lib/oportunidades";
import { moverEstagioOportunidade } from "../../actions";

interface Props {
  oportunidadeId: string;
  nomeMunicipio: string;
  uf: string | null;
  estagioAtual: string;
  observacoesAtuais: string | null;
  contatoPrincipal: { nomeContato: string; telefone: string | null } | null;
  sinalDeNecessidade: string | null;
}

/** Card do Kanban — move de estágio direto por aqui, sem precisar abrir
 * outra tela. Observação é opcional, mas fica visível no card depois de
 * salva (contexto rápido pro próximo contato). */
export function CartaoOportunidade({
  oportunidadeId,
  nomeMunicipio,
  uf,
  estagioAtual,
  observacoesAtuais,
  contatoPrincipal,
  sinalDeNecessidade,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const acaoComId = moverEstagioOportunidade.bind(null, oportunidadeId);

  return (
    <li className="painel p-3">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
          {nomeMunicipio}
          {uf ? `/${uf}` : ""}
        </span>
        <span className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
          {aberto ? "−" : "+"}
        </span>
      </button>

      {sinalDeNecessidade && (
        <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
          {sinalDeNecessidade}
        </p>
      )}
      {contatoPrincipal && (
        <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
          Contato: {contatoPrincipal.nomeContato}
          {contatoPrincipal.telefone ? ` · ${contatoPrincipal.telefone}` : ""}
        </p>
      )}
      {observacoesAtuais && !aberto && (
        <p className="mt-2 rounded-[var(--raio)] border px-2 py-1 text-xs" style={{ borderColor: "var(--cor-borda)", color: "var(--cor-texto-2)" }}>
          {observacoesAtuais}
        </p>
      )}

      {aberto && (
        <form action={acaoComId} className="mt-3 flex flex-col gap-2">
          <label className="block text-xs">
            <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
              Estágio
            </span>
            <select name="estagio" defaultValue={estagioAtual} className="campo-atas">
              {ESTAGIOS_OPORTUNIDADE.map((e) => (
                <option key={e} value={e}>
                  {ROTULO_ESTAGIO_OPORTUNIDADE[e]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
              Observação / próximo passo
            </span>
            <textarea
              name="observacoes"
              defaultValue={observacoesAtuais ?? ""}
              rows={2}
              className="campo-atas"
            />
          </label>
          <button type="submit" className="botao-atas secundario">
            Salvar
          </button>
        </form>
      )}
    </li>
  );
}
