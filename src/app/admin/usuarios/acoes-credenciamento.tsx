"use client";

import { useActionState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { LIMITE_MOTIVO_SUSPENSAO } from "@/lib/credenciamento-view";
import {
  credenciarConsultor,
  suspenderConsultor,
  type EstadoCredenciamentoAdmin,
} from "./credenciamento-actions";

const estadoInicial: EstadoCredenciamentoAdmin = {};

/** Botão "Credenciar": libera quem já aceitou o compromisso de integridade. */
function FormularioCredenciar({ vendedorId }: { vendedorId: string }) {
  const [estado, formAction, pendente] = useActionState(credenciarConsultor, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="vendedorId" value={vendedorId} />
      <button type="submit" disabled={pendente} className="botao-atas pequeno self-start">
        {pendente ? "Credenciando..." : "Credenciar"}
      </button>
      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
    </form>
  );
}

/** "Suspender" abre o campo do motivo (obrigatório); o consultor vê o motivo na tela dele. */
function FormularioSuspender({ vendedorId }: { vendedorId: string }) {
  const [estado, formAction, pendente] = useActionState(suspenderConsultor, estadoInicial);

  return (
    <details open={Boolean(estado.erro) || undefined}>
      <summary className="botao-atas critico pequeno cursor-pointer list-none">Suspender</summary>
      <form action={formAction} className="mt-2 flex min-w-[260px] flex-col gap-2">
        <input type="hidden" name="vendedorId" value={vendedorId} />
        <label className="block">
          <span className="rotulo-campo">Motivo da suspensão</span>
          <textarea
            name="motivo"
            required
            rows={3}
            maxLength={LIMITE_MOTIVO_SUSPENSAO}
            defaultValue={estado.valores?.motivo ?? ""}
            className="campo-atas"
            placeholder="Ex.: conflito de interesse não declarado"
          />
        </label>
        <p className="text-[11.5px] leading-snug" style={{ color: "var(--cor-texto-3)" }}>
          O consultor vê este motivo na tela dele. Não escreva CPF nem dado de terceiros.
        </p>
        <button type="submit" disabled={pendente} className="botao-atas critico pequeno self-start">
          {pendente ? "Suspendendo..." : "Confirmar suspensão"}
        </button>
        {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
      </form>
    </details>
  );
}

/**
 * Botões do administrador ao lado do status de credenciamento do consultor.
 * Só mostra o que o status atual permite (vem de acoesDisponiveis, na página).
 */
export function AcoesCredenciamento({
  vendedorId,
  podeCredenciar,
  podeSuspender,
}: {
  vendedorId: string;
  podeCredenciar: boolean;
  podeSuspender: boolean;
}) {
  if (!podeCredenciar && !podeSuspender) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {podeCredenciar && <FormularioCredenciar vendedorId={vendedorId} />}
      {podeSuspender && <FormularioSuspender vendedorId={vendedorId} />}
    </div>
  );
}
