/**
 * Logo do site público (Is' Art): moldura aberta embaixo com o "A" e três
 * barras de gráfico, ao lado de "Central de Atas / de Registro de Preços ·
 * por ARCA Capital". Redesenhado em SVG a partir das telas da agência —
 * trocar por public/marca/logo.svg quando o vetor oficial chegar.
 *
 * tom="escuro" pro fundo claro (cabeçalho, impressão); tom="claro" pro
 * verde profundo (menu lateral, rodapé), com a moldura em dourado.
 */
export function Logo({
  tom = "escuro",
  altura = 30,
  compacto = false,
}: {
  tom?: "claro" | "escuro";
  altura?: number;
  /** Sem a linha "de Registro de Preços · por ARCA Capital". */
  compacto?: boolean;
}) {
  const corMoldura = tom === "claro" ? "var(--cor-ouro-claro)" : "var(--cor-texto)";
  const corBarras = tom === "claro" ? "var(--cor-marca-viva)" : "var(--cor-marca)";
  const corNome = tom === "claro" ? "var(--cor-superficie)" : "var(--cor-texto)";
  const corSub = tom === "claro" ? "var(--cor-profundo-texto-2)" : "var(--cor-texto-3)";

  return (
    <span className="inline-flex items-center gap-2.5" style={{ height: altura }}>
      <svg width={altura} height={altura} viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path d="M3 38V3h34v35" stroke={corMoldura} strokeWidth="2.6" strokeLinejoin="miter" />
        <path d="M7 38 20 12l13 26" stroke={corMoldura} strokeWidth="2.6" strokeLinejoin="miter" />
        <rect x="16" y="31" width="2" height="7" fill={corBarras} />
        <rect x="19.5" y="27.5" width="2" height="10.5" fill={corBarras} />
        <rect x="23" y="30" width="2" height="8" fill={corBarras} />
      </svg>
      <span className="flex flex-col justify-center leading-none">
        <span
          className="font-extrabold"
          style={{ color: corNome, fontSize: altura * 0.52, letterSpacing: "-0.03em" }}
        >
          Central de Atas
        </span>
        {!compacto && (
          <span className="mt-[3px] whitespace-nowrap" style={{ color: corSub, fontSize: altura * 0.37 }}>
            de Registro de Preços · por ARCA Capital
          </span>
        )}
      </span>
    </span>
  );
}
