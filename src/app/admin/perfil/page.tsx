import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin, trocarSenhaAdmin } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { FormularioTrocarSenha } from "@/components/ui/formulario-trocar-senha";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

export default async function PerfilAdminPage() {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) {
    redirect("/admin/login");
  }

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina rotulo="Conta" titulo="Perfil" />

      <Secao titulo="Dados cadastrais" destaque>
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Campo rotulo="Nome" valor={admin.nome} />
          <Campo rotulo="E-mail" valor={admin.email} />
        </dl>
      </Secao>

      <FormularioTrocarSenha action={trocarSenhaAdmin} />
    </AppShell>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold" style={{ color: "var(--cor-texto-3)" }}>
        {rotulo}
      </dt>
      <dd className="mt-1 text-[15px] font-semibold" style={{ color: "var(--cor-texto)" }}>
        {valor}
      </dd>
    </div>
  );
}
