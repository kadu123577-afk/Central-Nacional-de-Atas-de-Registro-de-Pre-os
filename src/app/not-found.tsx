import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo altura={26} />
      <div>
        <p className="eyebrow">Erro 404</p>
        <h1 className="marca mt-2 text-2xl" style={{ color: "var(--cor-texto)" }}>
          Página não encontrada
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          O endereço que você tentou acessar não existe ou foi movido.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/" className="botao-atas">
          Ir para a home
        </Link>
        <Link href="/catalogo" className="botao-atas secundario">
          Ver catálogo
        </Link>
      </div>
    </main>
  );
}
