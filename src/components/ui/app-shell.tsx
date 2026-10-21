"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";

export interface ItemNav {
  rotulo: string;
  href: string;
  /** Cabeçalho de grupo: aparece quando muda de um item pro outro (fase 2 de design). */
  grupo?: string;
  /** Prefixos de rota que também marcam este item como ativo (páginas filhas). */
  ativoEm?: string[];
}

/** Raízes ("/admin", "/vendedor") só ficam ativas na página exata; as demais valem pras páginas filhas. */
function itemAtivo(item: ItemNav, pathname: string): boolean {
  if (pathname === item.href) return true;
  const raiz = item.href === "/admin" || item.href === "/vendedor";
  if (!raiz && pathname.startsWith(`${item.href}/`)) return true;
  return (item.ativoEm ?? []).some((prefixo) => pathname === prefixo || pathname.startsWith(`${prefixo}/`));
}

/**
 * Casca das áreas logadas. O menu lateral usa o verde profundo e o dourado
 * do rodapé do site; a área de trabalho fica clara, com os cartões brancos.
 */
export function AppShell({
  area,
  itens,
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
              const ativo = itemAtivo(item, pathname);
              const novoGrupo = item.grupo && item.grupo !== itens[i - 1]?.grupo;
              return (
                <div key={item.href} className="flex flex-col gap-0.5 max-md:shrink-0">
                  {novoGrupo && <p className="app-menu-grupo max-md:hidden">{item.grupo}</p>}
                  <Link
                    href={item.href}
                    aria-current={ativo ? "page" : undefined}
                    className="app-menu-item max-md:whitespace-nowrap"
                  >
                    {item.rotulo}
                  </Link>
                </div>
              );
            })}
          </nav>
        </div>
        {rodape && <div className="app-menu-rodape">{rodape}</div>}
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-9">
        <div className={`mx-auto flex ${larguraMaxima} flex-col gap-6`}>{children}</div>
      </main>
    </div>
  );
}
