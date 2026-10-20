import Link from "next/link";
import { BarraTopo } from "@/components/ui/barra-topo";

export default function NaoEncontrado() {
  return (
    <>
      <BarraTopo />
      <main
        className="flex flex-1 items-center"
        style={{ background: "linear-gradient(180deg, var(--cor-superficie) 0%, var(--cor-fundo) 100%)" }}
      >
        <div className="mx-auto flex min-h-[60vh] w-full max-w-[640px] flex-col items-center justify-center px-6 py-16 text-center">
          <p className="selo-ponto">Erro 404</p>
          <h1
            className="mt-5 font-extrabold"
            style={{
              fontSize: "clamp(34px, 4.6vw, 48px)",
              lineHeight: 1.04,
              letterSpacing: "-0.045em",
              color: "var(--cor-texto)",
              textWrap: "balance",
            }}
          >
            Página <span className="marca-destaque">não encontrada</span>
          </h1>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
            O endereço que você tentou acessar não existe ou foi movido.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/" className="botao-atas">
              Ir para a home
            </Link>
            <Link href="/catalogo" className="botao-atas secundario">
              Ver catálogo
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
