"use client";

import { useActionState } from "react";
import { definirParticipacoes, type EstadoDivisao } from "./actions";
import { Aviso } from "@/components/ui/aviso";

const estadoInicial: EstadoDivisao = {};

/** Um sócio no formulário da divisão. */
export interface SocioDaDivisao {
  id: string;
  nome: string;
  /** "Sócio ostensivo" | "Sócio participante". */
  tipoRotulo: string;
  ativo: boolean;
  /** O percentual em vigor hoje, em %, como se digita ("60", "33,33"); vazio se não tem. */
  percentualAtual: string;
}

/**
 * "Nova divisão da partilha": a partir de uma data, um percentual por sócio (em
 * branco = fora da partilha). A soma tem de dar 100%. Quem muda tem a participação
 * anterior encerrada no dia anterior e outra aberta, numa transação; quem não
 * muda continua como está. O servidor confere tudo (soma, datas, sócios).
 */
export function FormularioDivisao({ socios, hoje }: { socios: SocioDaDivisao[]; hoje: string }) {
  const [estado, formAction, pendente] = useActionState(definirParticipacoes, estadoInicial);
  // Depois de um erro o React zera o formulário; repõe o que foi digitado.
  const v = estado.valores;

  if (socios.length === 0) {
    return (
      <Aviso tom="info">
        Cadastre ao menos um sócio ativo para definir a divisão da partilha.
      </Aviso>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <label className="block max-w-xs text-sm">
        <span className="rotulo-campo">A partir de</span>
        <input
          name="vigenteDesde"
          type="date"
          required
          min="2000-01-01"
          max="2100-12-31"
          defaultValue={v?.vigenteDesde ?? hoje}
          className="campo-atas"
        />
      </label>

      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        {socios.map((s) => (
          <label key={s.id} className="block text-sm">
            <input type="hidden" name="socioId" value={s.id} />
            <span className="rotulo-campo">
              {s.nome}{" "}
              <small>
                ({s.tipoRotulo}
                {s.ativo ? "" : ", inativo"})
              </small>
            </span>
            <input
              name="percentual"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Em %, ex.: 33,33 (vazio = fora)"
              aria-label={`Participação de ${s.nome} (%)`}
              defaultValue={v?.percentuais?.[s.id] ?? s.percentualAtual}
              className="campo-atas"
            />
          </label>
        ))}
      </div>

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
      {estado.ok && !estado.erro && (
        <Aviso tom={estado.aviso ? "info" : "sucesso"}>{estado.aviso ?? "Divisão da partilha salva."}</Aviso>
      )}

      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Salvando..." : "Salvar divisão da partilha"}
      </button>
    </form>
  );
}
