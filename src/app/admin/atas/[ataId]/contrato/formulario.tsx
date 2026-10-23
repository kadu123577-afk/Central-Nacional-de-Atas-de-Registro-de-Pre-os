"use client";

import { useActionState, useRef } from "react";
import { salvarContratoIntermediacao, type EstadoContratoIntermediacao } from "../../../actions";
import { COMISSAO_MAXIMA_PERCENTUAL, COMISSAO_MINIMA_PERCENTUAL } from "@/lib/comissao";
import { Aviso } from "@/components/ui/aviso";
import type { SugestaoContrato } from "./sugestao";
import { SugestaoComissao } from "./sugestao-comissao";

interface Props {
  ataId: string;
  percentualAtual: string;
  dataAssinaturaAtual: string;
  vigenciaFimAtual: string;
  observacoesAtuais: string;
  /** Comissão sugerida para o valor total da ata (só leitura: nunca grava). */
  sugestao: SugestaoContrato;
}

const estadoInicial: EstadoContratoIntermediacao = {};

export function FormularioContrato({
  ataId,
  percentualAtual,
  dataAssinaturaAtual,
  vigenciaFimAtual,
  observacoesAtuais,
  sugestao,
}: Props) {
  const acaoComId = salvarContratoIntermediacao.bind(null, ataId);
  const [estado, formAction, pendente] = useActionState(acaoComId, estadoInicial);
  // Depois de um erro o React zera o formulário; repõe o que foi digitado.
  const v = estado.valores;
  const campoPercentual = useRef<HTMLInputElement>(null);

  // "Usar sugestão" só preenche o campo; o contrato continua sendo gravado só em "Salvar contrato".
  function usarSugestao(percentualCampo: string) {
    const campo = campoPercentual.current;
    if (!campo) return;
    campo.value = percentualCampo;
    campo.focus();
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <SugestaoComissao sugestao={sugestao} aoUsar={usarSugestao} />
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
        <Campo
          label={
            <>
              Comissão (%){" "}
              <small>
                — de {COMISSAO_MINIMA_PERCENTUAL}% a {COMISSAO_MAXIMA_PERCENTUAL}%
              </small>
            </>
          }
          name="percentualComissao"
          defaultValue={v?.percentualComissao ?? percentualAtual}
          inputMode="decimal"
          required
          inputRef={campoPercentual}
        />
        <Campo label="Data de assinatura" name="dataAssinatura" type="date" defaultValue={v?.dataAssinatura ?? dataAssinaturaAtual} required />
        <Campo
          label={
            <>
              Fim da vigência <small>(opcional)</small>
            </>
          }
          name="vigenciaFim"
          type="date"
          defaultValue={v?.vigenciaFim ?? vigenciaFimAtual}
        />
      </div>
      <label className="block text-sm">
        <span className="rotulo-campo">
          Observações <small>(exclusividade, condições)</small>
        </span>
        <textarea name="observacoes" rows={2} defaultValue={v?.observacoes ?? observacoesAtuais} className="campo-atas" />
      </label>

      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
      {estado.sucesso && <Aviso tom="sucesso">Contrato salvo.</Aviso>}

      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Salvando..." : "Salvar contrato"}
      </button>
    </form>
  );
}

function Campo({
  label,
  name,
  required,
  type = "text",
  defaultValue,
  inputMode,
  inputRef,
}: {
  label: React.ReactNode;
  name: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
  inputMode?: "decimal";
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className="block text-sm">
      <span className="rotulo-campo">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        inputMode={inputMode}
        ref={inputRef}
        className="campo-atas"
      />
    </label>
  );
}
