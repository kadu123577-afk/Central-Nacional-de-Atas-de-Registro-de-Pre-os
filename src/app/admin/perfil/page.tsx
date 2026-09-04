import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin, trocarSenhaAdmin } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { FormularioTrocarSenha } from "@/components/ui/formulario-trocar-senha";

export const dynamic = "force-dynamic";

const NAV_ADMIN = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Contas a receber", href: "/admin/faturamento" },
  { rotulo: "Usuários", href: "/admin/usuarios" },
  { rotulo: "Perfil", href: "/admin/perfil" },
];

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
      <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
        Perfil
      </h1>

      <Secao titulo="Dados cadastrais">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Campo rotulo="Nome" valor={admin.nome} />
          <Campo rotulo="E-mail" valor={admin.email} />
        </div>
      </Secao>

      <FormularioTrocarSenha action={trocarSenhaAdmin} />
    </AppShell>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="eyebrow">{rotulo}</p>
      <p style={{ color: "var(--cor-texto)" }}>{valor}</p>
    </div>
  );
}
