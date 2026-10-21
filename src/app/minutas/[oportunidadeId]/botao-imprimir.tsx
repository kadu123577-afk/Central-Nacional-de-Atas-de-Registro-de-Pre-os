"use client";

/** Imprime o kit inteiro; no diálogo do navegador dá para "Salvar como PDF". */
export function BotaoImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="botao-atas">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4.5 6V2.5h7V6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <rect x="2" y="6" width="12" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4.5 9.5h7v4h-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      Imprimir / gerar PDF
    </button>
  );
}
