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
    <div className="flex min-h-screen">
      <aside
        className="sem-impressao flex w-[232px] shrink-0 flex-col justify-between border-r p-4"
        style={{ borderColor: "var(--cor-borda)", background: "var(--cor-superficie)" }}
      >
        <div>
          <div className="px-1 pb-6">
            <Logo />
            <p className="eyebrow mt-1">{area}</p>
          </div>
          <nav className="flex flex-col gap-1">
            {itens.map((item, i) => {
              const ativo = itemAtivo(item, pathname);
              const novoGrupo = item.grupo && item.grupo !== itens[i - 1]?.grupo;
              return (
                <div key={item.href} className="flex flex-col gap-1">
                  {novoGrupo && (
                    <p className="eyebrow px-3 pb-0.5 pt-4" style={{ color: "var(--cor-texto-3)" }}>
                      {item.grupo}
                    </p>
                  )}
                  <Link
                    href={item.href}
                    aria-current={ativo ? "page" : undefined}
                    className="rounded-[var(--raio)] px-3 py-2 text-sm font-medium transition-colors"
                    style={{
                      color: ativo ? "var(--cor-marca-clara)" : "var(--cor-texto-2)",
                      background: ativo ? "var(--cor-marca-fundo)" : "transparent",
                    }}
                  >
                    {item.rotulo}
                  </Link>
                </div>
              );
            })}
          </nav>
        </div>
        {rodape && <div className="px-1">{rodape}</div>}
      </aside>

      <main className="flex-1 px-8 py-8">
        <div className={`mx-auto flex ${larguraMaxima} flex-col gap-5`}>{children}</div>
      </main>
    </div>
  );
}
