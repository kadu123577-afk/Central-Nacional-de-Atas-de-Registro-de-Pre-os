/**
 * Aproximação do losango da marca Tech 10 em SVG (não é o arquivo vetorial
 * oficial — recriado a partir do material de marca em PNG. Trocar por
 * public/marca/logo.svg assim que o arquivo oficial existir).
 *
 * tom="claro" pro fundo escuro do app; tom="escuro" pra impressão em
 * papel branco.
 */
export function Logo({
  tom = "claro",
  altura = 22,
}: {
  tom?: "claro" | "escuro";
  altura?: number;
}) {
  const cor = tom === "claro" ? "#9ef01a" : "#0d2420";
  const corTexto = tom === "claro" ? "var(--cor-texto)" : "#0d2420";

  return (
    <span className="inline-flex items-center gap-2" style={{ height: altura }}>
      <svg
        width={altura}
        height={altura}
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="4"
          y="14"
          width="10"
          height="10"
          transform="rotate(45 9 19)"
          fill={cor}
        />
        <rect
          x="14"
          y="6"
          width="20"
          height="20"
          transform="rotate(45 24 16)"
          stroke={cor}
          strokeWidth="3"
        />
      </svg>
      <span className="marca text-base" style={{ color: corTexto }}>
        Central de Atas
      </span>
    </span>
  );
}
