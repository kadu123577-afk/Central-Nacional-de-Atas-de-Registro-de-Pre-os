import Link from "next/link";
import { Logo } from "./logo";
import { Aviso } from "./aviso";

/**
 * Tela de login no padrão do site: faixa verde profunda com a marca à
 * esquerda (como a seção "Não achou a ata?") e o cartão branco do
 * formulário à direita.
 */
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
    <main
      className="flex min-h-screen items-center"
      style={{ background: "linear-gradient(135deg, var(--cor-profundo-faixa) 0%, var(--cor-profundo) 100%)" }}
    >
      <div className="mx-auto grid w-full max-w-[1040px] gap-10 px-6 py-14 lg:grid-cols-[1fr_420px] lg:items-center">
        <div>
          <Link href="/" aria-label="Central de Atas — início">
            <Logo tom="claro" altura={38} />
          </Link>
          <p className="eyebrow mt-10" style={{ color: "var(--cor-ouro-claro)" }}>
            Acesso restrito
          </p>
          <h1
            className="mt-3 max-w-md font-extrabold"
            style={{ fontSize: 38, lineHeight: 1.06, letterSpacing: "-0.04em", color: "var(--cor-superficie)" }}
          >
            {titulo}
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed" style={{ color: "var(--cor-profundo-texto)" }}>
            {subtitulo}
          </p>
        </div>

        <div>
          <form action={formAction} className="painel flex flex-col gap-4 p-7" style={{ borderRadius: 18 }}>
            <p className="marca text-lg" style={{ color: "var(--cor-texto)" }}>
              Entrar
            </p>
            <label className="block">
              <span className="rotulo-campo">E-mail</span>
              <input name="email" type="email" required autoComplete="email" className="campo-atas" />
            </label>
            <label className="block">
              <span className="rotulo-campo">Senha</span>
              <input name="senha" type="password" required autoComplete="current-password" className="campo-atas" />
            </label>

            {erro && <Aviso tom="critico">{erro}</Aviso>}

            <button type="submit" disabled={pendente} className="botao-atas mt-1 w-full">
              {pendente ? "Entrando..." : "Entrar"}
            </button>
            {/* O rodapé (ex.: "Ainda não tem conta?") fica dentro do cartão
                branco: as páginas passam texto escuro. */}
            {rodape && (
              <div className="border-t pt-4" style={{ borderColor: "var(--cor-borda)" }}>
                {rodape}
              </div>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
