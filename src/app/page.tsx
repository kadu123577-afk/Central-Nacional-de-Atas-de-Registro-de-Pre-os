import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold">Central Nacional de Atas de Registro de Preços</h1>
      <p className="text-neutral-600">
        Plataforma de intermediação de adesões a atas de registro de preços vigentes.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/catalogo"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          Catálogo público
        </Link>
        <Link
          href="/fornecedor/login"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800"
        >
          Painel do fornecedor
        </Link>
        <Link
          href="/orgao/login"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800"
        >
          Painel do órgão comprador
        </Link>
        <Link
          href="/atas"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800"
        >
          Cadastro interno de atas
        </Link>
        <Link
          href="/admin/login"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800"
        >
          Painel administrativo
        </Link>
      </div>
    </main>
  );
}
