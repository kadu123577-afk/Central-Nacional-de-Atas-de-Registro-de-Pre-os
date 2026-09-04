"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { CATEGORIAS_ATAS } from "@/lib/categorias";

export function BarraTopo() {
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(evento.target as Node)) {
        setMenuAberto(false);
      }
    }
    document.addEventListener("click", aoClicarFora);
    return () => document.removeEventListener("click", aoClicarFora);
  }, []);

  return (
    <header
      className="sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b px-6 py-3"
      style={{
        background: "color-mix(in srgb, var(--cor-fundo) 85%, transparent)",
        backdropFilter: "blur(8px)",
        borderColor: "var(--cor-borda)",
      }}
    >
      <div className="order-1 shrink-0">
        <Logo altura={26} />
      </div>

      {/* Categorias — segunda linha no mobile (não disputa espaço com a
          busca), volta pra mesma linha a partir de md. Quebra linha em vez
          de rolar horizontalmente: com a lista podendo crescer (hoje 8
          temas, mais no futuro), rolagem com um degradê fixo por cima
          acabava escondendo permanentemente o último item em telas largas
          onde nem havia overflow de verdade. */}
      <div className="order-3 w-full min-w-0 md:order-2 md:w-auto md:flex-1">
        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          {CATEGORIAS_ATAS.map((c) => (
            <Link
              key={c.slug}
              href={`/catalogo?categoria=${encodeURIComponent(c.rotulo)}`}
              className="eyebrow whitespace-nowrap"
              style={{ color: "var(--cor-texto-2)" }}
            >
              {c.rotuloCurto ?? c.rotulo}
            </Link>
          ))}
        </nav>
      </div>

      <div className="order-2 ml-auto flex items-center gap-2 md:order-3 md:ml-0">
        <form action="/catalogo" method="GET" className="flex items-center gap-2">
          <input name="q" placeholder="Buscar item..." className="campo-atas w-40 md:w-56" />
        </form>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuAberto((aberto) => !aberto)}
            className="botao-atas secundario px-3 py-2"
            aria-label="Menu de acesso"
          >
            ⋯
          </button>
          {menuAberto && (
            <div className="painel absolute right-0 top-full mt-2 flex w-56 flex-col gap-1 p-2">
              <Link
                href="/fornecedor/login"
                className="rounded-[var(--raio)] px-3 py-2 text-sm"
                style={{ color: "var(--cor-texto-2)" }}
              >
                Painel do fornecedor
              </Link>
              <Link
                href="/admin/login"
                className="rounded-[var(--raio)] px-3 py-2 text-sm"
                style={{ color: "var(--cor-texto-2)" }}
              >
                Painel administrativo
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
