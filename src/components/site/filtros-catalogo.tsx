"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GRUPOS } from "@/lib/site/categorias";
import { UFS } from "@/lib/site/ufs";
import { IconeFechar, IconeFiltros, IconeX } from "./icones";

export interface ChipFiltro {
  rotulo: string;
  /** Endereço da lista sem este filtro. */
  href: string;
}

interface Props {
  valores: { q: string; cat: string; uf: string; vig: string; max: string; ord: string };
  /** O filtro de valor unitário só existe para a equipe interna. */
  mostrarValor: boolean;
  /** UF, vigência e ordenação por saldo/itens/vigência: não existem para o visitante. */
  mostrarDetalhes: boolean;
  totalTexto: string;
  chips: ChipFiltro[];
  /** Resultados e paginação, já renderizados no servidor. */
  children: React.ReactNode;
}

const CAMPOS_DO_FILTRO = ["q", "cat", "uf", "vig", "max"] as const;

/**
 * Filtros do catálogo: formulário, gaveta no celular, ordenação e chips.
 * Aplicar filtros só troca o endereço (?q=&cat=&uf=...), e quem renderiza a
 * lista é o servidor — o navegador nunca recebe as atas que não aparecem.
 *
 * O visitante só filtra por texto e categoria. UF, vigência e ordenação
 * serviriam para descobrir, por tentativa, dados que ele não pode ver (em que
 * estado fica cada ata, quanto falta de vigência), então nem aparecem.
 */
export function FiltrosCatalogo({
  valores,
  mostrarValor,
  mostrarDetalhes,
  totalTexto,
  chips,
  children,
}: Props) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [aberto, setAberto] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);
  const botaoFiltros = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.body.style.overflow = aberto ? "hidden" : "";
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  function aplicar(form: HTMLFormElement) {
    const dados = new FormData(form);
    const novo = new URLSearchParams();
    for (const campo of CAMPOS_DO_FILTRO) {
      const valor = String(dados.get(campo) ?? "").trim();
      if (valor) novo.set(campo, valor);
    }
    const ord = parametros.get("ord");
    if (ord && mostrarDetalhes) novo.set("ord", ord);
    router.push(`/catalogo${novo.size ? `?${novo}` : ""}`);
    setAberto(false);
  }

  function aoOrdenar(ord: string) {
    const novo = new URLSearchParams(parametros.toString());
    novo.delete("p");
    if (ord && ord !== "recentes") novo.set("ord", ord);
    else novo.delete("ord");
    router.push(`/catalogo${novo.size ? `?${novo}` : ""}`);
  }

  return (
    <div className="wrap catalogo">
      <form
        ref={formulario}
        className={`filtros${aberto ? " aberto" : ""}`}
        id="form-filtros"
        action="/catalogo"
        aria-label="Filtros do catálogo"
        onSubmit={(e) => {
          e.preventDefault();
          aplicar(e.currentTarget);
        }}
        onChange={(e) => {
          // No computador, selects e opções valem na hora; no celular, só ao aplicar.
          const alvo = e.target as HTMLElement;
          if (window.innerWidth > 1024 && (alvo.tagName === "SELECT" || (alvo as HTMLInputElement).type === "radio")) {
            aplicar(e.currentTarget);
          }
        }}
      >
        <div className="filtros__topo">
          <h2>Filtros</h2>
          <button
            type="button"
            className="botao-menu"
            style={{ display: "inline-flex" }}
            aria-label="Fechar filtros"
            onClick={() => {
              setAberto(false);
              botaoFiltros.current?.focus();
            }}
          >
            <IconeFechar />
          </button>
        </div>

        <div className="campo">
          <label htmlFor="f-q">{mostrarDetalhes ? "Objeto ou item" : "Objeto"}</label>
          <input
            id="f-q"
            className="entrada"
            type="search"
            name="q"
            placeholder="Por exemplo medicamentos"
            autoComplete="off"
            defaultValue={valores.q}
            key={`q-${valores.q}`}
          />
        </div>
        <div className="campo">
          <label htmlFor="f-cat">Categoria</label>
          <select id="f-cat" className="selecao" name="cat" defaultValue={valores.cat} key={`cat-${valores.cat}`}>
            <option value="">Todas as categorias</option>
            {GRUPOS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </div>

        {mostrarDetalhes ? (
          <>
            <div className="campo">
              <label htmlFor="f-uf">UF do órgão gerenciador</label>
              <select id="f-uf" className="selecao" name="uf" defaultValue={valores.uf} key={`uf-${valores.uf}`}>
                <option value="">Todas as UFs</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
            <fieldset key={`vig-${valores.vig}`}>
              <legend>Vigência restante</legend>
              {[
                ["", "Qualquer prazo"],
                ["3", "Acima de 3 meses"],
                ["6", "Acima de 6 meses"],
                ["9", "Acima de 9 meses"],
              ].map(([valor, rotulo]) => (
                <label className="opcao" key={valor}>
                  <input type="radio" name="vig" value={valor} defaultChecked={valores.vig === valor} /> {rotulo}
                </label>
              ))}
            </fieldset>
          </>
        ) : null}

        {mostrarValor ? (
          <div className="campo">
            <label htmlFor="f-max">Valor unitário máximo (R$)</label>
            <input
              id="f-max"
              className="entrada"
              type="text"
              inputMode="decimal"
              name="max"
              placeholder="Por exemplo 50,00"
              defaultValue={valores.max}
              key={`max-${valores.max}`}
            />
            <span className="ajuda">Mostra atas com pelo menos um item até esse valor.</span>
          </div>
        ) : null}
        <div className="filtros__acoes">
          <button className="botao botao--primario" type="submit">
            Aplicar filtros
          </button>
          <Link className="botao botao--terciario" href="/catalogo" onClick={() => setAberto(false)}>
            Limpar filtros
          </Link>
        </div>
      </form>
      <div className="veu" hidden={!aberto} onClick={() => setAberto(false)} />

      <section id="resultados" tabIndex={-1} aria-labelledby="t-res">
        <h2 id="t-res" className="sr-only">
          Resultados
        </h2>
        <div className="barra-resultado">
          <p className="barra-resultado__total" aria-live="polite">
            {totalTexto}
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              ref={botaoFiltros}
              className="botao botao--secundario botao-filtros"
              type="button"
              aria-expanded={aberto}
              onClick={() => setAberto(true)}
            >
              <IconeFiltros />
              Filtros
            </button>
            {mostrarDetalhes ? (
              <div className="ordenar">
                <label htmlFor="ordenar">Ordenar por</label>
                <select
                  id="ordenar"
                  className="selecao"
                  value={valores.ord}
                  onChange={(e) => aoOrdenar(e.target.value)}
                >
                  <option value="recentes">Mais recentes</option>
                  <option value="vigencia">Vigência mais longa</option>
                  <option value="saldo">Maior saldo para adesão</option>
                  <option value="itens">Mais itens</option>
                </select>
              </div>
            ) : null}
          </div>
        </div>
        <div className="chips">
          {chips.map((c) => (
            <Link key={c.rotulo} className="chip" href={c.href} aria-label={`Remover filtro ${c.rotulo}`}>
              {c.rotulo}
              <IconeX />
            </Link>
          ))}
          {chips.length > 0 ? (
            <Link className="chip chip--limpar" href="/catalogo">
              Limpar filtros
            </Link>
          ) : null}
        </div>
        {children}
      </section>
    </div>
  );
}
