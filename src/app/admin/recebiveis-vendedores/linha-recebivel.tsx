"use client";

import { useActionState, useState } from "react";
import { Cifra } from "@/components/ui/valores";
import { lancarLiquidacao, type EstadoLancarLiquidacao } from "../actions";

interface Liquidacao {
  id: string;
  valorLiquidado: string;
  numeroNotaFiscal: string | null;
  dataLiquidacao: string;
}

interface Props {
  oportunidadeId: string;
  nomeMunicipio: string;
  uf: string | null;
  ataNumero: string;
  fornecedorRazaoSocial: string;
  vendedorNome: string;
  valorAderido: string;
  percentualComissao: string;
  liquidacoes: Liquidacao[];
}

const estadoInicial: EstadoLancarLiquidacao = {};

/** Linha de uma oportunidade aderida — lançar liquidação de NF é o que
 * transforma "aderiu" em "temos a receber de verdade" (pedido explícito
 * do usuário: o valor a receber é sempre sobre o liquidado, nunca sobre
 * o valor aderido, que é só o teto). */
export function LinhaRecebivel({
  oportunidadeId,
  nomeMunicipio,
  uf,
  ataNumero,
  fornecedorRazaoSocial,
  vendedorNome,
  valorAderido,
  percentualComissao,
  liquidacoes,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const acaoComId = lancarLiquidacao.bind(null, oportunidadeId);
  const [estado, formAction, pendente] = useActionState(acaoComId, estadoInicial);

  const somaLiquidado = liquidacoes.reduce((soma, l) => soma + Number(l.valorLiquidado), 0);
  const percentual = Number(percentualComissao);
  const valorAReceber = somaLiquidado * percentual;

  return (
    <li className="painel p-4">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
            {nomeMunicipio}
            {uf ? `/${uf}` : ""} — Ata {ataNumero}
          </p>
          <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
            {fornecedorRazaoSocial} · vendedor: {vendedorNome}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-right">
          <div>
            <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
              Aderido
            </p>
            <Cifra valor={valorAderido} />
          </div>
          <div>
            <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
              Liquidado
            </p>
            <Cifra valor={somaLiquidado} />
          </div>
          <div>
            <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
              A receber
            </p>
            <p className="font-medium" style={{ color: "var(--cor-marca-clara)" }}>
              <Cifra valor={valorAReceber} />
            </p>
          </div>
          <span className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
            {aberto ? "−" : "+"}
          </span>
        </div>
      </button>

      {aberto && (
        <div className="mt-4 flex flex-col gap-4 border-t pt-4" style={{ borderColor: "var(--cor-borda)" }}>
          <div>
            <p className="eyebrow mb-2" style={{ color: "var(--cor-texto-3)" }}>
              Liquidações lançadas ({liquidacoes.length}) — {(percentual * 100).toFixed(2)}% de comissão
            </p>
            {liquidacoes.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                Nenhuma nota fiscal liquidada ainda pra este município.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {liquidacoes.map((l) => (
                  <li key={l.id} className="text-xs" style={{ color: "var(--cor-texto-2)" }}>
                    <Cifra valor={l.valorLiquidado} />
                    {l.numeroNotaFiscal ? ` · NF ${l.numeroNotaFiscal}` : ""} ·{" "}
                    {new Date(l.dataLiquidacao).toLocaleDateString("pt-BR")}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1 text-xs">
              <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
                Valor liquidado (R$)
              </span>
              <input name="valorLiquidado" type="number" step="0.01" min="0" required className="campo-atas" />
            </label>
            <label className="block flex-1 text-xs">
              <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
                Nº da nota fiscal
              </span>
              <input name="numeroNotaFiscal" className="campo-atas" />
            </label>
            <label className="block flex-1 text-xs">
              <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
                Data da liquidação
              </span>
              <input name="dataLiquidacao" type="date" required className="campo-atas" />
            </label>
            <button type="submit" disabled={pendente} className="botao-atas secundario">
              {pendente ? "Salvando..." : "Lançar"}
            </button>
          </form>
          {estado.erro && (
            <p className="text-xs" style={{ color: "var(--cor-critico)" }}>
              {estado.erro}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
