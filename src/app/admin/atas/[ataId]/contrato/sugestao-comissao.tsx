"use client";

import Link from "next/link";
import { useState } from "react";
import { COMISSAO_MAXIMA_PERCENTUAL, COMISSAO_MINIMA_PERCENTUAL } from "@/lib/comissao";
import { Aviso } from "@/components/ui/aviso";
import type { SugestaoContrato } from "./sugestao";

const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;

function LinkFaixas({ children = "Ver as faixas de comissão →" }: { children?: React.ReactNode }) {
  return (
    <Link href="/admin/comissao" className="botao-atas link">
      {children}
    </Link>
  );
}

/**
 * A comissão sugerida para o valor total da ata, acima do campo do
 * percentual. O botão "Usar sugestão" só PREENCHE o campo (quem o faz é
 * `aoUsar`, que recebe o texto como o campo espera, ex. "5,25"); o contrato
 * só é gravado quando o administrador clica em "Salvar contrato".
 */
export function SugestaoComissao({
  sugestao,
  aoUsar,
}: {
  sugestao: SugestaoContrato;
  aoUsar: (percentualCampo: string) => void;
}) {
  const [usada, setUsada] = useState(false);

  if (sugestao.tipo === "sugestao") {
    return (
      <div className="flex flex-col gap-3">
        <div className="painel-interno flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            <p>
              Valor total da ata: <b className="numero" style={{ color: "var(--cor-texto)" }}>{sugestao.valorTotalTexto}</b>
              {" · "}Sugestão:{" "}
              <b className="numero" style={{ color: "var(--cor-texto)" }}>{sugestao.percentualTexto}</b>{" "}
              <span style={COR_SECUNDARIA}>
                (faixa a partir de <span className="numero">{sugestao.faixaTexto}</span>)
              </span>
            </p>
            <p className="mt-1 text-xs" style={COR_SECUNDARIA}>
              É só uma sugestão: o percentual vale o que você salvar no contrato.
            </p>
          </div>
          {!sugestao.foraDoIntervalo && (
            <button
              type="button"
              className="botao-atas secundario pequeno"
              onClick={() => {
                aoUsar(sugestao.percentualCampo);
                setUsada(true);
              }}
            >
              Usar sugestão
            </button>
          )}
        </div>
        {sugestao.foraDoIntervalo && (
          <Aviso tom="atencao">
            Esta sugestão está fora do intervalo que o contrato aceita (de {COMISSAO_MINIMA_PERCENTUAL}% a{" "}
            {COMISSAO_MAXIMA_PERCENTUAL}%), então não dá para usá-la como está. Ajuste a faixa em Comissão ou digite
            outro percentual. <LinkFaixas>Ajustar as faixas →</LinkFaixas>
          </Aviso>
        )}
        {usada && !sugestao.foraDoIntervalo && (
          <p role="status" className="text-xs font-semibold" style={{ color: "var(--cor-marca-clara)" }}>
            Percentual colocado no campo abaixo. Confira e salve o contrato para valer.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="painel-interno flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="min-w-0 text-sm" style={{ color: "var(--cor-texto-2)" }}>
        {sugestao.tipo === "indisponivel" && (
          <>Não foi possível consultar as faixas de comissão agora. Você pode digitar o percentual normalmente.</>
        )}
        {sugestao.tipo === "sem-itens" && (
          <>Esta ata ainda não tem itens, então não há valor total para sugerir um percentual.</>
        )}
        {sugestao.tipo === "sem-faixas" && (
          <>
            Valor total da ata:{" "}
            <b className="numero" style={{ color: "var(--cor-texto)" }}>{sugestao.valorTotalTexto}</b>. Nenhuma faixa
            de comissão está configurada, então não há sugestão. Digite o percentual pactuado.
          </>
        )}
        {sugestao.tipo === "abaixo-da-primeira" && (
          <>
            Valor total da ata:{" "}
            <b className="numero" style={{ color: "var(--cor-texto)" }}>{sugestao.valorTotalTexto}</b>. Sem sugestão: o
            valor está abaixo da primeira faixa, que começa em{" "}
            <span className="numero">{sugestao.primeiraFaixaTexto}</span>. Digite o percentual pactuado.
          </>
        )}
      </p>
      {sugestao.tipo !== "indisponivel" && (
        <LinkFaixas>{sugestao.tipo === "sem-faixas" ? "Configurar as faixas →" : "Ver as faixas →"}</LinkFaixas>
      )}
    </div>
  );
}
