"use client";

import Link from "next/link";

/**
 * Página de erro inesperado (14/11/2026): em produção ninguém vê a pilha do erro nem texto em
 * inglês. A pessoa recebe uma mensagem clara, pode tentar de novo ou voltar à entrada, e o
 * código do erro (digest) serve para a equipe achar a causa no log.
 */
export default function ErroDaPagina({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-6 py-14"
      style={{ background: "var(--cor-fundo)", color: "var(--cor-texto)" }}
    >
      <div className="max-w-lg text-center">
        <p className="eyebrow">Algo deu errado</p>
        <h1 className="marca mt-3 text-3xl" style={{ fontWeight: 800, letterSpacing: "-0.03em" }}>
          Não foi possível concluir esta ação
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
          Nada do que você fez foi perdido por causa deste erro. Tente de novo; se continuar, volte à entrada e
          avise a equipe da Central informando o código abaixo.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs" style={{ color: "var(--cor-texto-3)" }}>
            Código do erro: <span className="codigo">{error.digest}</span>
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" className="botao-atas" onClick={() => retry()}>
            Tentar de novo
          </button>
          <Link href="/entrar" className="botao-atas secundario">
            Voltar à entrada
          </Link>
        </div>
      </div>
    </main>
  );
}
