"use client";

import { useActionState } from "react";
import { registrarInteracaoPontoFocal, type EstadoInteracaoPontoFocal } from "../../../../actions";
import { Secao } from "@/components/ui/secao";
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
          <label className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
              Ata oferecida (opcional)
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

          <label className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
              Resultado
            </span>
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

        <label className="block text-sm">
          <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
            Observação
          </span>
          <textarea name="observacao" rows={2} className="campo-atas" />
        </label>

        {estado.erro && (
          <p
            className="rounded-[var(--raio)] border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--cor-critico)",
              background: "var(--cor-critico-fundo)",
              color: "var(--cor-critico)",
            }}
          >
            {estado.erro}
          </p>
        )}

        <button type="submit" disabled={pendente} className="botao-atas self-start">
          {pendente ? "Salvando..." : "Registrar"}
        </button>
      </form>
    </Secao>
  );
}
