"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { CATEGORIAS_ATAS } from "@/lib/categorias";

type Menu = "categorias" | "entrar" | null;

function Seta() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Cabeçalho público, igual ao do site: logo, busca com botão e menus. */
export function BarraTopo() {
  const [menu, setMenu] = useState<Menu>(null);
  const barraRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (barraRef.current && !barraRef.current.contains(evento.target as Node)) {
        setMenu(null);
      }
    }
    document.addEventListener("click", aoClicarFora);
    return () => document.removeEventListener("click", aoClicarFora);
  }, []);

  const alternar = (qual: Exclude<Menu, null>) => setMenu((atual) => (atual === qual ? null : qual));

  return (
    <header className="site-topo">
      <div ref={barraRef} className="site-topo-interno">
        <Link href="/" className="shrink-0" aria-label="Central de Atas — início">
          <Logo />
        </Link>

        <form action="/catalogo" method="GET" className="site-busca order-3 w-full md:order-none md:w-auto">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
            <path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input name="q" placeholder="Buscar ata por objeto ou item" aria-label="Buscar ata por objeto ou item" />
          <button type="submit">Buscar</button>
        </form>

        <nav className="site-topo-nav">
          <div className="relative">
            <button
              type="button"
              className="site-topo-link"
              aria-expanded={menu === "categorias"}
              onClick={() => alternar("categorias")}
            >
              Categorias <Seta />
            </button>
            {menu === "categorias" && (
              <div className="site-menu site-menu-categorias">
                {CATEGORIAS_ATAS.map((c) => (
                  <Link key={c.slug} href={`/catalogo?categoria=${encodeURIComponent(c.slug)}`} onClick={() => setMenu(null)}>
                    {c.rotulo}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <Link href="/ajuda" className="site-topo-link">
            Como funciona
          </Link>
          <div className="relative">
            <button
              type="button"
              className="site-topo-link"
              aria-expanded={menu === "entrar"}
              onClick={() => alternar("entrar")}
            >
              Entrar <Seta />
            </button>
            {menu === "entrar" && (
              <div className="site-menu right-0 w-56">
                <Link href="/fornecedor/login" onClick={() => setMenu(null)}>
                  Painel do fornecedor
                </Link>
                <Link href="/admin/login" onClick={() => setMenu(null)}>
                  Painel administrativo
                </Link>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
