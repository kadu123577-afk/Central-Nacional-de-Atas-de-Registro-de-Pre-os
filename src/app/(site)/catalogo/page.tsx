import type { Metadata } from "next";
import Link from "next/link";
import { listarAtas, type Ordenacao } from "@/lib/catalogo-publico";
import { grupoValido, nomeDoGrupo } from "@/lib/site/categorias";
import { numero, plural } from "@/lib/site/formato";
import { ufValida } from "@/lib/site/ufs";
import { nivelDeVisao } from "@/lib/visibilidade";
import { FiltrosCatalogo, type ChipFiltro } from "@/components/site/filtros-catalogo";
import { LivroAtas } from "@/components/site/pecas";

export const metadata: Metadata = {
  title: "Catálogo de atas de registro de preços vigentes",
  description:
    "Atas de registro de preços vigentes por categoria e objeto. Entre com o acesso do seu órgão para ver itens, vigência e saldo e pedir a adesão pela Central Nacional de Atas.",
  alternates: { canonical: "/catalogo" },
};

type Busca = Record<string, string | string[] | undefined>;

const ORDENACOES: Ordenacao[] = ["recentes", "vigencia", "saldo", "itens"];
const VIGENCIAS = ["3", "6", "9"];

function texto(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim().slice(0, 200) ?? "";
}

function montarHref(params: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return `/catalogo${q.size ? `?${q}` : ""}`;
}

export default async function PaginaCatalogo({ searchParams }: { searchParams: Promise<Busca> }) {
  const busca = await searchParams;
  const nivel = await nivelDeVisao();

  const q = texto(busca.q);
  const cat = grupoValido(texto(busca.cat)) ? texto(busca.cat) : "";
  // UF, vigência e ordenação por dados ocultos só existem para quem pode ver
  // esses dados (só a equipe). Visitante e órgão logado nunca os usam, nem
  // montando o endereço na mão.
  const detalhes = nivel === "completo";
  const uf = detalhes && ufValida(texto(busca.uf).toUpperCase()) ? texto(busca.uf).toUpperCase() : "";
  const vig = detalhes && VIGENCIAS.includes(texto(busca.vig)) ? texto(busca.vig) : "";
  const max = nivel === "completo" ? texto(busca.max) : "";
  const ordBruta = texto(busca.ord) as Ordenacao;
  const ord: Ordenacao = detalhes && ORDENACOES.includes(ordBruta) ? ordBruta : "recentes";
  const pagina = Math.max(1, parseInt(texto(busca.p), 10) || 1);

  const valorMax = max ? parseFloat(max.replace(",", ".")) : undefined;
  const resultado = await listarAtas(
    { q, grupo: cat, uf, vigMeses: vig ? Number(vig) : undefined, valorMax, ord, pagina },
    nivel,
  );

  const ativos: Record<string, string> = { q, cat, uf, vig, max, ord: ord === "recentes" ? "" : ord };
  const semFiltro = (campo: string) => montarHref({ ...ativos, [campo]: "" });

  const chips: ChipFiltro[] = [];
  if (q) chips.push({ rotulo: `Busca: ${q}`, href: semFiltro("q") });
  if (cat) chips.push({ rotulo: nomeDoGrupo(cat), href: semFiltro("cat") });
  if (uf) chips.push({ rotulo: `UF: ${uf}`, href: semFiltro("uf") });
  if (vig) chips.push({ rotulo: `Vigência acima de ${vig} meses`, href: semFiltro("vig") });
  if (max) chips.push({ rotulo: `Valor unitário até R$ ${max}`, href: semFiltro("max") });

  const total = `${plural(resultado.total, "ata vigente", "atas vigentes")}${q ? ` para “${q}”` : ""}`;

  // Janela de páginas: primeira, última e as vizinhas da atual.
  const paginasVisiveis = new Set<number>([1, resultado.paginas]);
  for (let i = resultado.pagina - 2; i <= resultado.pagina + 2; i++) {
    if (i >= 1 && i <= resultado.paginas) paginasVisiveis.add(i);
  }
  const listaPaginas = [...paginasVisiveis].sort((a, b) => a - b);
  const hrefPagina = (p: number) => montarHref({ ...ativos, p: p > 1 ? String(p) : "" });
  const primeiro = (resultado.pagina - 1) * 12 + 1;

  return (
    <>
      <header className="cabeca-pagina">
        <div className="wrap">
          <nav className="migalhas" aria-label="Você está em">
            <ol>
              <li><Link href="/">Início</Link></li>
              <li aria-current="page">Catálogo</li>
            </ol>
          </nav>
          <h1>Catálogo de atas vigentes</h1>
          <p className="cabeca-pagina__sub">
            Só aparecem atas dentro da vigência.{" "}
            {detalhes
              ? "O saldo mostra quanto ainda pode ser aderido por outros órgãos."
              : "Escolha a ata e peça a adesão: a equipe da Central confere itens, vigência e saldo para o seu órgão."}
          </p>
        </div>
      </header>

      <FiltrosCatalogo
        valores={{ q, cat, uf, vig, max, ord }}
        mostrarValor={nivel === "completo"}
        mostrarDetalhes={detalhes}
        totalTexto={total}
        chips={chips}
      >
        {resultado.atas.length === 0 ? (
          <div className="vazio" role="status">
            <h2>Nenhuma ata encontrada com esses filtros</h2>
            <p>
              Tente outro termo, amplie a vigência ou remova a UF. Se o seu órgão precisa de um objeto
              que não está no catálogo, fale com a nossa equipe.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="botao botao--secundario" href="/catalogo">
                Limpar filtros
              </Link>
              <Link
                className="botao botao--primario"
                href={`/?${new URLSearchParams({ ...(q ? { q } : {}), ...(uf ? { uf } : {}) })}#nao-achei`}
              >
                Avisar que não achei a ata
              </Link>
            </div>
          </div>
        ) : (
          <>
            <LivroAtas atas={resultado.atas} />
            {resultado.paginas > 1 ? (
              <nav className="paginacao" aria-label="Paginação">
                {resultado.pagina > 1 ? (
                  <Link href={hrefPagina(resultado.pagina - 1)} aria-label="Página anterior" className="pag-link">
                    Anterior
                  </Link>
                ) : (
                  <button type="button" disabled aria-label="Página anterior">Anterior</button>
                )}
                {listaPaginas.map((p, i) => (
                  <span key={p} style={{ display: "contents" }}>
                    {i > 0 && p - listaPaginas[i - 1] > 1 ? <span className="paginacao__info">…</span> : null}
                    <Link
                      href={hrefPagina(p)}
                      className="pag-link"
                      aria-label={`Página ${p}`}
                      aria-current={p === resultado.pagina ? "page" : undefined}
                    >
                      {p}
                    </Link>
                  </span>
                ))}
                {resultado.pagina < resultado.paginas ? (
                  <Link href={hrefPagina(resultado.pagina + 1)} aria-label="Próxima página" className="pag-link">
                    Próxima
                  </Link>
                ) : (
                  <button type="button" disabled aria-label="Próxima página">Próxima</button>
                )}
                <p className="paginacao__info tab">
                  {primeiro} a {primeiro + resultado.atas.length - 1} de {numero(resultado.total)}
                </p>
              </nav>
            ) : null}
          </>
        )}
      </FiltrosCatalogo>
    </>
  );
}
