import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export function BarraNavegacao() {
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between border-b px-6 py-3"
      style={{
        background: "color-mix(in srgb, var(--cor-fundo) 80%, transparent)",
        backdropFilter: "blur(8px)",
        borderColor: "var(--cor-borda)",
      }}
    >
      <Logo altura={26} />

      <nav className="hidden items-center gap-6 md:flex">
        <a href="#como-funciona" className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Como funciona
        </a>
        <a href="#diferenciais" className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Diferenciais
        </a>
        <Link href="/catalogo" className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Catálogo
        </Link>
      </nav>

      <Link href="/orgao/login" className="botao-atas px-4 py-2">
        Entrar
      </Link>
    </header>
  );
}
