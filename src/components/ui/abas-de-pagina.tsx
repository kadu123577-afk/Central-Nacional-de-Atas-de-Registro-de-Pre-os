import Link from "next/link";

export interface AbaDePagina {
  href: string;
  rotulo: string;
}

/**
 * Abas de navegação entre telas irmãs (14/11/2026): cada aba é uma página própria, então os
 * endereços continuam funcionando e a aba ativa é a da página em que a pessoa está.
 */
export function AbasDePagina({ abas, ativa }: { abas: readonly AbaDePagina[]; ativa: string }) {
  return (
    <nav aria-label="Seções" className="flex flex-wrap gap-2">
      {abas.map((aba) => (
        <Link
          key={aba.href}
          href={aba.href}
          aria-current={aba.href === ativa ? "page" : undefined}
          className={aba.href === ativa ? "botao-atas" : "botao-atas secundario"}
        >
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  );
}
