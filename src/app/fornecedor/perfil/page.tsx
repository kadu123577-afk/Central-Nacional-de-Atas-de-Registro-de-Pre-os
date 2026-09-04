import { redirect } from "next/navigation";
import { fornecedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutFornecedor, trocarSenhaFornecedor } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
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
        { rotulo: "Nova ata", href: "/fornecedor/atas/nova" },
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
      <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
        Perfil
      </h1>

      <Secao titulo="Dados cadastrais">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Campo rotulo="Razão social" valor={fornecedor.razaoSocial} />
          <Campo rotulo="CNPJ" valor={fornecedor.cnpj} />
          <Campo rotulo="E-mail" valor={fornecedor.email} />
          <Campo rotulo="Telefone" valor={fornecedor.telefone ?? "—"} />
        </div>
      </Secao>

      <FormularioTrocarSenha action={trocarSenhaFornecedor} />
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
