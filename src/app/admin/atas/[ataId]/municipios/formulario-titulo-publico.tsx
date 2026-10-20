"use client";

import { useActionState } from "react";
import { definirTituloPublicoAta, type EstadoTituloPublico } from "../../../actions";
import { tituloGenerico, TAMANHO_MAXIMO_TITULO } from "@/lib/site/titulo";

const ESTADO_INICIAL: EstadoTituloPublico = {};

/** Título público da ata: o único nome que visitante e órgão veem no site. */
export function FormularioTituloPublico({
  ataId,
  tituloAtual,
  categoria,
}: {
  ataId: string;
  tituloAtual: string | null;
  categoria: string | null;
}) {
  const [estado, acao, pendente] = useActionState(definirTituloPublicoAta, ESTADO_INICIAL);
  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="ataId" value={ataId} />
      <div className="flex items-center gap-2">
        <input
          name="tituloPublico"
          defaultValue={tituloAtual ?? ""}
          maxLength={TAMANHO_MAXIMO_TITULO}
          placeholder={tituloGenerico(categoria)}
          className="campo-atas flex-1"
        />
        <button type="submit" disabled={pendente} className="botao-atas secundario">
          {pendente ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
        Genérico de propósito (ex.: &quot;Ata de material de limpeza&quot;): o objeto original costuma ser o mesmo
        texto do PNCP. Vazio = o site mostra &quot;{tituloGenerico(categoria)}&quot;.
      </p>
      {estado.erro ? (
        <p className="text-xs" style={{ color: "var(--cor-critico)" }} role="alert">
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso ? (
        <p className="text-xs" style={{ color: "var(--cor-marca-clara)" }} role="status">
          Título salvo.
        </p>
      ) : null}
    </form>
  );
}