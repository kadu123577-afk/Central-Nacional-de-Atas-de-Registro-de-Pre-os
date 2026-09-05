import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { FormularioNovoParceiro } from "./formulario";

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

export default async function ParceirosPage() {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const parceiros = await prisma.parceiro.findMany({ orderBy: { nome: "asc" } });

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
            Parceiros
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Quem revende/comercializa atas junto com a Tech 10 — cada parceiro define suas
            categorias e UFs de interesse pra ver as atas compatíveis.
          </p>
        </div>
        <Link href="/admin" className="botao-atas link">
          ← Painel
        </Link>
      </div>

      <FormularioNovoParceiro />

      <Secao titulo={`Cadastrados (${parceiros.length})`}>
        {parceiros.length === 0 ? (
          <div className="mt-3">
            <VazioComAcao
              titulo="Nenhum parceiro cadastrado"
              descricao="Use o formulário acima para registrar o primeiro parceiro."
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {parceiros.map((p) => (
              <li key={p.id} className="painel p-4">
                <Link href={`/admin/parceiros/${p.id}`} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                      {p.nome}
                    </p>
                    <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      {p.contato} ·{" "}
                      {p.categoriasInteresse.length > 0
                        ? p.categoriasInteresse.join(", ")
                        : "sem categoria definida"}
                      {p.ufsInteresse.length > 0 ? ` · ${p.ufsInteresse.join(", ")}` : ""}
                    </p>
                  </div>
                  <Badge tom={p.ativo ? "neutro" : "critico"}>{p.ativo ? "Ativo" : "Inativo"}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
