"use client";

import { useState } from "react";
import { ESTAGIOS_OPORTUNIDADE, ROTULO_ESTAGIO_OPORTUNIDADE } from "@/lib/oportunidades";
import { ROTULO_CATEGORIA_CONSUMO } from "@/lib/classificador-objeto";
import { moverEstagioOportunidade } from "../../actions";

interface Contato {
  cargo: string;
  nomeContato: string;
  telefone: string | null;
  email: string | null;
}

interface Necessidade {
  categoria: string;
  ultimaContratacao: Date;
}

interface Props {
  oportunidadeId: string;
  nomeMunicipio: string;
  uf: string | null;
  estagioAtual: string;
  observacoesAtuais: string | null;
  contatos: Contato[];
  necessidades: Necessidade[];
}

/** Card do Kanban — move de estágio direto por aqui. Expandido, mostra
 * tudo que o levantamento de campo trouxe sobre o município (prefeito,
 * secretários, telefone, e-mail) e o raio-X completo de necessidades
 * (não só a categoria desta ata) — é o material de apoio pra ligação,
 * não só um lugar de trocar status. */
export function CartaoOportunidade({
  oportunidadeId,
  nomeMunicipio,
  uf,
  estagioAtual,
  observacoesAtuais,
  contatos,
  necessidades,
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

      {!aberto && contatos[0] && (
        <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
          {contatos[0].cargo}: {contatos[0].nomeContato}
          {contatos[0].telefone ? ` · ${contatos[0].telefone}` : ""}
        </p>
      )}
      {!aberto && observacoesAtuais && (
        <p
          className="mt-2 rounded-[var(--raio)] border px-2 py-1 text-xs"
          style={{ borderColor: "var(--cor-borda)", color: "var(--cor-texto-2)" }}
        >
          {observacoesAtuais}
        </p>
      )}

      {aberto && (
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <p className="eyebrow mb-1" style={{ color: "var(--cor-texto-3)" }}>
              Contatos
            </p>
            {contatos.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                Nenhum contato levantado ainda pra este município.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {contatos.map((c, i) => (
                  <li key={i} className="text-xs" style={{ color: "var(--cor-texto-2)" }}>
                    <span className="font-medium" style={{ color: "var(--cor-texto)" }}>
                      {c.cargo}
                    </span>
                    {" — "}
                    {c.nomeContato}
                    {c.telefone ? ` · ${c.telefone}` : ""}
                    {c.email ? ` · ${c.email}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="eyebrow mb-1" style={{ color: "var(--cor-texto-3)" }}>
              Necessidades identificadas (raio-X)
            </p>
            {necessidades.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                Raio-X não identificou nenhuma categoria de consumo pra este município.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {necessidades.map((n) => (
                  <li key={n.categoria} className="text-xs" style={{ color: "var(--cor-texto-2)" }}>
                    {ROTULO_CATEGORIA_CONSUMO[n.categoria] ?? n.categoria} — última contratação:{" "}
                    {n.ultimaContratacao.toLocaleDateString("pt-BR")}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form action={acaoComId} className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--cor-borda)" }}>
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
        </div>
      )}
    </li>
  );
}
