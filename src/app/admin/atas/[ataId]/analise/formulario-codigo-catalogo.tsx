"use client";

import { useActionState, useId } from "react";
import { definirCodigoCatalogoItem, type EstadoDefinirCodigoCatalogo } from "../../../actions";
import { Aviso } from "@/components/ui/aviso";

const estadoInicial: EstadoDefinirCodigoCatalogo = {};

/**
 * Informa, corrige ou apaga o código do catálogo (CATMAT/CATSER) de um item já
 * cadastrado, na linha do comparativo de preços. Campo em branco apaga o código.
 */
export function FormularioCodigoCatalogo({
  itemId,
  codigoAtual,
  descricao,
}: {
  itemId: string;
  codigoAtual: string | null;
  descricao: string;
}) {
  const [estado, formAction, pendente] = useActionState(definirCodigoCatalogoItem, estadoInicial);
  const campoId = useId();
  // Depois da action o React zera o formulário; repõe o código gravado ou o texto que deu erro.
  const valorDoCampo = estado.valor ?? codigoAtual ?? "";

  return (
    <form action={formAction} className="mt-2.5">
      <input type="hidden" name="itemId" value={itemId} />
      <label htmlFor={campoId} className="mb-1 block text-xs font-semibold" style={{ color: "var(--cor-texto-2)" }}>
        Código do catálogo
      </label>
      <div className="flex items-center gap-2">
        <input
          id={campoId}
          name="codigoCatalogo"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={valorDoCampo}
          placeholder="Sem código"
          aria-label={`Código do catálogo do item: ${descricao}`}
          aria-invalid={estado.erro ? true : undefined}
          className="campo-atas w-36 py-1.5 text-[13px]"
        />
        <button type="submit" disabled={pendente} className="botao-atas pequeno secundario">
          {pendente ? "Salvando..." : "Salvar"}
        </button>
      </div>
      {estado.erro && (
        <Aviso tom="critico" className="mt-2">
          {estado.erro}
        </Aviso>
      )}
      {estado.mensagem && !estado.erro && (
        <Aviso tom="sucesso" className="mt-2">
          {estado.mensagem}
        </Aviso>
      )}
    </form>
  );
}
