"use client";

import { useActionState, useState } from "react";
import { alternarSocio, removerSocio, type EstadoAcao } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Retorno } from "./retorno";

const estadoInicial: EstadoAcao = {};
const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;

/** Uma participação do histórico, já formatada pelo servidor. */
export interface DadosParticipacao {
  /** "60%". */
  percentual: string;
  /** "dd/mm/aaaa". */
  desde: string;
  /** "dd/mm/aaaa" ou nulo (em vigor). */
  ate: string | null;
}

/** O que a tabela sabe de um sócio (tudo já formatado pelo servidor). */
export interface DadosSocio {
  id: string;
  nome: string;
  /** "Sócio ostensivo" | "Sócio participante". */
  tipoRotulo: string;
  ativo: boolean;
  /** "60%" ou "—" (sem participação em vigor hoje). */
  participacaoHoje: string;
  /** Da mais recente para a mais antiga. */
  historico: DadosParticipacao[];
}

/**
 * Um sócio na tabela: nome, tipo, situação, participação de hoje e o histórico
 * (aberto sob demanda). Ativar/desativar e remover (com confirmação) ficam na
 * mesma linha; a remoção só funciona para quem nunca teve participação nem despesa
 * (o servidor confere e explica).
 */
export function LinhaSocio({ socio }: { socio: DadosSocio }) {
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const [estadoAtivo, acaoAtivo, alternando] = useActionState(alternarSocio, estadoInicial);
  const [estadoRemocao, acaoRemocao, removendo] = useActionState(removerSocio, estadoInicial);
  const ocupado = alternando || removendo;
  const respostas = [estadoAtivo, estadoRemocao].filter((e) => e.erro || (e.ok && e.aviso));

  return (
    <>
      <tr style={socio.ativo ? undefined : { opacity: 0.75 }}>
        <td className="min-w-[12rem] align-top">
          <span className="titulo-linha block">{socio.nome}</span>
          {socio.historico.length > 0 && (
            <details className="mt-1 text-xs" style={COR_SECUNDARIA}>
              <summary className="cursor-pointer font-semibold" style={{ color: "var(--cor-marca-clara)" }}>
                Histórico de participações ({socio.historico.length})
              </summary>
              <ul className="lista-linhas mt-2">
                {socio.historico.map((h, i) => (
                  <li key={i} className="numero">
                    <strong style={{ color: "var(--cor-texto)" }}>{h.percentual}</strong> · de {h.desde}{" "}
                    {h.ate ? `a ${h.ate}` : "em diante (em vigor)"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </td>
        <td className="align-top text-[13.5px]">{socio.tipoRotulo}</td>
        <td className="align-top">
          <Badge tom={socio.ativo ? "marca" : "neutro"}>{socio.ativo ? "Ativo" : "Inativo"}</Badge>
        </td>
        <td className="align-top">
          <span className="numero text-[15px] font-extrabold" style={{ color: "var(--cor-texto)" }}>
            {socio.participacaoHoje}
          </span>
        </td>
        <td className="align-top">
          {confirmandoRemocao ? (
            <form action={acaoRemocao} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={socio.id} />
              <span className="text-xs font-semibold" style={{ color: "var(--cor-texto-2)" }}>
                Remover este sócio?
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
              <form action={acaoAtivo}>
                <input type="hidden" name="id" value={socio.id} />
                <input type="hidden" name="ativar" value={socio.ativo ? "0" : "1"} />
                <button type="submit" disabled={ocupado} className="botao-atas secundario pequeno">
                  {alternando ? "Aguarde..." : socio.ativo ? "Desativar" : "Ativar"}
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
