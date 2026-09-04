"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const CHAVE_ARMAZENAMENTO = "aviso-cookies-fechado";

export function AvisoCookies() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    // Lê localStorage só depois de montar no cliente, pra não divergir do
    // HTML renderizado no servidor (que não tem acesso a localStorage).
    try {
      if (!localStorage.getItem(CHAVE_ARMAZENAMENTO)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- decide visibilidade só após checar localStorage no cliente
        setVisivel(true);
      }
    } catch {
      // localStorage indisponível (ex: navegação privada) — não mostra o
      // aviso em vez de quebrar a página.
    }
  }, []);

  function fechar() {
    setVisivel(false);
    try {
      localStorage.setItem(CHAVE_ARMAZENAMENTO, "1");
    } catch {
      // sem persistência, o aviso volta a aparecer na próxima visita — ok.
    }
  }

  if (!visivel) return null;

  return (
    <div
      className="sem-impressao fixed inset-x-0 bottom-0 z-50 border-t px-6 py-4"
      style={{
        borderColor: "var(--cor-borda)",
        background: "var(--cor-superficie)",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.3)",
      }}
    >
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Usamos apenas cookies estritamente necessários para manter sua sessão de login. Não
          usamos cookies de rastreamento ou publicidade.{" "}
          <Link href="/politica-privacidade" className="underline">
            Saiba mais
          </Link>
          .
        </p>
        <button type="button" onClick={fechar} className="botao-atas shrink-0">
          Entendi
        </button>
      </div>
    </div>
  );
}
