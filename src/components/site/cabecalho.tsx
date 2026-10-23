"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GRUPOS } from "@/lib/site/categorias";
import { IconeBusca, IconeCategoria, IconeFechar, IconeMenu, IconeSetaBaixo } from "./icones";

type MenuAberto = "categorias" | null;

const GRUPOS_SO_COM_ATAS = new Set(["servicos", "outros"]);

/**
 * Cabeçalho do site: busca, menu de categorias, link "Entrar" (entrada única,
 * que descobre o perfil pelo e-mail) e a gaveta do celular. Recebe só as
 * contagens de atas por grupo (dado público).
 */
export function Cabecalho({ contagens }: { contagens: Record<string, number> }) {
  const [menu, setMenu] = useState<MenuAberto>(null);
  const [gaveta, setGaveta] = useState(false);
  const botaoGaveta = useRef<HTMLButtonElement>(null);

  const grupos = GRUPOS.filter((g) => (contagens[g.id] ?? 0) > 0 || !GRUPOS_SO_COM_ATAS.has(g.id));

  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".menu")) setMenu(null);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenu(null);
        setGaveta(false);
      }
    }
    document.addEventListener("click", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("click", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = gaveta ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [gaveta]);

  function alternar(nome: Exclude<MenuAberto, null>) {
    setMenu((atual) => (atual === nome ? null : nome));
  }

  function fecharGaveta() {
    setGaveta(false);
    botaoGaveta.current?.focus();
  }

  return (
    <>
      <header className="cabecalho">
        <div className="wrap cabecalho__linha">
          <Link className="marca" href="/" aria-label="Central Nacional de Atas, página inicial">
            <Image src="/site/marca/arca-simbolo.svg" width={34} height={36} alt="" unoptimized />
            <span className="marca__nome">
              <b>Central de Atas</b>
              <span>de Registro de Preços · por ARCA Capital</span>
            </span>
          </Link>

          <form className="busca-topo" action="/catalogo" role="search">
            <label className="sr-only" htmlFor="busca-topo">
              Buscar atas por objeto ou item
            </label>
            <span className="busca-topo__icone">
              <IconeBusca />
            </span>
            <input
              id="busca-topo"
              className="entrada"
              type="search"
              name="q"
              placeholder="Buscar ata por objeto ou item"
              autoComplete="off"
            />
            <button className="botao botao--secundario" type="submit">
              Buscar
            </button>
          </form>

          <nav className="navegacao" aria-label="Principal">
            <div className="menu">
              <button
                className="menu-gatilho"
                type="button"
                aria-expanded={menu === "categorias"}
                aria-controls="menu-categorias"
                onClick={() => alternar("categorias")}
              >
                Categorias
                <IconeSetaBaixo />
              </button>
              <div
                className="menu-painel menu-painel--categorias"
                id="menu-categorias"
                hidden={menu !== "categorias"}
              >
                <h2>Atas vigentes por categoria</h2>
                <ul>
                  {grupos.map((g) => (
                    <li key={g.id}>
                      <Link href={`/catalogo?cat=${g.id}`} onClick={() => setMenu(null)}>
                        <b className="menu-cat">
                          <IconeCategoria id={g.id} />
                          {g.nome}
                        </b>
                        <span>{contagens[g.id] ?? 0}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="ver-tudo">
                  <Link href="/catalogo" onClick={() => setMenu(null)}>
                    Ver todo o catálogo
                  </Link>
                </div>
              </div>
            </div>
            <Link href="/#como-funciona">Como funciona</Link>
            <Link href="/entrar">Entrar</Link>
          </nav>

          <button
            ref={botaoGaveta}
            className="botao-menu"
            type="button"
            aria-expanded={gaveta}
            aria-controls="gaveta-menu"
            aria-label="Abrir menu"
            onClick={() => setGaveta(true)}
          >
            <IconeMenu />
          </button>
        </div>
      </header>

      {gaveta ? (
        <div className="gaveta-menu" id="gaveta-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="gaveta-menu__topo">
            <Link className="marca" href="/" onClick={fecharGaveta}>
              <Image src="/site/marca/arca-simbolo.svg" width={30} height={32} alt="" unoptimized />
              <span className="marca__nome">
                <b>Central de Atas</b>
              </span>
            </Link>
            <button
              className="botao-menu"
              type="button"
              aria-label="Fechar menu"
              style={{ display: "inline-flex" }}
              onClick={fecharGaveta}
            >
              <IconeFechar />
            </button>
          </div>
          <div className="gaveta-menu__corpo">
            <form action="/catalogo" role="search" className="campo">
              <label htmlFor="busca-gaveta">Buscar atas</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="busca-gaveta"
                  className="entrada entrada--grande"
                  type="search"
                  name="q"
                  placeholder="Objeto ou item"
                />
                <button className="botao botao--primario botao--grande" type="submit">
                  Buscar
                </button>
              </div>
            </form>
            <div>
              <h2>Acesso</h2>
              <Link className="linha" href="/entrar" onClick={fecharGaveta}>
                Entrar
              </Link>
              <Link className="linha" href="/#como-funciona" onClick={fecharGaveta}>
                Como funciona a adesão
              </Link>
            </div>
            <div>
              <h2>Categorias</h2>
              <div>
                {grupos.map((g) => (
                  <Link className="linha" key={g.id} href={`/catalogo?cat=${g.id}`} onClick={fecharGaveta}>
                    <b className="menu-cat">
                      <IconeCategoria id={g.id} />
                      {g.nome}
                    </b>
                    <span>{contagens[g.id] ?? 0}</span>
                  </Link>
                ))}
              </div>
              <Link className="linha" href="/catalogo" onClick={fecharGaveta}>
                <b>Ver todo o catálogo</b>
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
