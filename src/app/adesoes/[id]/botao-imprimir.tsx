"use client";

export function BotaoImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="botao-atas secundario">
      Imprimir / gerar PDF
    </button>
  );
}
