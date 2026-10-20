import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/site-shell";

export const metadata: Metadata = {
  title: "Página não encontrada",
};

export default function NotFound() {
  return (
    <SiteShell>
      <div className="wrap erro">
        <span className="rotulo-secao">
          <span className="losango" aria-hidden="true"></span>Erro 404
        </span>
        <h1>Esta página não existe ou mudou de endereço</h1>
        <p>
          Se você chegou por um link de ata, ela pode ter encerrado a vigência. Procure pelo objeto
          no catálogo ou volte para o início.
        </p>
        <div className="acoes">
          <Link className="botao botao--primario" href="/catalogo">
            Ir para o catálogo
          </Link>
          <Link className="botao botao--secundario" href="/">
            Voltar ao início
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}
