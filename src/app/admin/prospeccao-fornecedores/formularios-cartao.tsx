"use client";

import { useActionState } from "react";
import { atualizarProspeccao, moverEstagioProspeccao, type EstadoProspeccao } from "./actions";
import { Aviso } from "@/components/ui/aviso";
import { LIMITE_OBSERVACOES } from "@/lib/radar-atas-view";

const estadoInicial: EstadoProspeccao = {};

export interface DestinoEstagio {
  valor: string;
  rotulo: string;
}

/** Resposta curta da ação, logo abaixo do botão. */
function Retorno({ estado }: { estado: EstadoProspeccao }) {
  if (estado.erro) return <Aviso tom="critico">{estado.erro}</Aviso>;
  if (estado.ok) {
    return (
      <p role="status" className="text-xs font-semibold" style={{ color: "var(--cor-marca-clara)" }}>
        {estado.aviso ?? "Salvo."}
      </p>
    );
  }
  return null;
}

/** Passa o fornecedor para outro estágio; só oferece os destinos que a regra do funil permite. */
export function FormularioMoverEstagio({ id, destinos }: { id: string; destinos: DestinoEstagio[] }) {
  const [estado, formAction, pendente] = useActionState(moverEstagioProspeccao, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="rotulo-campo">Mover para</span>
        <select name="estagio" required defaultValue="" className="campo-atas">
          <option value="" disabled>
            Escolha o estágio…
          </option>
          {destinos.map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.rotulo}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pendente} className="botao-atas secundario pequeno self-start">
        {pendente ? "Movendo..." : "Mover"}
      </button>
      <Retorno estado={estado} />
    </form>
  );
}

/** Próximo contato e observações do fornecedor (campo vazio apaga o valor). */
export function FormularioAnotacao({
  id,
  proximoContatoEm,
  observacoes,
}: {
  id: string;
  /** AAAA-MM-DD, ou vazio. */
  proximoContatoEm: string;
  observacoes: string;
}) {
  const [estado, formAction, pendente] = useActionState(atualizarProspeccao, estadoInicial);
  // Depois de um erro o React zera o formulário; repõe o que foi digitado.
  const v = estado.valores;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="rotulo-campo">
          Próximo contato <small>(opcional)</small>
        </span>
        <input
          type="date"
          name="proximoContatoEm"
          defaultValue={v?.proximoContatoEm ?? proximoContatoEm}
          className="campo-atas"
        />
      </label>
      <label className="block">
        <span className="rotulo-campo">
          Observações <small>(até {LIMITE_OBSERVACOES} caracteres)</small>
        </span>
        <textarea
          name="observacoes"
          rows={3}
          maxLength={LIMITE_OBSERVACOES}
          defaultValue={v?.observacoes ?? observacoes}
          className="campo-atas"
          placeholder="Ex.: pediu a lista de itens da ata"
        />
      </label>
      <p className="text-[11.5px] leading-snug" style={{ color: "var(--cor-texto-3)" }}>
        Anote só o andamento. Não escreva CPF nem telefone ou e-mail de pessoa.
      </p>
      <button type="submit" disabled={pendente} className="botao-atas pequeno self-start">
        {pendente ? "Salvando..." : "Salvar"}
      </button>
      <Retorno estado={estado} />
    </form>
  );
}
