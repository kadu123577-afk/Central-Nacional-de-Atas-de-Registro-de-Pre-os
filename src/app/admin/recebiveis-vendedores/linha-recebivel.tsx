"use client";

import { useActionState, useState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { Badge, type Tom } from "@/components/ui/badge";
import { Cifra } from "@/components/ui/valores";
import { dataCurtaUtc, moedaCurta, percentualDeFracao } from "@/lib/formato";
import {
  ROTULO_SITUACAO_COBRANCA,
  ROTULO_STATUS_COBRANCA,
  ROTULO_TIPO_LIQUIDACAO,
  STATUS_COBRANCA,
  TIPOS_LIQUIDACAO,
  contarPorSituacao,
  resumirComissao,
  situacaoDaLiquidacao,
  type SituacaoCobranca,
  type StatusCobranca,
  type TipoLiquidacao,
} from "@/lib/recebiveis";
import {
  atualizarCobrancaLiquidacao,
  informarPagamentoEnteLiquidacao,
  lancarLiquidacao,
  type EstadoCobrancaLiquidacao,
  type EstadoLancarLiquidacao,
  type EstadoPagamentoEnteLiquidacao,
} from "../actions";

interface Liquidacao {
  id: string;
  valorLiquidado: string;
  numeroNotaFiscal: string | null;
  dataLiquidacao: string;
  tipo: string;
  statusCobranca: string;
  notaFiscalComissao: string | null;
  /** Data em que o ente pagou o fornecedor (ISO, meia-noite UTC); null = ainda não informada. */
  dataPagamentoEnte: string | null;
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
const estadoPagamentoEnteInicial: EstadoPagamentoEnteLiquidacao = {};

/** Mesma escala de tons do Badge: o que pede ação do gestor sai em "atenção". */
const TOM_DA_SITUACAO: Record<SituacaoCobranca, Tom> = {
  aguardando_pagamento_ente: "atencao",
  a_cobrar: "atencao",
  cobrada: "neutro",
  recebida: "marca",
};

/** Linha de uma oportunidade aderida (fase 2 de design, 2026-10-05) — lançar
 * liquidação de NF é o que transforma "aderiu" em "temos a receber de
 * verdade" (pedido explícito do usuário: o valor a receber é sempre sobre o
 * liquidado, nunca sobre o valor aderido, que é só o teto). A comissão vale
 * igual para o fornecimento original, aditivos e renovações (cascata, SCP
 * cl. 4) e é cobrada por liquidação: a cobrar → cobrada → recebida. A barra
 * mostra quanto do valor aderido já foi liquidado. Visual do site (out/2026):
 * linha de lista com título em negrito, selo de UF, barra de saldo e o
 * detalhe aberto numa caixa cinza-clara.
 *
 * Projeto RNA (2026-10-21): a comissão só vence depois que o ente liquidou E
 * pagou o fornecedor. Liquidação sem a data de pagamento do ente fica
 * "Aguardando pagamento do ente" e não vira "a cobrar" até o gestor informá-la. */
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
    liquidacoes.map((l) => ({
      valorLiquidado: Number(l.valorLiquidado),
      statusCobranca: l.statusCobranca,
      dataPagamentoEnte: l.dataPagamentoEnte,
    })),
    percentual,
  );
  const pctLiquidado = aderido > 0 ? Math.min(100, Math.round((somaLiquidado / aderido) * 100)) : 0;
  const situacoes = contarPorSituacao(liquidacoes);

  return (
    <li>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-[var(--raio)] text-left"
      >
        {/* Dentro de <button> só cabe conteúdo em linha: spans, não div/p. */}
        <span className="block min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="titulo-linha text-[14.5px]">{nomeMunicipio}</span>
            {uf && <span className="selo-uf">{uf}</span>}
            <span className="codigo text-xs" style={{ color: "var(--cor-texto-3)" }}>
              Ata Nº {ataNumero}
            </span>
          </span>
          <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
            {fornecedorRazaoSocial} · vendedor: {vendedorNome} · comissão {percentualDeFracao(percentual)}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-6 gap-y-2 text-right">
          <ValorDaLinha rotulo="Aderido" valor={moedaCurta(aderido)} />
          <ValorDaLinha rotulo="Liquidado" valor={moedaCurta(somaLiquidado)} />
          <ValorDaLinha
            rotulo="Falta receber"
            valor={moedaCurta(resumo.faltaReceber)}
            cor={resumo.faltaReceber > 0 ? "var(--cor-atencao)" : "var(--cor-marca-clara)"}
          />
          <span
            className="grid size-7 shrink-0 place-items-center rounded-full border text-sm font-bold"
            style={{
              borderColor: aberto ? "var(--cor-marca-borda)" : "var(--cor-borda)",
              background: aberto ? "var(--cor-marca-fundo)" : "var(--cor-superficie)",
              color: aberto ? "var(--cor-marca-clara)" : "var(--cor-texto-2)",
            }}
            aria-hidden="true"
          >
            {aberto ? "−" : "+"}
          </span>
        </span>
      </button>

      <div className="barra-saldo mt-3" aria-hidden="true">
        <div style={{ width: `${pctLiquidado}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--cor-texto-3)" }}>
        <span className="numero">{pctLiquidado}% do aderido liquidado</span>
        {liquidacoes.length === 0 ? (
          <Badge tom="atencao">Aguardando 1ª nota fiscal</Badge>
        ) : (
          <>
            {situacoes.a_cobrar > 0 && <Badge tom="atencao">{situacoes.a_cobrar} a cobrar</Badge>}
            {situacoes.aguardando_pagamento_ente > 0 && (
              <Badge tom="atencao">{situacoes.aguardando_pagamento_ente} aguardando pagamento do ente</Badge>
            )}
            {situacoes.cobrada > 0 && (
              <Badge tom="neutro">
                {situacoes.cobrada} {situacoes.cobrada === 1 ? "cobrada" : "cobradas"}
              </Badge>
            )}
            {situacoes.recebida > 0 && (
              <Badge tom="marca">
                {situacoes.recebida} {situacoes.recebida === 1 ? "recebida" : "recebidas"}
              </Badge>
            )}
          </>
        )}
      </div>

      {aberto && (
        <div
          className="mt-4 flex flex-col gap-5 rounded-[var(--raio-grande)] border p-5"
          style={{ borderColor: "var(--cor-borda)", background: "var(--cor-superficie-2)" }}
        >
          <div>
            <p className="eyebrow">Liquidações lançadas ({liquidacoes.length})</p>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--cor-texto-3)" }}>
              Liquidação é o momento em que o ente reconhece a nota fiscal do fornecedor; o pagamento vem
              depois. A comissão de {percentualDeFracao(percentual)} sobre cada nota segue este caminho: o ente
              liquida, o ente paga o fornecedor, a comissão é cobrada do fornecedor e, por fim, recebida.
            </p>
            <div className="mb-4 mt-3 flex flex-wrap gap-x-8 gap-y-3">
              <ValorDaLinha rotulo="Comissão devida" valor={<Cifra valor={resumo.devida} />} />
              <ValorDaLinha rotulo="A cobrar" valor={<Cifra valor={resumo.aCobrar ?? 0} />} />
              <ValorDaLinha
                rotulo="Aguardando pagamento do ente"
                valor={<Cifra valor={resumo.aguardandoPagamentoEnte ?? 0} />}
              />
              <ValorDaLinha rotulo="Recebida" valor={<Cifra valor={resumo.recebida} />} />
            </div>
            {liquidacoes.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--cor-texto-3)" }}>
                Nenhuma nota fiscal liquidada ainda para este município. Lance a primeira liquidação no
                formulário abaixo.
              </p>
            ) : (
              <ul className="lista-linhas">
                {liquidacoes.map((l) => (
                  <LinhaLiquidacao key={l.id} liquidacao={l} percentual={percentual} />
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t pt-5" style={{ borderColor: "var(--cor-borda)" }}>
            <p className="eyebrow">Lançar nova liquidação</p>
            <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="block flex-1 sm:min-w-[11rem]">
                <span className="rotulo-campo">Tipo</span>
                <select name="tipo" defaultValue="original" className="campo-atas">
                  {TIPOS_LIQUIDACAO.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_TIPO_LIQUIDACAO[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block flex-1 sm:min-w-[11rem]">
                <span className="rotulo-campo">Valor liquidado (R$)</span>
                <input name="valorLiquidado" type="number" step="0.01" min="0" required className="campo-atas" />
              </label>
              <label className="block flex-1 sm:min-w-[11rem]">
                <span className="rotulo-campo">Nº da nota fiscal</span>
                <input name="numeroNotaFiscal" className="campo-atas" />
              </label>
              <label className="block flex-1 sm:min-w-[11rem]">
                <span className="rotulo-campo">Data da liquidação</span>
                <input name="dataLiquidacao" type="date" required className="campo-atas" />
              </label>
              <label className="block flex-1 sm:min-w-[13rem]">
                <span className="rotulo-campo">
                  Data em que o ente pagou o fornecedor <small>(opcional)</small>
                </span>
                <input name="dataPagamentoEnte" type="date" className="campo-atas" />
              </label>
              <button type="submit" disabled={pendente} className="botao-atas">
                {pendente ? "Salvando..." : "Lançar liquidação"}
              </button>
            </form>
            {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
            <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
              Sem a data do pagamento do ente, a liquidação fica em “Aguardando pagamento do ente” e a comissão
              só pode ser cobrada depois que a data for informada.
            </p>
          </div>
        </div>
      )}
    </li>
  );
}

/** Um valor com rótulo pequeno em cima e número em negrito embaixo (spans: também vive dentro de <button>). */
function ValorDaLinha({ rotulo, valor, cor }: { rotulo: string; valor: React.ReactNode; cor?: string }) {
  return (
    <span className="block">
      <span className="block text-[11.5px]" style={{ color: "var(--cor-texto-3)" }}>
        {rotulo}
      </span>
      <span className="numero block text-[14px] font-bold" style={{ color: cor ?? "var(--cor-texto)" }}>
        {valor}
      </span>
    </span>
  );
}

function LinhaLiquidacao({ liquidacao: l, percentual }: { liquidacao: Liquidacao; percentual: number }) {
  const acaoComId = atualizarCobrancaLiquidacao.bind(null, l.id);
  const [estado, formAction, pendente] = useActionState(acaoComId, estadoCobrancaInicial);
  const tipo = l.tipo as TipoLiquidacao;
  const status = l.statusCobranca as StatusCobranca;
  const situacao = situacaoDaLiquidacao(l);
  // "Pendente" é o mesmo status gravado, mas só é "A cobrar" com o ente já tendo pago.
  const rotuloPendente =
    ROTULO_SITUACAO_COBRANCA[
      situacaoDaLiquidacao({ statusCobranca: "pendente", dataPagamentoEnte: l.dataPagamentoEnte })
    ];

  return (
    <li className="flex flex-col gap-3 text-xs" style={{ color: "var(--cor-texto-3)" }}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="text-[13.5px]" style={{ color: "var(--cor-texto)" }}>
            <Cifra valor={l.valorLiquidado} />
          </b>
          {l.numeroNotaFiscal ? (
            <span className="codigo" style={{ color: "var(--cor-texto-2)" }}>
              NF {l.numeroNotaFiscal}
            </span>
          ) : null}
          <Badge tom={TOM_DA_SITUACAO[situacao]}>{ROTULO_SITUACAO_COBRANCA[situacao]}</Badge>
        </p>
        <p className="mt-0.5">
          <span className="numero">{dataCurtaUtc(l.dataLiquidacao)}</span> ·{" "}
          {ROTULO_TIPO_LIQUIDACAO[tipo] ?? l.tipo} · comissão{" "}
          <b style={{ color: "var(--cor-texto-2)" }}>
            <Cifra valor={Number(l.valorLiquidado) * percentual} />
          </b>
        </p>
      </div>

      {/* Primeiro o pagamento do ente (é ele que libera a cobrança), depois a cobrança. */}
      <PagamentoDoEnte
        liquidacaoId={l.id}
        dataPagamentoEnte={l.dataPagamentoEnte}
        bloqueiaCobranca={situacao === "aguardando_pagamento_ente"}
      />

      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="rotulo-campo">Situação da cobrança</span>
          <select name="statusCobranca" defaultValue={status} className="campo-atas w-auto">
            {STATUS_COBRANCA.map((s) => (
              <option key={s} value={s}>
                {s === "pendente" ? rotuloPendente : ROTULO_STATUS_COBRANCA[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo-campo">
            NF da comissão <small>(emitida ao fornecedor)</small>
          </span>
          <input
            name="notaFiscalComissao"
            defaultValue={l.notaFiscalComissao ?? ""}
            className="campo-atas w-52"
          />
        </label>
        <button type="submit" disabled={pendente} className="botao-atas secundario">
          {pendente ? "Salvando..." : "Atualizar cobrança"}
        </button>
      </form>
      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
    </li>
  );
}

/**
 * Data em que o ente pagou o fornecedor. Sem ela, a comissão não pode ser
 * cobrada: o formulário fica à vista. Com ela, mostra o dia e deixa a
 * correção recolhida (liquidações antigas também entram por aqui).
 */
function PagamentoDoEnte({
  liquidacaoId,
  dataPagamentoEnte,
  bloqueiaCobranca,
}: {
  liquidacaoId: string;
  dataPagamentoEnte: string | null;
  /** Ainda pendente e sem data: a cobrança está travada até a data ser informada. */
  bloqueiaCobranca: boolean;
}) {
  const acaoComId = informarPagamentoEnteLiquidacao.bind(null, liquidacaoId);
  const [estado, formAction, pendente] = useActionState(acaoComId, estadoPagamentoEnteInicial);

  const formulario = (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="rotulo-campo">Data em que o ente pagou o fornecedor</span>
        <input
          name="dataPagamentoEnte"
          type="date"
          required
          defaultValue={dataPagamentoEnte ? dataPagamentoEnte.slice(0, 10) : ""}
          className="campo-atas w-auto"
        />
      </label>
      <button type="submit" disabled={pendente} className="botao-atas secundario">
        {pendente ? "Salvando..." : dataPagamentoEnte ? "Corrigir data" : "Informar data"}
      </button>
    </form>
  );

  return (
    <div>
      {dataPagamentoEnte ? (
        // Abre sozinho se a correção foi recusada, para o erro aparecer junto do campo.
        <details open={estado.erro ? true : undefined}>
          <summary className="cursor-pointer">
            Ente pagou o fornecedor em <span className="numero">{dataCurtaUtc(dataPagamentoEnte)}</span> ·{" "}
            <span className="font-semibold" style={{ color: "var(--cor-marca-clara)" }}>
              corrigir data
            </span>
          </summary>
          <div className="mt-2">{formulario}</div>
        </details>
      ) : (
        <div className="flex flex-col gap-2">
          <p style={{ color: "var(--cor-texto-2)" }}>
            {bloqueiaCobranca
              ? "Data do pagamento do ente ao fornecedor não informada: a comissão só pode ser cobrada depois dela."
              : "Data do pagamento do ente ao fornecedor não informada (cobrança anterior a esta regra)."}
          </p>
          {formulario}
        </div>
      )}
      {estado.erro && (
        <Aviso tom="critico" className="mt-2">
          {estado.erro}
        </Aviso>
      )}
      {estado.ok && dataPagamentoEnte && (
        <Aviso tom="sucesso" className="mt-2">
          Data do pagamento do ente salva.
        </Aviso>
      )}
    </div>
  );
}
