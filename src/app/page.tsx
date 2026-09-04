import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-5 px-6">
      <Logo altura={32} />
      <p className="max-w-md text-sm" style={{ color: "var(--cor-texto-2)" }}>
        Plataforma de intermediação de adesões a atas de registro de preços vigentes,
        com a trava de adesão do art. 86 da Lei 14.133/2021.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/catalogo" className="botao-atas">
          Catálogo público
        </Link>
        <Link href="/fornecedor/login" className="botao-atas secundario">
          Painel do fornecedor
        </Link>
        <Link href="/orgao/login" className="botao-atas secundario">
          Painel do órgão comprador
        </Link>
        <Link href="/atas" className="botao-atas secundario">
          Cadastro interno de atas
        </Link>
        <Link href="/admin/login" className="botao-atas secundario">
          Painel administrativo
        </Link>
      </div>
    </main>
  );
}
