"use client";

import { useActionState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { rotuloDaCategoria } from "@/lib/categorias";
import { conferirItens, gravarItens, type EstadoImportacaoItens } from "./actions";

const estadoInicial: EstadoImportacaoItens = {};

const EXEMPLO = "Descrição;Unidade;Quantidade;Valor unitário;Marca;Categoria;Código do catálogo\nPapel sulfite A4;Caixa;100;25,90;;Material de escritório;";

/** Importação em duas etapas: conferir (nada é gravado) e gravar (tudo ou nada). */
export function ImportarItens({ ataId, itensNaAta }: { ataId: string; itensNaAta: number }) {
  const [conferido, conferir, conferindo] = useActionState(conferirItens.bind(null, ataId), estadoInicial);
  const [gravado, gravar, gravando] = useActionState(gravarItens.bind(null, ataId), estadoInicial);

  const previa = conferido.previa;
  const podeGravar = Boolean(previa && previa.erros.length === 0 && previa.itens.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
        Copie as células da planilha (com a primeira linha de cabeçalho) e cole abaixo, ou envie um arquivo CSV.
        Colunas obrigatórias: descrição, unidade, quantidade e valor unitário. Marca, categoria e código do
        catálogo são opcionais.
        {itensNaAta > 0 && ` A ata já tem ${itensNaAta} item(ns): a importação acrescenta, não substitui.`}
      </p>

      <form action={conferir} className="flex flex-col gap-3">
        <label className="block">
          <span className="rotulo-campo">Planilha colada</span>
          <textarea
            name="planilha"
            rows={7}
            className="campo-atas font-mono text-[12.5px]"
            placeholder={EXEMPLO}
            defaultValue={conferido.texto ?? ""}
            key={conferido.texto ?? "vazio"}
          />
        </label>
        <label className="block">
          <span className="rotulo-campo">
            ou arquivo CSV <small>(opcional; vale no lugar do texto colado)</small>
          </span>
          <input name="arquivo" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="campo-atas" />
        </label>
        {conferido.erro && <Aviso tom="critico">{conferido.erro}</Aviso>}
        <button type="submit" disabled={conferindo} className="botao-atas secundario self-start">
          {conferindo ? "Conferindo..." : "Conferir planilha"}
        </button>
      </form>

      {previa && (
        <div className="flex flex-col gap-3">
          {previa.erros.length > 0 ? (
            <Aviso tom="critico" titulo={`${previa.erros.length} problema(s) na planilha. Nada foi gravado.`}>
              <ul className="mt-1 list-disc pl-5">
                {previa.erros.slice(0, 30).map((e) => (
                  <li key={`${e.linha}-${e.mensagem}`}>
                    {e.linha > 0 ? `Linha ${e.linha}: ` : ""}
                    {e.mensagem}
                  </li>
                ))}
                {previa.erros.length > 30 && <li>… e mais {previa.erros.length - 30}.</li>}
              </ul>
            </Aviso>
          ) : (
            <Aviso tom="atencao">
              {previa.itens.length} item(ns) prontos para gravar. Confira a lista e grave.
            </Aviso>
          )}

          {previa.itens.length > 0 && (
            <div className="moldura-tabela">
              <table className="tabela-atas min-w-[640px]">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Descrição</th>
                    <th>Unidade</th>
                    <th>Quantidade</th>
                    <th>Valor unitário</th>
                    <th>Categoria</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.itens.slice(0, 50).map((i) => (
                    <tr key={i.linha}>
                      <td className="numero">{i.linha}</td>
                      <td>{i.descricao}</td>
                      <td>{i.unidade}</td>
                      <td className="numero">{i.quantidadeRegistrada.toLocaleString("pt-BR")}</td>
                      <td className="numero">R$ {Number(i.valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td>{rotuloDaCategoria(i.categoria)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previa.itens.length > 50 && (
                <p className="px-3 py-2 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  Mostrando os 50 primeiros de {previa.itens.length}.
                </p>
              )}
            </div>
          )}

          {podeGravar && (
            <form action={gravar} className="flex flex-col gap-2">
              <input type="hidden" name="planilha" value={conferido.texto ?? ""} />
              <button type="submit" disabled={gravando} className="botao-atas self-start">
                {gravando ? "Gravando..." : `Gravar ${previa.itens.length} item(ns)`}
              </button>
            </form>
          )}
        </div>
      )}

      {gravado.erro && <Aviso tom="critico">{gravado.erro}</Aviso>}
      {gravado.gravados !== undefined && (
        <Aviso tom="sucesso">{gravado.gravados} item(ns) gravados na ata. A lista acima já está atualizada.</Aviso>
      )}
    </div>
  );
}
