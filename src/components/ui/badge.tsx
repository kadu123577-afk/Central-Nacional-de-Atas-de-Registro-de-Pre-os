/**
 * Único componente que decide cor de estado no sistema inteiro. Nenhuma
 * tela escreve cor de severidade na mão — todo selo passa por aqui.
 *
 * "marca" é estrutural (nunca indica erro/risco); os quatro tons de
 * severidade (neutro/atencao/alerta/critico) são a única escala que
 * comunica gravidade.
 */
export type Tom = "neutro" | "atencao" | "alerta" | "critico" | "marca";

const ESTILO_POR_TOM: Record<Tom, React.CSSProperties> = {
  neutro: { color: "var(--cor-texto-2)", borderColor: "var(--cor-borda-forte)" },
  atencao: {
    color: "var(--cor-atencao)",
    borderColor: "var(--cor-atencao)",
    background: "var(--cor-atencao-fundo)",
  },
  alerta: {
    color: "var(--cor-alerta)",
    borderColor: "var(--cor-alerta)",
    background: "var(--cor-alerta-fundo)",
  },
  critico: {
    color: "var(--cor-critico)",
    borderColor: "var(--cor-critico)",
    background: "var(--cor-critico-fundo)",
  },
  marca: {
    color: "var(--cor-marca-clara)",
    borderColor: "var(--cor-marca)",
    background: "var(--cor-marca-fundo)",
  },
};

export function Badge({
  tom = "neutro",
  children,
}: {
  tom?: Tom;
  children: React.ReactNode;
}) {
  return (
    <span
      className="eyebrow inline-flex items-center rounded-full border px-2.5 py-0.5"
      style={ESTILO_POR_TOM[tom]}
    >
      {children}
    </span>
  );
}
