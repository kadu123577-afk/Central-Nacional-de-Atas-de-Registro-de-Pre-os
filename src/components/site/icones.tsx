import type { ReactNode } from "react";

/** Ícones do site público (desenho do designer, traço 1,6 em currentColor). */

const base = { fill: "none", "aria-hidden": true as const };

export function IconeBusca({ largura = 20 }: { largura?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={largura} height={largura} {...base}>
      <circle cx="9" cy="9" r="5.8" stroke="currentColor" strokeWidth="1.6" />
      <path d="m13.5 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconeSeta() {
  return (
    <svg viewBox="0 0 16 16" {...base}>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconeSetaBaixo() {
  return (
    <svg viewBox="0 0 14 14" {...base}>
      <path d="M3 5.2 7 9l4-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconeRelogio() {
  return (
    <svg viewBox="0 0 16 16" {...base}>
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.6V8l2.3 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconeTriangulo() {
  return (
    <svg viewBox="0 0 16 16" {...base}>
      <path d="M8 2.2 14.5 13.5h-13L8 2.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.5v3M8 11.6v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconeX() {
  return (
    <svg viewBox="0 0 16 16" {...base}>
      <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconeFechar() {
  return (
    <svg viewBox="0 0 20 20" {...base}>
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconeMenu() {
  return (
    <svg viewBox="0 0 20 20" {...base}>
      <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconeFiltros() {
  return (
    <svg viewBox="0 0 16 16" {...base}>
      <path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconeInfo() {
  return (
    <svg viewBox="0 0 20 20" {...base}>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9v4.5M10 6.4v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function IconeCadeado({ estilo }: { estilo?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 16 16" style={estilo} {...base}>
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconeMais() {
  return (
    <svg viewBox="0 0 18 18" {...base}>
      <path d="M9 3.5v11M3.5 9h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Símbolos das categorias: traço 1,6 com preenchimento suave (classe "f"). */
const ICONES_CATEGORIA: Record<string, ReactNode> = {
  saude: (
    <>
      <g transform="rotate(-45 12 12)">
        <rect className="f" x="3.5" y="8.25" width="17" height="7.5" rx="3.75" />
        <path d="M12 8.25v7.5" />
      </g>
      <path d="M17.5 3.5v3M16 5h3" />
    </>
  ),
  alimentos: (
    <>
      <path className="f" d="M12 8c-1.7-1.3-5.8-1.4-6.6 2.7-.8 3.8 1.7 8.8 4.2 9.3.9.2 1.6-.4 2.4-.4s1.5.6 2.4.4c2.5-.5 5-5.5 4.2-9.3C17.8 6.6 13.7 6.7 12 8Z" />
      <path d="M12 8c0-2.1.8-3.5 2.6-4.3" />
    </>
  ),
  informatica: (
    <>
      <rect className="f" x="3.5" y="4.5" width="17" height="11.5" rx="1.8" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
  escritorio: (
    <>
      <path className="f" d="M6.5 3.5h8l3 3v14h-11z" />
      <path d="M14.5 3.5v3h3M9 11h6M9 14h6M9 17h3.5" />
    </>
  ),
  mobiliario: (
    <>
      <rect className="f" x="7" y="3.5" width="10" height="8" rx="1.5" />
      <path d="M5.5 11.5h13v3h-13zM7.5 14.5V20.5M16.5 14.5V20.5" />
    </>
  ),
  limpeza: (
    <>
      <path className="f" d="M8 10.5h7v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z" />
      <path d="M9.5 10.5v-3h4v3M13.5 8h2.8l1.4-2.2M16.5 4h2" />
      <path d="M19.5 7.5h.01M20.5 10h.01" />
    </>
  ),
  veiculos: (
    <>
      <path className="f" d="M3 6.5h10.5v9.5H3zM13.5 9.5h4l3 3.2V16h-7z" />
      <circle cx="7" cy="17.5" r="1.9" />
      <circle cx="17" cy="17.5" r="1.9" />
    </>
  ),
  iluminacao: (
    <>
      <path d="M7 21V8.5a4.5 4.5 0 0 1 4.5-4.5H14" />
      <path className="f" d="M12.5 3.5h5l1.8 3.6h-8.6z" />
      <path d="M15 9.5v1.2M12.8 9.8l-.6 1M17.2 9.8l.6 1M4.5 21h5" />
    </>
  ),
  obras: (
    <>
      <path className="f" d="M4.5 16a7.5 7.5 0 0 1 15 0z" />
      <path d="M3.5 16h17v2.5h-17zM10.5 8.6V6h3v2.6" />
    </>
  ),
  uniformes: (
    <path
      className="f"
      d="M8.5 4 4 6.5l1.8 3.8 2.2-1V20h8V9.3l2.2 1L20 6.5 15.5 4c-.5 1.4-1.9 2.3-3.5 2.3S9 5.4 8.5 4Z"
    />
  ),
  pneus: (
    <>
      <circle className="f" cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
    </>
  ),
  eventos: (
    <>
      <path className="f" d="M3.5 19.5 12 5l8.5 14.5z" />
      <path d="M12 5V3M12 5v14.5M9 19.5l3-5 3 5" />
    </>
  ),
  /* Grupos acrescentados pelo sistema (o pacote do designer não os previa). */
  servicos: (
    <>
      <rect className="f" x="4" y="7.5" width="16" height="12" rx="2" />
      <path d="M9 7.5V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8v1.7M4 12.5h16" />
    </>
  ),
};

export function IconeCategoria({ id }: { id: string }) {
  return (
    <svg className="ico-cat" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICONES_CATEGORIA[id] ?? <circle className="f" cx="12" cy="12" r="7" />}
    </svg>
  );
}
