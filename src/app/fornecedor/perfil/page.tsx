import { redirect } from "next/navigation";
import { fornecedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutFornecedor, trocarSenhaFornecedor } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { FormularioTrocarSenha } from "@/components/ui/formulario-trocar-senha";

export const dynamic = "force-dynamic";

export default async function PerfilFornecedorPage() {
  const fornecedorId = await fornecedorIdLogado();
  if (!fornecedorId) {
    redirect("/fornecedor/login");
  }

  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: fornecedorId } });
  if (!fornecedor) {
    redirect("/fornecedor/login");
  }

  return (
    <AppShell
      area="Fornecedor"
      itens={[
        { rotulo: "Minhas atas", href: "/fornecedor" },
        { rotulo: "Pedidos recebidos", href: "/fornecedor/adesoes" },
        { rotulo: "Perfil", href: "/fornecedor/perfil" },
      ]}
      rodape={
        <form action={logoutFornecedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina rotulo="Conta" titulo="Perfil" descricao={fornecedor.razaoSocial} />

      <Secao titulo="Dados cadastrais" destaque>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <Campo rotulo="Razão social" valor={fornecedor.razaoSocial} />
          <Campo rotulo="CNPJ" valor={<span className="codigo">{fornecedor.cnpj}</span>} />
          <Campo rotulo="E-mail" valor={fornecedor.email} />
          <Campo rotulo="Telefone" valor={fornecedor.telefone ? <span className="numero">{fornecedor.telefone}</span> : "—"} />
        </dl>
      </Secao>

      <FormularioTrocarSenha action={trocarSenhaFornecedor} />
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
