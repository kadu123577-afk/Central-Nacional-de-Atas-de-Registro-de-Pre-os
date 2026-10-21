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
import { rotuloDaCategoria } from "@/lib/categorias";
import { FormularioNovoParceiro } from "./formulario";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

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
      <CabecalhoPagina
        rotulo="Cadastros"
        titulo="Parceiros"
        descricao="Quem revende/comercializa atas junto com a ARCA Capital — cada parceiro define suas categorias e UFs de interesse pra ver as atas compatíveis."
        voltar={{ href: "/admin", rotulo: "Painel" }}
      />

      <FormularioNovoParceiro />

      <Secao titulo={`Cadastrados (${parceiros.length})`}>
        {parceiros.length === 0 ? (
          <VazioComAcao
            titulo="Nenhum parceiro cadastrado"
            descricao="Use o formulário acima para registrar o primeiro parceiro."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[640px]">
              <thead>
                <tr>
                  <th>Parceiro</th>
                  <th>Categorias de interesse</th>
                  <th className="w-[160px]">UFs</th>
                  <th className="w-[1%]">Situação</th>
                </tr>
              </thead>
              <tbody>
                {parceiros.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link
                        href={`/admin/parceiros/${p.id}`}
                        className="titulo-linha block hover:text-[var(--cor-marca-clara)]"
                      >
                        {p.nome}
                      </Link>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {p.contato}
                      </span>
                    </td>
                    <td className="text-[13px]">
                      {p.categoriasInteresse.length > 0 ? (
                        p.categoriasInteresse.map(rotuloDaCategoria).join(", ")
                      ) : (
                        <span style={{ color: "var(--cor-texto-3)" }}>sem categoria definida</span>
                      )}
                    </td>
                    <td>
                      {p.ufsInteresse.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {p.ufsInteresse.map((uf) => (
                            <span key={uf} className="selo-uf">
                              {uf}
                            </span>
                          ))}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Badge tom={p.ativo ? "neutro" : "critico"}>{p.ativo ? "Ativo" : "Inativo"}</Badge>
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
