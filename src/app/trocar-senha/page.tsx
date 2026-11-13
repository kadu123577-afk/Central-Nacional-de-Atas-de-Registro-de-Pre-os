import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MolduraPainel } from "@/components/moldura-painel";
import { contaParaTrocarSenha, destinoDaConta } from "@/lib/troca-senha";
import { FormularioTrocaObrigatoria } from "./formulario";

export const metadata: Metadata = {
  title: "Definir senha",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Primeiro acesso (2026-11-14): quem entrou com a senha provisória define a senha dela
 * antes de usar o sistema. Quem não tem sessão volta ao login; quem já trocou vai para casa.
 */
export default async function TrocarSenhaPage() {
  const conta = await contaParaTrocarSenha();
  if (!conta) redirect("/entrar");
  if (!conta.provisoria) redirect(destinoDaConta(conta.tipo));

  return (
    <MolduraPainel>
      <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-5 px-4 py-10">
        <header>
          <p className="rotulo-campo">Primeiro acesso</p>
          <h1 className="text-2xl font-extrabold" style={{ color: "var(--cor-texto)" }}>
            Defina a sua senha
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            A senha que você recebeu é provisória. Escolha uma senha só sua para continuar.
          </p>
        </header>
        <FormularioTrocaObrigatoria />
      </main>
    </MolduraPainel>
  );
}
