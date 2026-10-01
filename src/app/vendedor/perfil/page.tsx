import { redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
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
      <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
        Perfil
      </h1>

      <Secao titulo="Dados cadastrais">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
              Nome
            </p>
            <p style={{ color: "var(--cor-texto)" }}>{vendedor.nome}</p>
          </div>
          <div>
            <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
              E-mail
            </p>
            <p style={{ color: "var(--cor-texto)" }}>{vendedor.email}</p>
          </div>
        </div>
      </Secao>

      <FormularioTrocarSenha action={trocarSenhaVendedor} />
    </AppShell>
  );
}
