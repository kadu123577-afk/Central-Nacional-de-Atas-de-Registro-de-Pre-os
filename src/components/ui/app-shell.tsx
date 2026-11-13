"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { temAlguma, type Permissao } from "@/lib/permissoes";
import { AbasDePagina } from "./abas-de-pagina";
import { Logo } from "./logo";
import { usePermissoesDoAdmin } from "./permissoes-contexto";

/** Uma tela dentro de uma entrada do menu (vira uma aba no topo da página). */
export interface AbaDoItem {
  rotulo: string;
  href: string;
  /** Prefixos de rota que também marcam esta aba como ativa (páginas filhas). */
  ativoEm?: string[];
  /** Só aparece para quem tem pelo menos uma destas permissões. */
  permissoes?: readonly Permissao[];
}

export interface ItemNav {
  rotulo: string;
  href: string;
  /** Cabeçalho de grupo: aparece quando muda de um item pro outro (fase 2 de design). */
  grupo?: string;
  /** Prefixos de rota que também marcam este item como ativo (páginas filhas). */
  ativoEm?: string[];
  /** Só aparece para quem tem pelo menos uma destas permissões (menu do admin). */
  permissoes?: readonly Permissao[];
  /**
   * Entrada que reúne várias telas (14/11/2026): o menu lateral mostra uma linha só, que leva à
   * primeira aba que a pessoa pode ver, e a página mostra as abas no topo. Cada aba tem a sua
   * permissão; a entrada some se a pessoa não vê nenhuma. Os endereços das telas não mudam.
   */
  abas?: readonly AbaDoItem[];
}

/** Raízes ("/admin", "/vendedor") só ficam ativas na página exata; as demais valem pras páginas filhas. */
function rotaAtiva(href: string, ativoEm: readonly string[] | undefined, pathname: string): boolean {
  if (pathname === href) return true;
  const raiz = href === "/admin" || href === "/vendedor";
  if (!raiz && pathname.startsWith(`${href}/`)) return true;
  return (ativoEm ?? []).some((prefixo) => pathname === prefixo || pathname.startsWith(`${prefixo}/`));
}

/**
 * Casca das áreas logadas. O menu lateral usa o verde profundo e o dourado
 * do rodapé do site; a área de trabalho fica clara, com os cartões brancos.
 */
export function AppShell({
  area,
  itens: todosOsItens,
  rodape,
  children,
  // Telas de formulário/texto corrido ficam melhores estreitas (leitura);
  // um Kanban de várias colunas precisa da tela inteira, senão as colunas
  // ficam espremidas e sobra vão enorme nas laterais.
  larguraMaxima = "max-w-4xl",
}: {
  area: string;
  itens: ItemNav[];
  rodape?: React.ReactNode;
  children: React.ReactNode;
  larguraMaxima?: string;
}) {
  const pathname = usePathname();
  const permissoes = usePermissoesDoAdmin();
  // Sem permissões no contexto (área de vendedor, tela de login) o menu aparece inteiro.
  const pode = (exigidas?: readonly Permissao[]) => !exigidas || permissoes === null || temAlguma(permissoes, exigidas);

  const itens = todosOsItens
    .map((item) => (item.abas ? { ...item, abas: item.abas.filter((aba) => pode(aba.permissoes)) } : item))
    .filter((item) => (item.abas ? item.abas.length > 0 : pode(item.permissoes)));

  const ativoDoItem = (item: ItemNav) =>
    item.abas ? item.abas.some((aba) => rotaAtiva(aba.href, aba.ativoEm, pathname)) : rotaAtiva(item.href, item.ativoEm, pathname);

  // As abas da página: as da entrada onde a pessoa está, se tiver mais de uma que ela possa ver.
  const entradaAtual = itens.find((item) => item.abas && ativoDoItem(item));
  const abasDaPagina = entradaAtual?.abas && entradaAtual.abas.length > 1 ? entradaAtual.abas : null;
  // A aba da página: a de endereço exato; na falta dela, a que casa por prefixo (página filha).
  const abaAtiva =
    abasDaPagina?.find((aba) => aba.href === pathname)?.href ??
    abasDaPagina?.find((aba) => rotaAtiva(aba.href, aba.ativoEm, pathname))?.href ??
    "";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Em telas estreitas o menu vira uma faixa no topo, com os itens em linha rolável. */}
      <aside className="app-menu sem-impressao">
        <div className="min-w-0">
          <div className="px-2 pb-7 pt-1 max-md:pb-3">
            <Logo tom="claro" altura={30} compacto />
            <p className="app-menu-area">{area}</p>
          </div>
          <nav className="flex flex-col gap-0.5 max-md:flex-row max-md:overflow-x-auto max-md:pb-1" aria-label={`Menu de ${area}`}>
            {itens.map((item, i) => {
              const ativo = ativoDoItem(item);
              const novoGrupo = item.grupo && item.grupo !== itens[i - 1]?.grupo;
              // Entrada com abas leva à primeira aba que a pessoa pode ver.
              const destino = item.abas ? item.abas[0].href : item.href;
              return (
                <div key={item.href} className="flex flex-col gap-0.5 max-md:shrink-0">
                  {novoGrupo && <p className="app-menu-grupo max-md:hidden">{item.grupo}</p>}
                  <Link
                    href={destino}
                    aria-current={ativo ? "page" : undefined}
                    className="app-menu-item max-md:whitespace-nowrap"
                  >
                    {/* Com uma aba só, o menu mostra o nome dela: "Adesões", não "Negociações e adesões". */}
                    {item.abas?.length === 1 ? item.abas[0].rotulo : item.rotulo}
                  </Link>
                </div>
              );
            })}
          </nav>
        </div>
        {rodape && <div className="app-menu-rodape">{rodape}</div>}
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-9">
        <div className={`mx-auto flex ${larguraMaxima} flex-col gap-6`}>
          {abasDaPagina && <AbasDePagina abas={abasDaPagina} ativa={abaAtiva} />}
          {children}
        </div>
      </main>
    </div>
  );
}
