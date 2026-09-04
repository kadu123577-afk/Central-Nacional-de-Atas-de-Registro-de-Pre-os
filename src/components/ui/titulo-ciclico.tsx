"use client";

import { useEffect, useState } from "react";

/**
 * Troca de palavra em loop dentro de uma frase (ex: "Adesão simples/segura/
 * auditável a atas..."). CSS puro, sem framer-motion — respeita
 * prefers-reduced-motion (globals.css desativa a transição pra quem pediu
 * menos movimento).
 */
export function TituloCiclico({
  palavras,
  intervaloMs = 2200,
}: {
  palavras: string[];
  intervaloMs?: number;
}) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (palavras.length <= 1) return;
    const id = setInterval(() => {
      setIndice((atual) => (atual + 1) % palavras.length);
    }, intervaloMs);
    return () => clearInterval(id);
  }, [palavras.length, intervaloMs]);

  return (
    <span
      className="titulo-ciclico-palavra inline-block font-medium"
      style={{ color: "var(--cor-marca-clara)" }}
      key={indice}
    >
      {palavras[indice]}
    </span>
  );
}
