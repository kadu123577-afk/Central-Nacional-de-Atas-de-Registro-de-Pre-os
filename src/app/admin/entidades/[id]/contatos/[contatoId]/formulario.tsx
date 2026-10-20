"use client";

import { useActionState } from "react";
import { registrarInteracaoPontoFocal, type EstadoInteracaoPontoFocal } from "../../../../actions";
import { Secao } from "@/components/ui/secao";
import { Aviso } from "@/components/ui/aviso";
import { RESULTADOS_INTERACAO } from "@/lib/pontos-focais";

const estadoInicial: EstadoInteracaoPontoFocal = {};

export function FormularioInteracao({
  pontoFocalId,
  atas,
}: {
  pontoFocalId: string;
  atas: { id: string; numero: string; objeto: string }[];
}) {
  const [estado, formAction, pendente] = useActionState(registrarInteracaoPontoFocal, estadoInicial);

  return (
    <Secao titulo="Registrar interação">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="pontoFocalId" value={pontoFocalId} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="rotulo-campo">
              Ata oferecida <small>(opcional)</small>
            </span>
            <select name="ataId" className="campo-atas" defaultValue="">
              <option value="">Nenhuma ata específica</option>
              {atas.map((a) => (
                <option key={a.id} value={a.id}>
                  Ata {a.numero} — {a.objeto.slice(0, 60)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="rotulo-campo">Resultado</span>
            <select name="resultado" required className="campo-atas" defaultValue="">
              <option value="" disabled>
                Selecione...
              </option>
              {RESULTADOS_INTERACAO.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="rotulo-campo">Observação</span>
          <textarea name="observacao" rows={2} className="campo-atas" />
        </label>

        {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}

        <button type="submit" disabled={pendente} className="botao-atas self-start">
          {pendente ? "Salvando..." : "Registrar"}
        </button>
      </form>
    </Secao>
  );
}
