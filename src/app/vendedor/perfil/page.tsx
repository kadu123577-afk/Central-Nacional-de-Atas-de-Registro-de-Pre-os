import { redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { FormularioTrocarSenha } from "@/components/ui/formulario-trocar-senha";
import { logoutVendedor, trocarSenhaVendedor } from "../actions";
import { NAV_VENDEDOR } from "../nav";

export const dynamic = "force-dynamic";

export default async function PerfilVendedorPage() {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) {
    redirect("/vendedor/login");
  }

  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId } });
  if (!vendedor) {
    redirect("/vendedor/login");
  }

  return (
    <AppShell
      area={`Vendedor — ${vendedor.nome}`}
      itens={NAV_VENDEDOR}
      rodape={
        <form action={logoutVendedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina rotulo="Conta" titulo="Perfil" descricao="Seus dados cadastrais e a troca de senha." />

      <Secao titulo="Dados cadastrais">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <div>
            <dt className="eyebrow">Nome</dt>
            <dd className="mt-1.5 text-[15px] font-semibold" style={{ color: "var(--cor-texto)" }}>
              {vendedor.nome}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">E-mail</dt>
            <dd className="mt-1.5 break-all text-[15px] font-semibold" style={{ color: "var(--cor-texto)" }}>
              {vendedor.email}
            </dd>
          </div>
        </dl>
      </Secao>

      <FormularioTrocarSenha action={trocarSenhaVendedor} />
    </AppShell>
  );
}
