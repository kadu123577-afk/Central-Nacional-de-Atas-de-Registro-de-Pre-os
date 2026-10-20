"use client";

import { useActionState, useState } from "react";
import { Aviso } from "@/components/ui/aviso";
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
 * mostra quanto do valor aderido já foi liquidado. Visual do site (out/2026):
 * linha de lista com título em negrito, selo de UF, barra de saldo e o
 * detalhe aberto numa caixa cinza-clara. */
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
    <li>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full flex-wrap items-center justify-between gap-4 text-left"
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[14.5px] font-bold tracking-[-0.01em]" style={{ color: "var(--cor-texto)" }}>
              {nomeMunicipio}
            </span>
            {uf && <span className="selo-uf">{uf}</span>}
            <span className="codigo text-xs" style={{ color: "var(--cor-texto-3)" }}>
              Ata Nº {ataNumero}
            </span>
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
            {fornecedorRazaoSocial} · vendedor: {vendedorNome} · comissão {percentualDeFracao(percentual)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-6 text-right">
          <ValorDaLinha rotulo="Aderido" valor={moedaCurta(aderido)} />
          <ValorDaLinha rotulo="Liquidado" valor={moedaCurta(somaLiquidado)} />
          <ValorDaLinha
            rotulo="Falta receber"
            valor={moedaCurta(resumo.faltaReceber)}
            cor={resumo.faltaReceber > 0 ? "var(--cor-atencao)" : "var(--cor-marca-clara)"}
          />
          <span
            className="grid size-7 place-items-center rounded-full border text-sm font-bold"
            style={{
              borderColor: aberto ? "var(--cor-marca-borda)" : "var(--cor-borda)",
              background: aberto ? "var(--cor-marca-fundo)" : "var(--cor-superficie)",
              color: aberto ? "var(--cor-marca-clara)" : "var(--cor-texto-2)",
            }}
            aria-hidden="true"
          >
            {aberto ? "−" : "+"}
          </span>
        </div>
      </button>

      <div className="barra-saldo mt-3" aria-label={`${pctLiquidado}% do valor aderido já liquidado`}>
        <div style={{ width: `${pctLiquidado}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--cor-texto-3)" }}>
        <span className="numero">{pctLiquidado}% do aderido liquidado</span>
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
        <div
          className="mt-4 flex flex-col gap-5 rounded-[var(--raio-grande)] border p-5"
          style={{ borderColor: "var(--cor-borda)", background: "var(--cor-superficie-2)" }}
        >
          <div>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="eyebrow">Liquidações lançadas ({liquidacoes.length})</p>
              <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                {percentualDeFracao(percentual)} de comissão · devida{" "}
                <b style={{ color: "var(--cor-texto)" }}>
                  <Cifra valor={resumo.devida} />
                </b>{" "}
                · recebida{" "}
                <b style={{ color: "var(--cor-texto)" }}>
                  <Cifra valor={resumo.recebida} />
                </b>
              </p>
            </div>
            {liquidacoes.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--cor-texto-3)" }}>
                Nenhuma nota fiscal liquidada ainda pra este município.
              </p>
            ) : (
              <ul className="lista-linhas">
                {liquidacoes.map((l) => (
                  <LinhaLiquidacao key={l.id} liquidacao={l} percentual={percentual} />
                ))}
              </ul>
            )}
          </div>

          <form
            action={formAction}
            className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-end"
            style={{ borderColor: "var(--cor-borda)" }}
          >
            <label className="block flex-1">
              <span className="rotulo-campo">Tipo</span>
              <select name="tipo" defaultValue="original" className="campo-atas">
                {TIPOS_LIQUIDACAO.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_LIQUIDACAO[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block flex-1">
              <span className="rotulo-campo">Valor liquidado (R$)</span>
              <input name="valorLiquidado" type="number" step="0.01" min="0" required className="campo-atas" />
            </label>
            <label className="block flex-1">
              <span className="rotulo-campo">Nº da nota fiscal</span>
              <input name="numeroNotaFiscal" className="campo-atas" />
            </label>
            <label className="block flex-1">
              <span className="rotulo-campo">Data da liquidação</span>
              <input name="dataLiquidacao" type="date" required className="campo-atas" />
            </label>
            <button type="submit" disabled={pendente} className="botao-atas">
              {pendente ? "Salvando..." : "Lançar"}
            </button>
          </form>
          {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
        </div>
      )}
    </li>
  );
}

/** Um dos três valores à direita da linha: rótulo pequeno em cima, valor em negrito embaixo. */
function ValorDaLinha({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div>
      <p className="text-[11.5px]" style={{ color: "var(--cor-texto-3)" }}>
        {rotulo}
      </p>
      <p className="numero text-[14px] font-bold" style={{ color: cor ?? "var(--cor-texto)" }}>
        {valor}
      </p>
    </div>
  );
}

function LinhaLiquidacao({ liquidacao: l, percentual }: { liquidacao: Liquidacao; percentual: number }) {
  const acaoComId = atualizarCobrancaLiquidacao.bind(null, l.id);
  const [estado, formAction, pendente] = useActionState(acaoComId, estadoCobrancaInicial);
  const tipo = l.tipo as TipoLiquidacao;
  const status = l.statusCobranca as StatusCobranca;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 text-xs" style={{ color: "var(--cor-texto-3)" }}>
      <div className="min-w-0">
        <p>
          <b className="text-[13.5px]" style={{ color: "var(--cor-texto)" }}>
            <Cifra valor={l.valorLiquidado} />
          </b>
          {l.numeroNotaFiscal ? (
            <span className="codigo ml-2" style={{ color: "var(--cor-texto-2)" }}>
              NF {l.numeroNotaFiscal}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5">
          <span className="numero">
            {new Date(l.dataLiquidacao).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
          </span>{" "}
          · {ROTULO_TIPO_LIQUIDACAO[tipo] ?? l.tipo} · comissão{" "}
          <b style={{ color: "var(--cor-texto-2)" }}>
            <Cifra valor={Number(l.valorLiquidado) * percentual} />
          </b>
        </p>
      </div>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <select
          name="statusCobranca"
          defaultValue={status}
          aria-label="Situação da cobrança"
          className="campo-atas"
          style={{ width: "auto" }}
        >
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
          aria-label="NF da comissão"
          className="campo-atas"
          style={{ width: "10rem" }}
        />
        <button type="submit" disabled={pendente} className="botao-atas secundario">
          {pendente ? "..." : "Atualizar cobrança"}
        </button>
        {estado.erro && (
          <Aviso tom="critico" className="basis-full">
            {estado.erro}
          </Aviso>
        )}
      </form>
    </li>
  );
}
