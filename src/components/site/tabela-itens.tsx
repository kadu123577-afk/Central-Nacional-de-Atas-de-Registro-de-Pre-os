"use client";

import { useState } from "react";
import type { ItemDaAta } from "@/lib/catalogo-publico";
import { moeda, normalizar, numero, plural } from "@/lib/site/formato";
import { IconeBusca } from "./icones";
import { BarraSaldo } from "./pecas";

interface Props {
  itens: ItemDaAta[];
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

/**
 * Itens de uma ata, com quantidade registrada, saldo e preço. SÓ a equipe
 * interna (admin e vendedor) recebe estes dados: quem não é da equipe nem
 * chega a esta tabela, porque os itens não saem do servidor para ele.
 */
export function TabelaItens({ itens, codigo }: Props) {
  const [busca, setBusca] = useState("");
  const termo = normalizar(busca.trim());
  const visiveis = termo ? itens.filter((i) => normalizar(i.descricao).includes(termo)) : itens;

  const info = termo
    ? `${plural(visiveis.length, "item encontrado", "itens encontrados")} de ${itens.length}`
    : `${plural(itens.length, "item", "itens")} nesta ata`;

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
              <th scope="col" className="num">
                Qtd. registrada
              </th>
              <th scope="col">Saldo para adesão</th>
              <th scope="col" className="num">
                Preço unitário
              </th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((item) => (
              <tr key={item.id}>
                <td className="item-desc">
                  <span>{destaque(item.descricao, termo)}</span>
                  <small>Item {itens.indexOf(item) + 1}</small>
                </td>
                <td data-rotulo="Unidade">{item.unidade}</td>
                <td className="num" data-rotulo="Qtd. registrada">
                  {item.quantidade !== undefined ? numero(item.quantidade) : ""}
                </td>
                <td className="col-saldo" data-rotulo="Saldo para adesão">
                  <BarraSaldo valor={item.saldo} rotulo="Disponível" />
                </td>
                <td className="num" data-rotulo="Preço unitário">
                  <strong className="tab">{item.preco !== undefined ? moeda(item.preco) : ""}</strong>
                </td>
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
