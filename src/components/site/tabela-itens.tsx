"use client";

import Link from "next/link";
import { useState } from "react";
import type { ItemDaAta } from "@/lib/catalogo-publico";
import { moeda, normalizar, numero, plural } from "@/lib/site/formato";
import { IconeBusca } from "./icones";
import { BarraSaldo } from "./pecas";

interface Props {
  ataId: string;
  itens: ItemDaAta[];
  /** Total de itens da ata (inclui os que ficam escondidos do visitante). */
  total: number;
  /** Equipe interna: mostra quantidade e preço e não mostra "Pedir adesão". */
  completo: boolean;
  /** Órgão logado vai direto ao pedido; visitante passa pelo login. */
  orgaoLogado: boolean;
  codigo: string;
}

function destaque(texto: string, termo: string) {
  if (!termo) return texto;
  const i = normalizar(texto).indexOf(termo);
  if (i < 0) return texto;
  return (
    <>
      {texto.slice(0, i)}
      <mark className="marca-busca">{texto.slice(i, i + termo.length)}</mark>
      {texto.slice(i + termo.length)}
    </>
  );
}

export function TabelaItens({ ataId, itens, total, completo, orgaoLogado, codigo }: Props) {
  const [busca, setBusca] = useState("");
  const termo = normalizar(busca.trim());
  const visiveis = termo ? itens.filter((i) => normalizar(i.descricao).includes(termo)) : itens;

  const info = termo
    ? `${plural(visiveis.length, "item encontrado", "itens encontrados")} de ${itens.length}`
    : `${plural(total, "item", "itens")} nesta ata`;

  function hrefPedido(item: ItemDaAta) {
    return orgaoLogado
      ? `/orgao/pedido/novo?itemId=${encodeURIComponent(item.id)}`
      : `/entrar?perfil=orgao&ata=${encodeURIComponent(ataId)}&item=${encodeURIComponent(item.id)}`;
  }

  return (
    <section className="bloco" aria-labelledby="t-itens">
      <div className="bloco__cabeca">
        <div>
          <h2 id="t-itens">Itens registrados</h2>
          <p>{info}</p>
        </div>
        <div className="bloco__busca">
          <label className="sr-only" htmlFor="busca-item">
            Buscar item nesta ata
          </label>
          <IconeBusca />
          <input
            id="busca-item"
            className="entrada"
            type="search"
            placeholder="Buscar item nesta ata"
            autoComplete="off"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>
      <div className="tabela-rolagem">
        <table className="tabela">
          <caption className="sr-only">Itens da ata {codigo}</caption>
          <thead>
            <tr>
              <th scope="col">Descrição</th>
              <th scope="col">Unidade</th>
              {completo ? (
                <th scope="col" className="num">
                  Qtd. registrada
                </th>
              ) : null}
              <th scope="col">Saldo para adesão</th>
              {completo ? (
                <th scope="col" className="num">
                  Preço unitário
                </th>
              ) : (
                <th scope="col">
                  <span className="sr-only">Ação</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((item, i) => (
              <tr key={item.id}>
                <td className="item-desc">
                  <span>{destaque(item.descricao, termo)}</span>
                  <small>Item {itens.indexOf(item) + 1}</small>
                </td>
                <td data-rotulo="Unidade">{item.unidade}</td>
                {completo ? (
                  <td className="num" data-rotulo="Qtd. registrada">
                    {item.quantidade !== undefined ? numero(item.quantidade) : ""}
                  </td>
                ) : null}
                <td className="col-saldo" data-rotulo="Saldo para adesão">
                  <BarraSaldo valor={item.saldo} rotulo="Disponível" />
                </td>
                {completo ? (
                  <td className="num" data-rotulo="Preço unitário">
                    <strong className="tab">{item.preco !== undefined ? moeda(item.preco) : ""}</strong>
                  </td>
                ) : (
                  <td className="acao">
                    <Link className="botao botao--primario botao--pequeno" href={hrefPedido(item)}>
                      Pedir adesão<span className="sr-only"> ao item {i + 1}</span>
                    </Link>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sr-only" aria-live="polite">
        {info}
      </p>
    </section>
  );
}
