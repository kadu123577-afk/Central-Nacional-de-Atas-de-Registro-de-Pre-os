"use client";

import { useActionState, useState } from "react";
import { Aviso } from "@/components/ui/aviso";
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
    <form action={formAction} className="flex flex-col gap-6">
      <input
        type="search"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Filtrar por nome ou UF"
        aria-label="Filtrar por nome ou UF"
        className="campo-atas"
      />

      <div>
        <p className="eyebrow mb-3">Candidatos fortes — já contrataram essa categoria ({fortes.length})</p>
        {fortes.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--cor-texto-3)" }}>
            Nenhum município levantado contratou essa categoria antes.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {fortes.map((m) => (
              <Opcao key={m.id} m={m} oculto={!passa(m)} />
            ))}
          </ul>
        )}
      </div>

      {especulativos.length > 0 && (
        <details className="rounded-[var(--raio-grande)] border p-4" style={{ borderColor: "var(--cor-borda)" }}>
          <summary className="eyebrow cursor-pointer">
            Possíveis oportunidades — não confirmadas ({especulativos.length})
          </summary>
          <p className="mb-3 mt-2 text-[13px] leading-relaxed" style={{ color: "var(--cor-texto-3)" }}>
            Raio-X rodou e não achou contratação dessa categoria — pode ser necessidade nova, ou o classificador não ter
            pego o contrato certo. Peça só se quiser perseguir.
          </p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {especulativos.map((m) => (
              <Opcao key={m.id} m={m} oculto={!passa(m)} />
            ))}
          </ul>
        </details>
      )}

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}

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
        className={`flex h-full items-start gap-2.5 rounded-[var(--raio)] border px-3 py-2.5 text-[13.5px] transition-colors ${
          livre
            ? "cursor-pointer border-[var(--cor-borda)] bg-[var(--cor-superficie)] hover:border-[var(--cor-marca-borda)] has-[:checked]:border-[var(--cor-marca-borda)] has-[:checked]:bg-[var(--cor-marca-fundo)]"
            : "cursor-not-allowed border-[var(--cor-borda)] bg-[var(--cor-superficie-2)]"
        }`}
        style={{ color: livre ? "var(--cor-texto)" : "var(--cor-texto-3)" }}
      >
        <input
          type="checkbox"
          name="entidadeAlvoId"
          value={m.id}
          disabled={!livre}
          className="mt-0.5 size-4 shrink-0 accent-[var(--cor-marca)]"
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={livre ? "font-semibold" : undefined}>{m.nome}</span>
            {m.uf && <span className="selo-uf">{m.uf}</span>}
          </span>
          {!livre && (
            <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
              {ROTULO_SITUACAO[m.situacao]}
            </span>
          )}
          {livre && m.detalhe && (
            <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
              {m.detalhe}
            </span>
          )}
        </span>
      </label>
    </li>
  );
}
