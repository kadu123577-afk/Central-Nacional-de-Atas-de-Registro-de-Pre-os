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

/** As duas visões do ciclo: a ata (atividades 1 a 7) e a adesão do município (8 a 17). */
export const ABAS_DO_CICLO: readonly AbaDePagina[] = [
  { href: "/admin/ciclo", rotulo: "Atas (1 a 7)" },
  { href: "/admin/ciclo-adesao", rotulo: "Adesões (8 a 17)" },
];
