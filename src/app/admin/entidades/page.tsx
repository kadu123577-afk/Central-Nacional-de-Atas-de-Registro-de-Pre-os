import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { FormularioNovaEntidade } from "./formulario";
import { ROTULO_TIPO_ENTIDADE } from "@/lib/entidades-alvo";

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

export default async function EntidadesAlvoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const { tipo } = await searchParams;

  const entidades = await prisma.entidadeAlvo.findMany({
    where: tipo ? { tipo } : undefined,
    orderBy: [{ tipo: "asc" }, { uf: "asc" }, { nome: "asc" }],
    include: { _count: { select: { contatos: true } } },
  });

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
            Municípios e entidades
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Prefeituras, secretarias e ministérios que o time comercial da Tech 10 está
            prospectando — uso interno, nunca visível para fornecedor ou órgão. A venda é
            sempre humana; isso aqui é só o banco de dados que sustenta o contato.
          </p>
        </div>
        <Link href="/admin" className="botao-atas link">
          ← Painel
        </Link>
      </div>

      <FormularioNovaEntidade />

      <Secao titulo={`Cadastradas (${entidades.length})`}>
        <div className="mb-3 flex flex-wrap gap-2">
          <Link href="/admin/entidades" className={`botao-atas ${!tipo ? "" : "secundario"}`}>
            Todas
          </Link>
          {Object.entries(ROTULO_TIPO_ENTIDADE).map(([valor, rotulo]) => (
            <Link
              key={valor}
              href={`/admin/entidades?tipo=${valor}`}
              className={`botao-atas ${tipo === valor ? "" : "secundario"}`}
            >
              {rotulo}
            </Link>
          ))}
        </div>

        {entidades.length === 0 ? (
          <VazioComAcao
            titulo="Nenhuma entidade cadastrada"
            descricao="Use o formulário acima para registrar a primeira prefeitura/secretaria/ministério."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {entidades.map((e) => (
              <li key={e.id} className="painel p-4">
                <Link href={`/admin/entidades/${e.id}`} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                      {e.nome}
                    </p>
                    <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      {ROTULO_TIPO_ENTIDADE[e.tipo] ?? e.tipo}
                      {e.uf ? ` · ${e.uf}` : ""}
                      {e.municipio ? ` · ${e.municipio}` : ""} · {e._count.contatos}{" "}
                      {e._count.contatos === 1 ? "contato" : "contatos"}
                    </p>
                  </div>
                  <Badge tom={e.ativo ? "neutro" : "critico"}>{e.ativo ? "Ativa" : "Inativa"}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
