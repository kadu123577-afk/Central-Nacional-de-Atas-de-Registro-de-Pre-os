import type { Tom } from "@/components/ui/badge";
import { tomConsumo } from "@/lib/severidade";

const COR_POR_TOM: Record<Tom, string> = {
  neutro: "var(--cor-texto-3)",
  atencao: "var(--cor-atencao)",
  alerta: "var(--cor-alerta)",
  critico: "var(--cor-critico)",
  marca: "var(--cor-marca)",
};

/**
 * Barra de consumo da trava do art. 86 (Lei 14.133/2021) — usada tanto
 * pro limite por órgão (50% da quantidade registrada) quanto pro limite
 * agregado (200%, todos os órgãos somados). A cor segue tomConsumo
 * (src/lib/severidade.ts), a única fonte de verdade pra essa escala.
 */
export function BarraConsumo({
  rotulo,
  percentual,
  detalhe,
}: {
  rotulo: string;
  percentual: number;
  detalhe: string;
}) {
  const tom = tomConsumo(percentual);
  const larguraVisual = Math.min(100, Math.max(0, percentual));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium" style={{ color: "var(--cor-texto-2)" }}>
          {rotulo}
        </span>
        <span className="text-xs" style={{ color: COR_POR_TOM[tom] }}>
          {percentual.toFixed(0)}%
        </span>
      </div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--cor-borda)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${larguraVisual}%`, background: COR_POR_TOM[tom] }}
        />
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
        {detalhe}
      </p>
    </div>
  );
}
