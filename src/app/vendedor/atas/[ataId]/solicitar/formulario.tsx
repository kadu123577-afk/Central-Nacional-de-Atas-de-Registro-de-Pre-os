"use client";

import { useActionState, useState } from "react";
import { solicitarMunicipios, type EstadoSolicitarMunicipios } from "../../../actions";

export interface MunicipioOpcao {
  id: string;
  nome: string;
  uf: string | null;
  /** "livre" pode ser pedido; os outros aparecem desabilitados. */
  situacao: "livre" | "em_negociacao" | "aguardando";
  detalhe?: string;
}

interface Props {
  ataId: string;
  fortes: MunicipioOpcao[];
  especulativos: MunicipioOpcao[];
}

const estadoInicial: EstadoSolicitarMunicipios = {};

const ROTULO_SITUACAO = {
  livre: "",
  em_negociacao: "em negociação",
  aguardando: "pedido aguardando liberação",
} as const;

export function FormularioSolicitar({ ataId, fortes, especulativos }: Props) {
  const acaoComId = solicitarMunicipios.bind(null, ataId);
  const [estado, formAction, pendente] = useActionState(acaoComId, estadoInicial);
  const [filtro, setFiltro] = useState("");
  const termo = filtro.trim().toLowerCase();
  const passa = (m: MunicipioOpcao) => !termo || `${m.nome} ${m.uf ?? ""}`.toLowerCase().includes(termo);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input
        type="search"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Filtrar por nome ou UF"
        className="campo-atas"
      />

      <div>
        <p className="eyebrow mb-2" style={{ color: "var(--cor-texto-3)" }}>
          Candidatos fortes — já contrataram essa categoria ({fortes.length})
        </p>
        {fortes.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
            Nenhum município levantado contratou essa categoria antes.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {fortes.map((m) => (
              <Opcao key={m.id} m={m} oculto={!passa(m)} />
            ))}
          </ul>
        )}
      </div>

      {especulativos.length > 0 && (
        <details>
          <summary className="eyebrow cursor-pointer" style={{ color: "var(--cor-texto-3)" }}>
            Possíveis oportunidades — não confirmadas ({especulativos.length})
          </summary>
          <p className="my-2 text-xs" style={{ color: "var(--cor-texto-3)" }}>
            Raio-X rodou e não achou contratação dessa categoria — pode ser necessidade nova, ou o classificador não ter
            pego o contrato certo. Peça só se quiser perseguir.
          </p>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {especulativos.map((m) => (
              <Opcao key={m.id} m={m} oculto={!passa(m)} />
            ))}
          </ul>
        </details>
      )}

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

      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Enviando..." : "Pedir liberação ao administrador"}
      </button>
    </form>
  );
}

/** `oculto` só esconde (não desmonta) — marcações feitas antes do filtro continuam valendo no envio. */
function Opcao({ m, oculto }: { m: MunicipioOpcao; oculto: boolean }) {
  const livre = m.situacao === "livre";
  return (
    <li className={oculto ? "hidden" : undefined}>
      <label
        className="flex items-start gap-2 text-sm"
        style={{ color: livre ? "var(--cor-texto)" : "var(--cor-texto-3)" }}
      >
        <input
          type="checkbox"
          name="entidadeAlvoId"
          value={m.id}
          disabled={!livre}
          className="mt-1"
        />
        <span>
          {m.nome}
          {m.uf ? `/${m.uf}` : ""}
          {!livre && ` — ${ROTULO_SITUACAO[m.situacao]}`}
          {livre && m.detalhe ? ` — ${m.detalhe}` : ""}
        </span>
      </label>
    </li>
  );
}
