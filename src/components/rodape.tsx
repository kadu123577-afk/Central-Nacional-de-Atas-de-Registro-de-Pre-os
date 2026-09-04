import Link from "next/link";

export function Rodape() {
  return (
    <footer
      className="sem-impressao mt-auto border-t px-6 py-6"
      style={{ borderColor: "var(--cor-borda)" }}
    >
      <div
        className="mx-auto flex max-w-4xl flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between"
        style={{ color: "var(--cor-texto-3)" }}
      >
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
