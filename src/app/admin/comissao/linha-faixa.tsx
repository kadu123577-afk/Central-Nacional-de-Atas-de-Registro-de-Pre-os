"use client";

import { useActionState, useId, useState } from "react";
import { alternarFaixa, atualizarFaixa, removerFaixa, type EstadoFaixa } from "./actions";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { COMISSAO_MAXIMA_PERCENTUAL, COMISSAO_MINIMA_PERCENTUAL } from "@/lib/comissao";
import { LIMITE_DESCRICAO_FAIXA } from "./leitura";

const estadoInicial: EstadoFaixa = {};
const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;

/** O que a tabela sabe de uma faixa (tudo já formatado pelo servidor). */
export interface DadosFaixa {
  id: string;
  /** "R$ 100.000,00". */
  valorTexto: string;
  /** "5,25%". */
  percentualTexto: string;
  /** "5,25", para o campo de edição. */
  percentualCampo: string;
  descricao: string | null;
  ativo: boolean;
  /** Percentual fora do intervalo que o contrato de intermediação aceita. */
  foraDoContrato: boolean;
}

/** Uma resposta curta da ação, em linha própria embaixo da faixa. */
function Retorno({ estado }: { estado: EstadoFaixa }) {
  if (estado.erro) return <Aviso tom="critico">{estado.erro}</Aviso>;
  if (estado.ok && estado.aviso) {
    return (
      <p role="status" className="text-xs font-semibold" style={{ color: "var(--cor-marca-clara)" }}>
        {estado.aviso}
      </p>
    );
  }
  return null;
}

/**
 * Uma faixa na tabela: mostra os valores e, ao clicar em "Editar", troca
 * percentual e descrição por campos na própria linha. Ativar/desativar e
 * remover (com confirmação) ficam na mesma linha. Os campos da edição usam o
 * atributo `form` para pertencer a um formulário fora das células da tabela.
 */
export function LinhaFaixa({ faixa }: { faixa: DadosFaixa }) {
  const formId = useId();
  const [editando, setEditando] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  // Ao abrir ou cancelar a edição, a resposta e o texto digitado da tentativa
  // anterior (um erro, "Nada mudou.") deixam de valer: a edição recomeça do que está salvo.
  const [descartada, setDescartada] = useState(false);

  const [respostaEdicao, acaoEdicao, salvando] = useActionState(async (anterior: EstadoFaixa, dados: FormData) => {
    const resposta = await atualizarFaixa(anterior, dados);
    setDescartada(false);
    if (resposta.ok) setEditando(false);
    return resposta;
  }, estadoInicial);
  const [estadoAtivo, acaoAtivo, alternando] = useActionState(alternarFaixa, estadoInicial);
  const [estadoRemocao, acaoRemocao, removendo] = useActionState(removerFaixa, estadoInicial);

  const estadoEdicao = descartada ? estadoInicial : respostaEdicao;
  const ocupado = salvando || alternando || removendo;
  // Depois de um erro o React zera o formulário; repõe o que foi digitado.
  const v = estadoEdicao.valores;
  const respostas = [estadoEdicao, estadoAtivo, estadoRemocao].filter((e) => e.erro || (e.ok && e.aviso));

  return (
    <>
      <tr style={faixa.ativo ? undefined : { opacity: 0.75 }}>
        <td className="align-top">
          <span className="titulo-linha numero block">{faixa.valorTexto}</span>
        </td>
        <td className="align-top">
          {editando ? (
            <input
              form={formId}
              name="percentual"
              type="text"
              inputMode="decimal"
              required
              autoComplete="off"
              aria-label="Percentual (%)"
              defaultValue={v?.percentual ?? faixa.percentualCampo}
              className="campo-atas !w-24"
            />
          ) : (
            <>
              <span className="numero text-[15px] font-extrabold" style={{ color: "var(--cor-texto)" }}>
                {faixa.percentualTexto}
              </span>
              {faixa.foraDoContrato && (
                <span className="mt-1 block">
                  <Badge tom="atencao">
                    Fora de {COMISSAO_MINIMA_PERCENTUAL}% a {COMISSAO_MAXIMA_PERCENTUAL}%
                  </Badge>
                </span>
              )}
            </>
          )}
        </td>
        <td className="min-w-[12rem] align-top">
          {editando ? (
            <input
              form={formId}
              name="descricao"
              type="text"
              maxLength={LIMITE_DESCRICAO_FAIXA}
              autoComplete="off"
              aria-label="Descrição"
              defaultValue={v?.descricao ?? faixa.descricao ?? ""}
              className="campo-atas"
            />
          ) : (
            <span className="text-[13.5px]" style={faixa.descricao ? undefined : COR_SECUNDARIA}>
              {faixa.descricao ?? "—"}
            </span>
          )}
        </td>
        <td className="align-top">
          <Badge tom={faixa.ativo ? "marca" : "neutro"}>{faixa.ativo ? "Ativa" : "Inativa"}</Badge>
        </td>
        <td className="align-top">
          {editando ? (
            <form id={formId} action={acaoEdicao} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={faixa.id} />
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
              <input type="hidden" name="id" value={faixa.id} />
              <span className="text-xs font-semibold" style={{ color: "var(--cor-texto-2)" }}>
                Remover esta faixa?
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
              <form action={acaoAtivo}>
                <input type="hidden" name="id" value={faixa.id} />
                <input type="hidden" name="ativar" value={faixa.ativo ? "0" : "1"} />
                <button type="submit" disabled={ocupado} className="botao-atas secundario pequeno">
                  {alternando ? "Aguarde..." : faixa.ativo ? "Desativar" : "Ativar"}
                </button>
              </form>
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
          <td colSpan={5} className="!pt-0">
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
