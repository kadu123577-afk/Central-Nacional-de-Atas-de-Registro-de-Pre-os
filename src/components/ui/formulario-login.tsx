import { Logo } from "./logo";

export function FormularioLogin({
  titulo,
  subtitulo,
  formAction,
  erro,
  pendente,
  rodape,
}: {
  titulo: string;
  subtitulo: string;
  formAction: (formData: FormData) => void;
  erro?: string;
  pendente: boolean;
  rodape?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <Logo altura={26} />
        <h1 className="marca mt-4 text-xl" style={{ color: "var(--cor-texto)" }}>
          {titulo}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          {subtitulo}
        </p>
      </div>

      <form action={formAction} className="painel flex flex-col gap-4 p-5">
        <label className="block text-sm">
          <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
            E-mail
          </span>
          <input name="email" type="email" required className="campo-atas" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
            Senha
          </span>
          <input name="senha" type="password" required className="campo-atas" />
        </label>

        {erro && (
          <p
            className="rounded-[var(--raio)] border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--cor-critico)",
              background: "var(--cor-critico-fundo)",
              color: "var(--cor-critico)",
            }}
          >
            {erro}
          </p>
        )}

        <button type="submit" disabled={pendente} className="botao-atas w-full">
          {pendente ? "Entrando..." : "Entrar"}
        </button>
      </form>

      {rodape}
    </main>
  );
}
