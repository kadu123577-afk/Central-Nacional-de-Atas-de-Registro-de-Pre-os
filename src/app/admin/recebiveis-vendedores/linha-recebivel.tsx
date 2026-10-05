"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Cifra } from "@/components/ui/valores";
import { moedaCurta, percentualDeFracao } from "@/lib/formato";
import {
  ROTULO_STATUS_COBRANCA,
  ROTULO_TIPO_LIQUIDACAO,
  STATUS_COBRANCA,
  TIPOS_LIQUIDACAO,
  resumirComissao,
  type StatusCobranca,
  type TipoLiquidacao,
} from "@/lib/recebiveis";
import {
  atualizarCobrancaLiquidacao,
  lancarLiquidacao,
  type EstadoCobrancaLiquidacao,
  type EstadoLancarLiquidacao,
} from "../actions";

interface Liquidacao {
  id: string;
  valorLiquidado: string;
  numeroNotaFiscal: string | null;
  dataLiquidacao: string;
  tipo: string;
  statusCobranca: string;
  notaFiscalComissao: string | null;
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
const estadoCobrancaInicial: EstadoCobrancaLiquidacao = {};

/** Linha de uma oportunidade aderida (fase 2 de design, 2026-10-05) — lançar
 * liquidação de NF é o que transforma "aderiu" em "temos a receber de
 * verdade" (pedido explícito do usuário: o valor a receber é sempre sobre o
 * liquidado, nunca sobre o valor aderido, que é só o teto). A comissão vale
 * igual para o fornecimento original, aditivos e renovações (cascata, SCP
 * cl. 4) e é cobrada por liquidação: a cobrar → cobrada → recebida. A barra
 * mostra quanto do valor aderido já foi liquidado. */
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

  const aderido = Number(valorAderido);
  const somaLiquidado = liquidacoes.reduce((soma, l) => soma + Number(l.valorLiquidado), 0);
  const percentual = Number(percentualComissao);
  const resumo = resumirComissao(
    liquidacoes.map((l) => ({ valorLiquidado: Number(l.valorLiquidado), statusCobranca: l.statusCobranca })),
    percentual,
  );
  const pctLiquidado = aderido > 0 ? Math.min(100, Math.round((somaLiquidado / aderido) * 100)) : 0;
  const contagem = (status: StatusCobranca) => liquidacoes.filter((l) => l.statusCobranca === status).length;

  return (
    <li className="painel p-4">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
            {nomeMunicipio}
            {uf ? ` / ${uf}` : ""} — Ata {ataNumero}
          </p>
          <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
            {fornecedorRazaoSocial} · vendedor: {vendedorNome} · comissão {percentualDeFracao(percentual)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-5 text-right">
          <div>
            <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
              Aderido
            </p>
            <p className="numero text-sm" style={{ color: "var(--cor-texto)" }}>
              {moedaCurta(aderido)}
            </p>
          </div>
          <div>
            <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
              Liquidado
            </p>
            <p className="numero text-sm" style={{ color: "var(--cor-texto)" }}>
              {moedaCurta(somaLiquidado)}
            </p>
          </div>
          <div>
            <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
              Falta receber
            </p>
            <p className="numero text-sm font-medium" style={{ color: resumo.faltaReceber > 0 ? "var(--cor-atencao)" : "var(--cor-marca-clara)" }}>
              {moedaCurta(resumo.faltaReceber)}
            </p>
          </div>
          <span className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
            {aberto ? "−" : "+"}
          </span>
        </div>
      </button>

      <div className="kb-progresso" aria-label={`${pctLiquidado}% do valor aderido já liquidado`}>
        <div style={{ width: `${pctLiquidado}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--cor-texto-3)" }}>
        <span>{pctLiquidado}% do aderido liquidado</span>
        {liquidacoes.length === 0 ? (
          <Badge tom="atencao">Aguardando 1ª nota fiscal</Badge>
        ) : (
          <>
            {contagem("pendente") > 0 && <Badge tom="atencao">{contagem("pendente")} a cobrar</Badge>}
            {contagem("cobrada") > 0 && <Badge tom="neutro">{contagem("cobrada")} cobrada(s)</Badge>}
            {contagem("recebida") > 0 && <Badge tom="marca">{contagem("recebida")} recebida(s)</Badge>}
          </>
        )}
      </div>

      {aberto && (
        <div className="mt-4 flex flex-col gap-4 border-t pt-4" style={{ borderColor: "var(--cor-borda)" }}>
          <div>
            <p className="eyebrow mb-2" style={{ color: "var(--cor-texto-3)" }}>
              Liquidações lançadas ({liquidacoes.length}) — {percentualDeFracao(percentual)} de comissão · devida{" "}
              <Cifra valor={resumo.devida} /> · recebida <Cifra valor={resumo.recebida} />
            </p>
            {liquidacoes.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                Nenhuma nota fiscal liquidada ainda pra este município.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {liquidacoes.map((l) => (
                  <LinhaLiquidacao key={l.id} liquidacao={l} percentual={percentual} />
                ))}
              </ul>
            )}
          </div>

          <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1 text-xs">
              <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
                Tipo
              </span>
              <select name="tipo" defaultValue="original" className="campo-atas">
                {TIPOS_LIQUIDACAO.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_LIQUIDACAO[t]}
                  </option>
                ))}
              </select>
            </label>
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

function LinhaLiquidacao({ liquidacao: l, percentual }: { liquidacao: Liquidacao; percentual: number }) {
  const acaoComId = atualizarCobrancaLiquidacao.bind(null, l.id);
  const [estado, formAction, pendente] = useActionState(acaoComId, estadoCobrancaInicial);
  const tipo = l.tipo as TipoLiquidacao;
  const status = l.statusCobranca as StatusCobranca;

  return (
    <li className="text-xs" style={{ color: "var(--cor-texto-2)" }}>
      <p>
        <Cifra valor={l.valorLiquidado} />
        {l.numeroNotaFiscal ? ` · NF ${l.numeroNotaFiscal}` : ""} ·{" "}
        {new Date(l.dataLiquidacao).toLocaleDateString("pt-BR", { timeZone: "UTC" })} ·{" "}
        {ROTULO_TIPO_LIQUIDACAO[tipo] ?? l.tipo} · comissão <Cifra valor={Number(l.valorLiquidado) * percentual} />
      </p>
      <form action={formAction} className="mt-1 flex flex-wrap items-center gap-2">
        <select name="statusCobranca" defaultValue={status} className="campo-atas" style={{ width: "auto" }}>
          {STATUS_COBRANCA.map((s) => (
            <option key={s} value={s}>
              {ROTULO_STATUS_COBRANCA[s]}
            </option>
          ))}
        </select>
        <input
          name="notaFiscalComissao"
          defaultValue={l.notaFiscalComissao ?? ""}
          placeholder="NF da comissão"
          className="campo-atas"
          style={{ width: "10rem" }}
        />
        <button type="submit" disabled={pendente} className="botao-atas secundario">
          {pendente ? "..." : "Atualizar cobrança"}
        </button>
        {estado.erro && <span style={{ color: "var(--cor-critico)" }}>{estado.erro}</span>}
      </form>
    </li>
  );
}
