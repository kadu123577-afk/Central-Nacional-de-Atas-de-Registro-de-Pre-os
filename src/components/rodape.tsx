import Link from "next/link";

export function Rodape() {
  return (
    <footer className="mt-auto border-t border-neutral-200 px-6 py-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
        <p>Central Nacional de Atas de Registro de Preços — Tech 10 Digital</p>
        <nav className="flex gap-4">
          <Link href="/politica-privacidade" className="underline">
            Política de Privacidade
          </Link>
          <Link href="/termos-de-uso" className="underline">
            Termos de Uso
          </Link>
        </nav>
      </div>
    </footer>
  );
}
