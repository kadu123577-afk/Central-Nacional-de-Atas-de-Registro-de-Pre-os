"use client";

import { useActionState, useId, useState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { dataCurtaUtc } from "@/lib/formato";
import {
  GRUPOS_INSTRUCAO,
  ITENS_INSTRUCAO,
  MAX_JUSTIFICATIVA,
  MAX_NOTA,
  MIN_JUSTIFICATIVA,
  TEXTO_DECLARACAO,
  VERSAO_DECLARACAO,
  resumirInstrucao,
  textoDeclaracao,
  type EstadoItemInstrucao,
  type MapaInstrucao,
  type ResumoInstrucao,
} from "@/lib/instrucao-adesao";
import type { CartaoView } from "@/lib/kanban-view";
import {
  declararConformidade,
  marcarItemInstrucao,
  revogarDeclaracao,
  type EstadoInstrucao,
} from "@/app/vendedor/instrucao-actions";

const estadoInicial: EstadoInstrucao = {};

/** Dia e hora no fuso de Brasília: o mesmo texto no servidor e no navegador. */
function dataHoraBrasilia(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Aba "Instrução" da gaveta do município (Projeto RNA, etapa 3): o que o
 * órgão aderente precisa reunir, marcado conforme os documentos chegam, e a
 * declaração interna de conformidade que libera o estágio "Aderiu". A
 * plataforma só organiza a informação e o pedido; quem decide é o órgão
 * aderente, o órgão gerenciador e o fornecedor. No Pipeline do gestor
 * (somenteLeitura) a aba só mostra, sem formulários nem botões.
 */
export function Instrucao({ cartao: c, somenteLeitura }: { cartao: CartaoView; somenteLeitura: boolean }) {
  const base = useId();
  const instrucao = c.instrucao;
  const mapa: MapaInstrucao = instrucao?.itens ?? {};
  const resumo = instrucao?.resumo ?? resumirInstrucao({});

  return (
    <>
      <div>
        <p className="kb-secao">Instrução da adesão</p>
        <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          O que o órgão aderente precisa reunir.{" "}
          {somenteLeitura
            ? "O vendedor marca conforme os documentos chegam."
            : "Marque conforme os documentos chegarem."}
        </p>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <p className="rotulo-campo" style={{ marginBottom: 0 }}>
            Itens obrigatórios
          </p>
          <p className="numero text-xs" style={{ color: "var(--cor-texto-2)" }}>
            {resumo.obrigatoriosFeitos} de {resumo.obrigatoriosTotal} · {resumo.percentual}%
          </p>
        </div>
        <div
          className="barra-saldo"
          role="progressbar"
          aria-label="Itens obrigatórios da instrução já confirmados"
          aria-valuemin={0}
          aria-valuemax={resumo.obrigatoriosTotal}
          aria-valuenow={resumo.obrigatoriosFeitos}
          aria-valuetext={`${resumo.obrigatoriosFeitos} de ${resumo.obrigatoriosTotal} itens obrigatórios`}
        >
          <div style={{ width: `${resumo.percentual}%` }} />
        </div>
      </div>

      {GRUPOS_INSTRUCAO.map((grupo, i) => (
        <section key={grupo} aria-labelledby={`${base}-grupo-${i}`} className="flex flex-col gap-2">
          <p id={`${base}-grupo-${i}`} className="kb-secao">
            {grupo}
          </p>
          <ul className="lista-linhas">
            {ITENS_INSTRUCAO.filter((item) => item.grupo === grupo).map((item) => (
              <li key={item.chave}>
                <LinhaItem
                  item={item}
                  estado={mapa[item.chave]}
                  oportunidadeId={c.id}
                  somenteLeitura={somenteLeitura}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <BlocoDeclaracao cartao={c} mapa={mapa} resumo={resumo} somenteLeitura={somenteLeitura} />

      <a
        href={`/minutas/${c.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="botao-atas link self-start"
      >
        Abrir kit de minutas →<span className="sr-only"> (abre em nova aba)</span>
      </a>
    </>
  );
}

type ItemDaLista = (typeof ITENS_INSTRUCAO)[number];

function LinhaItem({
  item,
  estado,
  oportunidadeId,
  somenteLeitura,
}: {
  item: ItemDaLista;
  estado: EstadoItemInstrucao | undefined;
  oportunidadeId: string;
  somenteLeitura: boolean;
}) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;
  const acao = marcarItemInstrucao.bind(null, oportunidadeId, item.chave);
  const [resposta, formAction, pendente] = useActionState(acao, estadoInicial);

  const feito = estado?.feito === true;
  // Enquanto a gravação não volta, mostra como o item vai ficar (a caixa fica travada para não enviar duas vezes).
  const marcado = pendente ? !feito : feito;
  const nota = estado?.nota;

  return (
    <div className="flex items-start gap-3">
      {!somenteLeitura && (
        <form action={formAction} className="pt-0.5">
          {/* Como o item deve ficar depois do clique: o servidor não deduz, confere. */}
          <input type="hidden" name="feito" value={feito ? "false" : "true"} />
          <input
            id={id}
            type="checkbox"
            checked={marcado}
            disabled={pendente}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            aria-describedby={idAjuda}
            style={{ width: 18, height: 18, accentColor: "var(--cor-marca)" }}
          />
        </form>
      )}

      <div className="min-w-0 flex-1" style={{ overflowWrap: "anywhere" }}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {somenteLeitura ? (
            <span className="text-[13px] font-semibold" style={{ color: "var(--cor-texto)" }}>
              {item.rotulo}
            </span>
          ) : (
            <label htmlFor={id} className="text-[13px] font-semibold" style={{ color: "var(--cor-texto)" }}>
              {item.rotulo}
            </label>
          )}
          {!item.obrigatorio && <Badge tom="neutro">Depois da adesão</Badge>}
          {somenteLeitura && <Badge tom={feito ? "marca" : "neutro"}>{feito ? "Feito" : "Pendente"}</Badge>}
        </div>
        <p id={idAjuda} className="kb-sub">
          {item.ajuda}
        </p>
        {feito && estado?.em && (
          <p className="kb-sub numero">Marcado em {dataCurtaUtc(estado.em)}</p>
        )}
        {nota && <p className="kb-sub">Nota: {nota}</p>}

        {!somenteLeitura && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--cor-marca-clara)" }}>
              {nota ? "Editar nota" : "Adicionar nota"}
              <span className="sr-only"> sobre: {item.rotulo}</span>
            </summary>
            <form action={formAction} className="mt-1.5 flex flex-wrap items-center gap-2">
              <input type="hidden" name="feito" value={feito ? "true" : "false"} />
              <input
                key={nota ?? ""}
                name="nota"
                defaultValue={nota ?? ""}
                maxLength={MAX_NOTA}
                placeholder="Nota curta (opcional)"
                aria-label={`Nota sobre: ${item.rotulo}`}
                className="campo-atas"
                style={{ flex: 1, minWidth: 160, padding: "4px 8px", fontSize: 12 }}
              />
              <button
                type="submit"
                disabled={pendente}
                className="botao-atas secundario"
                style={{ padding: "3px 10px", fontSize: 12 }}
              >
                Salvar nota
              </button>
            </form>
          </details>
        )}

        <div aria-live="polite">
          {resposta.erro && (
            <div className="mt-1.5">
              <Aviso tom="critico">{resposta.erro}</Aviso>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BlocoDeclaracao({
  cartao: c,
  mapa,
  resumo,
  somenteLeitura,
}: {
  cartao: CartaoView;
  mapa: MapaInstrucao;
  resumo: ResumoInstrucao;
  somenteLeitura: boolean;
}) {
  const instrucao = c.instrucao;
  const declaracaoEm = instrucao?.declaracaoEm ?? null;

  return (
    <section className="flex flex-col gap-2.5" aria-label="Declaração de conformidade">
      <p className="kb-secao">Declaração de conformidade</p>

      {declaracaoEm && instrucao ? (
        <DeclaracaoRegistrada cartao={c} resumo={resumo} somenteLeitura={somenteLeitura} />
      ) : (
        <>
          <Aviso tom="info">Sem a declaração registrada, o município não pode ser marcado como Aderiu.</Aviso>
          {!somenteLeitura && <FormularioDeclaracao oportunidadeId={c.id} mapa={mapa} resumo={resumo} />}
        </>
      )}
    </section>
  );
}

function DeclaracaoRegistrada({
  cartao: c,
  resumo,
  somenteLeitura,
}: {
  cartao: CartaoView;
  resumo: ResumoInstrucao;
  somenteLeitura: boolean;
}) {
  const instrucao = c.instrucao;
  if (!instrucao?.declaracaoEm) return null;
  const { declaracaoEm, declaracaoPorTipo, declaracaoVersao, declaracaoExcecao } = instrucao;

  const quem =
    declaracaoPorTipo === "vendedor"
      ? (c.vendedorNome ?? "Vendedor")
      : declaracaoPorTipo === "admin"
        ? "Administrador"
        : "Não informado";
  const aderiu = c.estagio === "aderiu";
  const pendentes = resumo.pendentesObrigatorios.join("; ");

  return (
    <>
      <Aviso tom="sucesso" titulo="Declaração registrada.">
        Em <span className="numero">{dataHoraBrasilia(declaracaoEm)}</span> por {quem}
        {declaracaoVersao != null ? `, versão ${declaracaoVersao} do texto` : ""}.
      </Aviso>

      {declaracaoVersao === VERSAO_DECLARACAO && (
        <div className="kb-abordagem">
          <p className="titulo">O que se declara</p>
          {TEXTO_DECLARACAO}
        </div>
      )}

      {declaracaoExcecao && (
        <Aviso tom="atencao" titulo="Registrada com itens obrigatórios pendentes.">
          Justificativa: {declaracaoExcecao}
          {pendentes ? ` Itens obrigatórios ainda sem confirmação: ${pendentes}.` : ""}
        </Aviso>
      )}

      {!declaracaoExcecao && !resumo.completo && (
        <Aviso tom="atencao" titulo="A checklist mudou depois da declaração.">
          A declaração foi registrada com todos os itens obrigatórios feitos, mas agora faltam: {pendentes}. Ela
          continua registrada
          {!somenteLeitura && !aderiu ? "; para refazê-la, revogue e registre de novo." : "."}
        </Aviso>
      )}

      {!somenteLeitura &&
        (aderiu ? (
          <p className="kb-sub">Com o município em Aderiu, a declaração não pode mais ser revogada.</p>
        ) : (
          <RevogarDeclaracao oportunidadeId={c.id} />
        ))}
    </>
  );
}

function RevogarDeclaracao({ oportunidadeId }: { oportunidadeId: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, formAction, pendente] = useActionState(revogarDeclaracao.bind(null, oportunidadeId), estadoInicial);

  if (!confirmando) {
    return (
      <button type="button" className="botao-atas secundario self-start" onClick={() => setConfirmando(true)}>
        Revogar declaração
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <p className="text-xs" style={{ color: "var(--cor-texto-2)" }}>
        Revogar apaga a declaração registrada. Enquanto não houver outra, o município não pode ser marcado como Aderiu.
      </p>
      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
      <div className="kb-linha-botoes">
        <button type="submit" disabled={pendente} className="botao-atas critico">
          {pendente ? "Revogando..." : "Confirmar revogação"}
        </button>
        <button type="button" className="botao-atas link" disabled={pendente} onClick={() => setConfirmando(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormularioDeclaracao({
  oportunidadeId,
  mapa,
  resumo,
}: {
  oportunidadeId: string;
  mapa: MapaInstrucao;
  resumo: ResumoInstrucao;
}) {
  const [estado, formAction, pendente] = useActionState(declararConformidade.bind(null, oportunidadeId), estadoInicial);
  const [justificativa, setJustificativa] = useState("");

  // O texto mostrado é o mesmo que o servidor grava como o que a pessoa declarou.
  const texto = textoDeclaracao({ mapa, justificativaExcecao: justificativa });
  const faltam = resumo.obrigatoriosTotal - resumo.obrigatoriosFeitos;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2.5 rounded-[12px] border p-3"
      style={{ borderColor: "var(--cor-borda)", background: "var(--cor-superficie)" }}
    >
      <div>
        <p className="rotulo-campo" style={{ marginBottom: 4 }}>
          Texto da declaração
        </p>
        <p className="text-xs" style={{ color: "var(--cor-texto-2)", overflowWrap: "anywhere" }}>
          {texto}
        </p>
      </div>

      {!resumo.completo && (
        <>
          <Aviso tom="atencao">
            {faltam === 1 ? "Falta 1 item obrigatório" : `Faltam ${faltam} itens obrigatórios`}:{" "}
            {resumo.pendentesObrigatorios.join("; ")}. Para declarar mesmo assim, explique o motivo (mínimo de{" "}
            {MIN_JUSTIFICATIVA} caracteres).
          </Aviso>
          <label className="block">
            <span className="rotulo-campo">Justificativa da exceção</span>
            <textarea
              name="justificativaExcecao"
              rows={3}
              required
              minLength={MIN_JUSTIFICATIVA}
              maxLength={MAX_JUSTIFICATIVA}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              className="campo-atas"
            />
          </label>
        </>
      )}

      <div aria-live="polite">{estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}</div>
      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Registrando..." : "Registrar declaração"}
      </button>
    </form>
  );
}
