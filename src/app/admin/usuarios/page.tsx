import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { alternarStatusFornecedor, alternarStatusOrgao, logoutAdmin } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";

export const dynamic = "force-dynamic";

const NAV_ADMIN = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Contas a receber", href: "/admin/faturamento" },
  { rotulo: "Usuários", href: "/admin/usuarios" },
  { rotulo: "Fornecedores", href: "/admin/fornecedores" },
  { rotulo: "Municípios/Entidades", href: "/admin/entidades" },
  { rotulo: "Parceiros", href: "/admin/parceiros" },
  { rotulo: "Perfil", href: "/admin/perfil" },
];

export default async function GestaoUsuariosPage() {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const [fornecedores, orgaos] = await Promise.all([
    prisma.fornecedor.findMany({ orderBy: { razaoSocial: "asc" } }),
    prisma.orgao.findMany({ orderBy: { nome: "asc" } }),
  ]);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Gestão de usuários
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Desativar bloqueia o login, sem apagar atas, adesões ou faturamento já
            existentes.
          </p>
        </div>
        <Link href="/admin" className="botao-atas link">
          ← Painel
        </Link>
      </div>

      <Secao titulo={`Fornecedores (${fornecedores.length})`}>
        {fornecedores.length === 0 ? (
          <div className="mt-3">
            <VazioComAcao titulo="Nenhum fornecedor cadastrado" descricao="" />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {fornecedores.map((f) => (
              <li
                key={f.id}
                className="painel flex items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                    {f.razaoSocial}
                  </p>
                  <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {f.cnpj} · {f.email}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tom={f.ativo ? "neutro" : "critico"}>
                    {f.ativo ? "Ativo" : "Desativado"}
                  </Badge>
                  <form action={alternarStatusFornecedor}>
                    <input type="hidden" name="fornecedorId" value={f.id} />
                    <button
                      type="submit"
                      className={f.ativo ? "botao-atas critico" : "botao-atas secundario"}
                    >
                      {f.ativo ? "Desativar" : "Reativar"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo={`Órgãos (${orgaos.length})`}>
        {orgaos.length === 0 ? (
          <div className="mt-3">
            <VazioComAcao titulo="Nenhum órgão cadastrado" descricao="" />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {orgaos.map((o) => (
              <li
                key={o.id}
                className="painel flex items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                    {o.nome}
                  </p>
                  <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {o.cnpj} · {o.email ?? "sem e-mail"} · {o.esfera} ({o.uf})
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tom={o.ativo ? "neutro" : "critico"}>
                    {o.ativo ? "Ativo" : "Desativado"}
                  </Badge>
                  <form action={alternarStatusOrgao}>
                    <input type="hidden" name="orgaoId" value={o.id} />
                    <button
                      type="submit"
                      className={o.ativo ? "botao-atas critico" : "botao-atas secundario"}
                    >
                      {o.ativo ? "Desativar" : "Reativar"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
