"use client";

import { useState, useTransition } from "react";
import { marcarFaturamentoComoPago, marcarFaturamentoComoPendente } from "../actions";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { tomFaturamento } from "@/lib/severidade";

/**
 * Badge + botão de alternar pago/pendente num único componente — assim os
 * dois ficam sempre em sincronia com o mesmo estado local. Atualiza a tela
 * na hora do clique (sem esperar o reload da página), com "Salvando..." no
 * botão enquanto a mutação está em voo, e reverte com uma mensagem clara se
 * a chamada falhar.
 */
export function StatusFaturamento({
  faturamentoId,
  pagoInicial,
}: {
  faturamentoId: string;
  pagoInicial: boolean;
}) {
  const [pago, setPago] = useState(pagoInicial);
  const [erro, setErro] = useState<string | undefined>();
  const [pendente, iniciarTransicao] = useTransition();

  function alternar() {
    const novoPago = !pago;
    setErro(undefined);

    const formData = new FormData();
    formData.set("faturamentoId", faturamentoId);

    iniciarTransicao(async () => {
      const acao = novoPago ? marcarFaturamentoComoPago : marcarFaturamentoComoPendente;
      const resultado = await acao({}, formData);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setPago(novoPago);
    });
  }

  return (
    <>
      <td className="whitespace-nowrap">
        <Badge tom={tomFaturamento(pago)}>{pago ? "Recebido" : "A receber"}</Badge>
      </td>
      <td>
        <div className="flex flex-col items-end gap-1 text-right">
          <button
            type="button"
            onClick={alternar}
            disabled={pendente}
            className="botao-atas link whitespace-nowrap"
          >
            {pendente ? "Salvando..." : pago ? "Marcar como pendente" : "Marcar como recebido"}
          </button>
          {erro && (
            <Aviso tom="critico" className="max-w-[260px] text-left">
              {erro}
            </Aviso>
          )}
        </div>
      </td>
    </>
  );
}
