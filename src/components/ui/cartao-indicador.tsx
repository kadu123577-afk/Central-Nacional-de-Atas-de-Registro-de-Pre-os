import type { Tom } from "./badge";

const COR_POR_TOM: Record<Tom, string> = {
  neutro: "var(--cor-texto)",
  atencao: "var(--cor-atencao)",
  alerta: "var(--cor-alerta)",
  critico: "var(--cor-critico)",
  marca: "var(--cor-marca-clara)",
};

/** KPI em destaque: rótulo eyebrow em cima, valor grande embaixo. */
export function CartaoIndicador({
  rotulo,
  valor,
  tom = "neutro",
  nota,
}: {
  rotulo: string;
  valor: React.ReactNode;
  tom?: Tom;
  nota?: string;
}) {
  return (
    <div className="painel p-4">
      <p className="eyebrow">{rotulo}</p>
      <p
        className="numero mt-1 text-2xl font-semibold"
        style={{ color: COR_POR_TOM[tom] }}
      >
        {valor}
      </p>
      {nota && (
        <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
          {nota}
        </p>
      )}
    </div>
  );
}
