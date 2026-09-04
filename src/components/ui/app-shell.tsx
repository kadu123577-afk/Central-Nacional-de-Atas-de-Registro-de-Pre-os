"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";

export interface ItemNav {
  rotulo: string;
  href: string;
}

export function AppShell({
  area,
  itens,
  rodape,
  children,
}: {
  area: string;
  itens: ItemNav[];
  rodape?: React.ReactNode;
  children: React.ReactNode;
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
            {itens.map((item) => {
              const ativo = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[var(--raio)] px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    color: ativo ? "var(--cor-marca-clara)" : "var(--cor-texto-2)",
                    background: ativo ? "var(--cor-marca-fundo)" : "transparent",
                  }}
                >
                  {item.rotulo}
                </Link>
              );
            })}
          </nav>
        </div>
        {rodape && <div className="px-1">{rodape}</div>}
      </aside>

      <main className="flex-1 px-8 py-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}
