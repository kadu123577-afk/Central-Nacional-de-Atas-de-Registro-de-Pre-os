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
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white px-6 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">
          Usamos apenas cookies estritamente necessários para manter sua sessão de login. Não
          usamos cookies de rastreamento ou publicidade.{" "}
          <Link href="/politica-privacidade" className="underline">
            Saiba mais
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={fechar}
          className="shrink-0 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
