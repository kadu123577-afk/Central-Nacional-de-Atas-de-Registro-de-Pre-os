import Link from "next/link";
import { BarraNavegacao } from "@/components/ui/barra-navegacao";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <BarraNavegacao />

      <section
        id="hero"
        className="mx-auto flex w-full max-w-4xl flex-col items-start gap-5 px-6 pt-20 pb-10"
      >
        <h1 className="marca text-3xl md:text-4xl" style={{ color: "var(--cor-texto)" }}>
          Central Nacional de Atas de Registro de Preços
        </h1>
        <p className="max-w-lg text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Plataforma de intermediação de adesões a atas de registro de preços vigentes,
          com a trava de adesão do art. 86 da Lei 14.133/2021.
        </p>
        <div className="flex flex-wrap items-center gap-5">
          <Link href="/catalogo" className="botao-atas">
            Catálogo público
          </Link>
          <a href="#diferenciais" className="text-sm underline" style={{ color: "var(--cor-texto-2)" }}>
            Ver como funciona ↓
          </a>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-4xl flex-wrap gap-3 px-6 pb-16">
        <Link href="/fornecedor/login" className="botao-atas secundario">
          Painel do fornecedor
        </Link>
        <Link href="/atas" className="botao-atas secundario">
          Cadastro interno de atas
        </Link>
        <Link href="/admin/login" className="botao-atas secundario">
          Painel administrativo
        </Link>
      </section>
    </main>
  );
}
