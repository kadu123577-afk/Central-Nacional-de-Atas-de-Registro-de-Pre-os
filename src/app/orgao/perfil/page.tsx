import { redirect } from "next/navigation";
import { orgaoIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutOrgao, trocarSenhaOrgao } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { FormularioTrocarSenha } from "@/components/ui/formulario-trocar-senha";

export const dynamic = "force-dynamic";

export default async function PerfilOrgaoPage() {
  const orgaoId = await orgaoIdLogado();
  if (!orgaoId) {
    redirect("/orgao/login");
  }

  const orgao = await prisma.orgao.findUnique({ where: { id: orgaoId } });
  if (!orgao) {
    redirect("/orgao/login");
  }

  return (
    <AppShell
      area="Órgão comprador"
      itens={[
        { rotulo: "Meus pedidos", href: "/orgao" },
        { rotulo: "Catálogo", href: "/catalogo" },
        { rotulo: "Perfil", href: "/orgao/perfil" },
      ]}
      rodape={
        <form action={logoutOrgao}>
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
          <Campo rotulo="Nome" valor={orgao.nome} />
          <Campo rotulo="CNPJ" valor={orgao.cnpj} />
          <Campo rotulo="UF / Município" valor={`${orgao.uf} — ${orgao.municipio}`} />
          <Campo rotulo="Esfera" valor={orgao.esfera} />
          <Campo rotulo="E-mail" valor={orgao.email ?? "—"} />
        </div>
      </Secao>

      <FormularioTrocarSenha action={trocarSenhaOrgao} />
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
