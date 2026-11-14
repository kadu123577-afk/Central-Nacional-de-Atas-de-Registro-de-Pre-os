"use client";

import { useActionState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { rotuloDaCategoria } from "@/lib/categorias";
import { conferirItens, gravarItens, type EstadoImportacaoItens } from "./actions";
import { formatarValorUnitario } from "@/lib/valor-unitario";

const estadoInicial: EstadoImportacaoItens = {};

const EXEMPLO = "Descrição;Unidade;Quantidade;Valor unitário;Marca;Categoria;Código do catálogo\nPapel sulfite A4;Caixa;100;25,90;;Material de escritório;";

/** Um documento já anexado à ata (o que o captador enviou no cadastro). */
export interface DocumentoParaLer {
  id: string;
  nomeArquivo: string;
  tamanhoKb: number;
  /** PDF ou Excel: os formatos que dá para ler. */
  legivel: boolean;
}

/**
 * Importação em duas etapas: conferir (nada é gravado) e gravar (tudo ou nada). A fonte pode ser um
 * arquivo Excel ou PDF, o documento já anexado à ata ou o texto colado; tudo vira o mesmo texto de
 * planilha no campo, para a pessoa conferir e corrigir antes de gravar.
 */
export function ImportarItens({
  ataId,
  itensNaAta,
  documentos = [],
  podeBuscarNoPncp = false,
}: {
  ataId: string;
  itensNaAta: number;
  documentos?: DocumentoParaLer[];
  /** A ata tem o link (ou o número) do PNCP: dá para buscar os itens de lá. */
  podeBuscarNoPncp?: boolean;
}) {
  const [conferido, conferir, conferindo] = useActionState(conferirItens.bind(null, ataId), estadoInicial);
  const [gravado, gravar, gravando] = useActionState(gravarItens.bind(null, ataId), estadoInicial);

  const previa = conferido.previa;
  const podeGravar = Boolean(previa && previa.erros.length === 0 && previa.itens.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
        Envie o <b>Excel (.xlsx)</b> ou o <b>PDF</b> com os itens, use o documento que já está anexado à ata, ou cole as
        células da planilha. O que for lido aparece no campo abaixo para você conferir e corrigir antes de gravar. No
        Excel, as colunas obrigatórias são descrição, unidade, quantidade e valor unitário (marca, categoria e código do
        catálogo são opcionais). O PDF precisa ter texto (não vale PDF escaneado).
        {itensNaAta > 0 && ` A ata já tem ${itensNaAta} item(ns): a importação acrescenta, não substitui.`}
      </p>

      <form action={conferir} className="flex flex-col gap-3">
        {podeBuscarNoPncp && (
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--raio-grande)] border p-3 text-sm" style={{ borderColor: "var(--cor-borda)" }}>
            <span className="rotulo-campo">Ata no PNCP</span>
            <button type="submit" name="fonte" value="pncp" className="botao-atas secundario pequeno" disabled={conferindo}>
              {conferindo ? "Buscando..." : "Buscar os itens no PNCP"}
            </button>
            <span className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
              Traz só os itens que a empresa da ata ganhou, ao valor homologado. Confira antes de gravar.
            </span>
          </div>
        )}
        {documentos.length > 0 && (
          <div className="flex flex-col gap-2 rounded-[var(--raio-grande)] border p-3" style={{ borderColor: "var(--cor-borda)" }}>
            <span className="rotulo-campo">Documentos anexados à ata</span>
            {documentos.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 text-sm">
                <a href={`/api/documentos/${d.id}`} className="botao-atas link" target="_blank" rel="noopener noreferrer">
                  {d.nomeArquivo}
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
                <span className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  {d.tamanhoKb.toLocaleString("pt-BR")} KB
                </span>
                {d.legivel ? (
                  <button type="submit" name="documentoId" value={d.id} className="botao-atas secundario pequeno" disabled={conferindo}>
                    {conferindo ? "Lendo..." : "Ler os itens deste documento"}
                  </button>
                ) : (
                  <span className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    (imagem: dá para consultar, não para importar)
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
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
            ou arquivo Excel (.xlsx), PDF ou CSV <small>(opcional; vale no lugar do texto colado)</small>
          </span>
          <input
            name="arquivo"
            type="file"
            accept=".xlsx,.pdf,.csv,.tsv,.txt,application/pdf,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="campo-atas"
          />
        </label>
        {conferido.erro && <Aviso tom="critico">{conferido.erro}</Aviso>}
        <button type="submit" disabled={conferindo} className="botao-atas secundario self-start">
          {conferindo ? "Conferindo..." : "Conferir planilha"}
        </button>
      </form>

      {conferido.aviso && <Aviso tom="info">{conferido.aviso}</Aviso>}
      {conferido.naoLidas && conferido.naoLidas.length > 0 && (
        <Aviso tom="atencao" titulo="Linhas do PDF que não pareciam item.">
          Se alguma for item, digite no campo acima (descrição, unidade, quantidade e valor) e confira de novo.
          <ul className="mt-1 list-disc pl-5 text-[13px]">
            {conferido.naoLidas.map((l, i) => (
              <li key={`${i}-${l}`}>{l}</li>
            ))}
          </ul>
        </Aviso>
      )}

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
                      <td className="numero">{formatarValorUnitario(Number(i.valorUnitario))}</td>
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
