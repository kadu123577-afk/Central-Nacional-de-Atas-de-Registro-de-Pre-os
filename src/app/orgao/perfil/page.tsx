import { redirect } from "next/navigation";
import { orgaoIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutOrgao, trocarSenhaOrgao } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
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
      <CabecalhoPagina rotulo="Conta" titulo="Perfil" descricao={orgao.nome} />

      <Secao titulo="Dados cadastrais" destaque>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <Campo rotulo="Nome" valor={orgao.nome} />
          <Campo rotulo="CNPJ" valor={<span className="codigo">{orgao.cnpj}</span>} />
          <Campo
            rotulo="UF / Município"
            valor={
              <span className="inline-flex items-center gap-2">
                <span className="selo-uf">{orgao.uf}</span>
                {orgao.municipio}
              </span>
            }
          />
          <Campo rotulo="Esfera" valor={<span className="capitalize">{orgao.esfera}</span>} />
          <Campo rotulo="E-mail" valor={orgao.email ?? "—"} />
        </dl>
      </Secao>

      <FormularioTrocarSenha action={trocarSenhaOrgao} />
    </AppShell>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="border-b pb-4" style={{ borderColor: "var(--cor-borda)" }}>
      <dt className="text-[12.5px] font-semibold" style={{ color: "var(--cor-texto-3)" }}>
        {rotulo}
      </dt>
      <dd className="mt-1 text-[14.5px] font-semibold" style={{ color: "var(--cor-texto)" }}>
        {valor}
      </dd>
    </div>
  );
}
