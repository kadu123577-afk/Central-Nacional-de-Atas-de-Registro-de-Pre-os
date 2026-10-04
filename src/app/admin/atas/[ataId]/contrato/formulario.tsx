"use client";

import { useActionState } from "react";
import { salvarContratoIntermediacao, type EstadoContratoIntermediacao } from "../../../actions";
import { COMISSAO_MAXIMA_PERCENTUAL, COMISSAO_MINIMA_PERCENTUAL } from "@/lib/comissao";

interface Props {
  ataId: string;
  percentualAtual: string;
  dataAssinaturaAtual: string;
  vigenciaFimAtual: string;
  observacoesAtuais: string;
}

const estadoInicial: EstadoContratoIntermediacao = {};

export function FormularioContrato({
  ataId,
  percentualAtual,
  dataAssinaturaAtual,
  vigenciaFimAtual,
  observacoesAtuais,
}: Props) {
  const acaoComId = salvarContratoIntermediacao.bind(null, ataId);
  const [estado, formAction, pendente] = useActionState(acaoComId, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo
          label={`Comissão (%) — de ${COMISSAO_MINIMA_PERCENTUAL}% a ${COMISSAO_MAXIMA_PERCENTUAL}%`}
          name="percentualComissao"
          defaultValue={percentualAtual}
          inputMode="decimal"
          required
        />
        <Campo label="Data de assinatura" name="dataAssinatura" type="date" defaultValue={dataAssinaturaAtual} required />
        <Campo label="Fim da vigência (opcional)" name="vigenciaFim" type="date" defaultValue={vigenciaFimAtual} />
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
          Observações (exclusividade, condições)
        </span>
        <textarea name="observacoes" rows={2} defaultValue={observacoesAtuais} className="campo-atas" />
      </label>

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
      {estado.sucesso && (
        <p className="text-sm" style={{ color: "var(--cor-marca-clara)" }}>
          Contrato salvo.
        </p>
      )}

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
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
  inputMode?: "decimal";
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        inputMode={inputMode}
        className="campo-atas"
      />
    </label>
  );
}
