"use client";

import { useActionState, useId, useState } from "react";
import { atualizarDespesa, removerDespesa, type EstadoAcao, type EstadoDespesa } from "./actions";
import type { OpcaoSocio } from "./formulario-nova-despesa";
import { LIMITE_CATEGORIA_DESPESA, LIMITE_DESCRICAO_DESPESA } from "./leitura";
import { Retorno } from "./retorno";

const estadoInicial: EstadoDespesa = {};
const estadoInicialSimples: EstadoAcao = {};
const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;

/** O que a tabela sabe de uma despesa (tudo já formatado pelo servidor). */
export interface DadosDespesa {
  id: string;
  /** "dd/mm/aaaa". */
  dataTexto: string;
  /** "AAAA-MM-DD", para o campo de data. */
  dataCampo: string;
  descricao: string;
  categoria: string | null;
  /** "R$ 1.234,56". */
  valorTexto: string;
  /** "1234,56", para o campo de valor. */
  valorCampo: string;
  pagaPorSocioId: string | null;
  pagaPorNome: string | null;
}

/**
 * Uma despesa na tabela: mostra os valores e, ao clicar em "Editar", troca tudo
 * por campos na própria linha (o atributo `form` liga os campos a um formulário
 * fora das células). Remover pede confirmação; a trilha de auditoria guarda a
 * data e o valor apagados.
 */
export function LinhaDespesa({ despesa, socios }: { despesa: DadosDespesa; socios: OpcaoSocio[] }) {
  const formId = useId();
  const [editando, setEditando] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  // Ao abrir ou cancelar a edição, a resposta e o texto digitado da tentativa
  // anterior deixam de valer: a edição recomeça do que está salvo.
  const [descartada, setDescartada] = useState(false);

  const [respostaEdicao, acaoEdicao, salvando] = useActionState(async (anterior: EstadoDespesa, dados: FormData) => {
    const resposta = await atualizarDespesa(anterior, dados);
    setDescartada(false);
    if (resposta.ok) setEditando(false);
    return resposta;
  }, estadoInicial);
  const [estadoRemocao, acaoRemocao, removendo] = useActionState(removerDespesa, estadoInicialSimples);

  const estadoEdicao = descartada ? estadoInicial : respostaEdicao;
  const ocupado = salvando || removendo;
  const v = estadoEdicao.valores;
  const respostas = [estadoEdicao, estadoRemocao].filter((e) => e.erro || (e.ok && e.aviso));

  // O sócio atual da despesa entra nas opções mesmo se estiver inativo (não some da edição).
  const opcoes = [...socios];
  if (despesa.pagaPorSocioId && despesa.pagaPorNome && !opcoes.some((o) => o.id === despesa.pagaPorSocioId)) {
    opcoes.push({ id: despesa.pagaPorSocioId, nome: despesa.pagaPorNome });
  }

  return (
    <>
      <tr>
        <td className="align-top">
          {editando ? (
            <input
              form={formId}
              name="data"
              type="date"
              required
              min="2000-01-01"
              max="2100-12-31"
              aria-label="Data"
              defaultValue={v?.data ?? despesa.dataCampo}
              className="campo-atas"
            />
          ) : (
            <span className="numero text-[13.5px]">{despesa.dataTexto}</span>
          )}
        </td>
        <td className="min-w-[14rem] align-top">
          {editando ? (
            <input
              form={formId}
              name="descricao"
              type="text"
              required
              maxLength={LIMITE_DESCRICAO_DESPESA}
              autoComplete="off"
              aria-label="Descrição"
              defaultValue={v?.descricao ?? despesa.descricao}
              className="campo-atas"
            />
          ) : (
            <span className="titulo-linha">{despesa.descricao}</span>
          )}
        </td>
        <td className="align-top">
          {editando ? (
            <input
              form={formId}
              name="categoria"
              type="text"
              maxLength={LIMITE_CATEGORIA_DESPESA}
              autoComplete="off"
              aria-label="Categoria"
              defaultValue={v?.categoria ?? despesa.categoria ?? ""}
              className="campo-atas"
            />
          ) : (
            <span className="text-[13.5px]" style={despesa.categoria ? undefined : COR_SECUNDARIA}>
              {despesa.categoria ?? "—"}
            </span>
          )}
        </td>
        <td className="align-top">
          {editando ? (
            <input
              form={formId}
              name="valor"
              type="text"
              inputMode="decimal"
              required
              autoComplete="off"
              aria-label="Valor (R$)"
              defaultValue={v?.valor ?? despesa.valorCampo}
              className="campo-atas !w-32"
            />
          ) : (
            <span className="numero text-[15px] font-extrabold" style={{ color: "var(--cor-texto)" }}>
              {despesa.valorTexto}
            </span>
          )}
        </td>
        <td className="align-top">
          {editando ? (
            <select
              form={formId}
              name="pagaPorSocioId"
              aria-label="Quem pagou"
              defaultValue={v?.pagaPorSocioId ?? despesa.pagaPorSocioId ?? ""}
              className="campo-atas"
            >
              <option value="">—</option>
              {opcoes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[13.5px]" style={despesa.pagaPorNome ? undefined : COR_SECUNDARIA}>
              {despesa.pagaPorNome ?? "—"}
            </span>
          )}
        </td>
        <td className="align-top">
          {editando ? (
            <form id={formId} action={acaoEdicao} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={despesa.id} />
              <button type="submit" disabled={ocupado} className="botao-atas pequeno">
                {salvando ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  setDescartada(true);
                  setEditando(false);
                }}
                className="botao-atas secundario pequeno"
              >
                Cancelar
              </button>
            </form>
          ) : confirmandoRemocao ? (
            <form action={acaoRemocao} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={despesa.id} />
              <span className="text-xs font-semibold" style={{ color: "var(--cor-texto-2)" }}>
                Remover esta despesa?
              </span>
              <button type="submit" disabled={ocupado} className="botao-atas critico pequeno">
                {removendo ? "Removendo..." : "Sim, remover"}
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => setConfirmandoRemocao(false)}
                className="botao-atas secundario pequeno"
              >
                Não
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  setDescartada(true);
                  setEditando(true);
                }}
                className="botao-atas secundario pequeno"
              >
                Editar
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => setConfirmandoRemocao(true)}
                className="botao-atas critico pequeno"
              >
                Remover
              </button>
            </div>
          )}
        </td>
      </tr>
      {respostas.length > 0 && (
        <tr>
          <td colSpan={6} className="!pt-0">
            <div className="flex flex-col gap-2">
              {respostas.map((e, i) => (
                <Retorno key={i} estado={e} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
