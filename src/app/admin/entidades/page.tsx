import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { FormularioNovaEntidade } from "./formulario";
import { ROTULO_TIPO_ENTIDADE } from "@/lib/entidades-alvo";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

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
      <CabecalhoPagina
        rotulo="Cadastros"
        titulo="Municípios e entidades"
        descricao="Prefeituras, secretarias e ministérios que o time comercial da Tech 10 está prospectando — uso interno, nunca visível para fornecedor ou órgão. A venda é sempre humana; isso aqui é só o banco de dados que sustenta o contato."
        voltar={{ href: "/admin", rotulo: "Painel" }}
      />

      <FormularioNovaEntidade />

      <Secao titulo={`Cadastradas (${entidades.length})`}>
        <div className="mb-5 flex flex-wrap gap-2">
          <Link href="/admin/entidades" className="kb-chip" aria-current={!tipo ? "page" : undefined}>
            Todas
          </Link>
          {Object.entries(ROTULO_TIPO_ENTIDADE).map(([valor, rotulo]) => (
            <Link
              key={valor}
              href={`/admin/entidades?tipo=${valor}`}
              className="kb-chip"
              aria-current={tipo === valor ? "page" : undefined}
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
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[560px]">
              <thead>
                <tr>
                  <th>Entidade</th>
                  <th className="w-[64px]">UF</th>
                  <th className="w-[120px]">Contatos</th>
                  <th className="w-[100px]">Situação</th>
                </tr>
              </thead>
              <tbody>
                {entidades.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link
                        href={`/admin/entidades/${e.id}`}
                        className="titulo-linha block hover:text-[var(--cor-marca-clara)]"
                      >
                        {e.nome}
                      </Link>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {ROTULO_TIPO_ENTIDADE[e.tipo] ?? e.tipo}
                        {e.municipio ? ` · ${e.municipio}` : ""}
                      </span>
                    </td>
                    <td>{e.uf ? <span className="selo-uf">{e.uf}</span> : "—"}</td>
                    <td className="numero whitespace-nowrap text-[13px]">
                      {e._count.contatos} {e._count.contatos === 1 ? "contato" : "contatos"}
                    </td>
                    <td>
                      <Badge tom={e.ativo ? "neutro" : "critico"}>{e.ativo ? "Ativa" : "Inativa"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </AppShell>
  );
}
