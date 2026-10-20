import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  alternarStatusFornecedor,
  alternarStatusOrgao,
  alternarStatusVendedor,
  devolverAtaAoPool,
  logoutAdmin,
} from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { ROTULO_TIPO_VENDEDOR } from "@/lib/vendedores";
import { moedaCurta } from "@/lib/formato";
import { FormularioNovoVendedor } from "./formulario-vendedor";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

/** Atas distintas em que o vendedor tem município ativo (negociação). */
function atasDoVendedor(v: { oportunidades: { ata: { id: string; numero: string } }[] }) {
  const porId = new Map(v.oportunidades.map((o) => [o.ata.id, o.ata]));
  return [...porId.values()];
}

export default async function GestaoUsuariosPage() {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const [fornecedores, orgaos, vendedores] = await Promise.all([
    prisma.fornecedor.findMany({ orderBy: { razaoSocial: "asc" } }),
    prisma.orgao.findMany({ orderBy: { nome: "asc" } }),
    prisma.vendedor.findMany({
      include: {
        oportunidades: {
          where: { expiradaEm: null },
          select: { estagio: true, valorAderido: true, ata: { select: { id: true, numero: true } } },
        },
      },
      orderBy: { nome: "asc" },
    }),
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
      <CabecalhoPagina
        rotulo="Cadastros"
        titulo="Gestão de usuários"
        descricao="Desativar bloqueia o login, sem apagar atas, adesões ou faturamento já existentes."
        voltar={{ href: "/admin", rotulo: "Painel" }}
      />

      <Secao titulo={`Vendedores (${vendedores.length})`}>
        {vendedores.length === 0 ? (
          <VazioComAcao titulo="Nenhum vendedor cadastrado" descricao="" />
        ) : (
          <ul className="lista-linhas">
            {vendedores.map((v) => {
              const atas = atasDoVendedor(v);
              return (
                <li key={v.id} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold" style={{ color: "var(--cor-texto)", letterSpacing: "-0.01em" }}>
                        {v.nome}
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {v.email} · {ROTULO_TIPO_VENDEDOR[v.tipo as keyof typeof ROTULO_TIPO_VENDEDOR] ?? v.tipo}
                      </p>
                      {v.oportunidades.length > 0 && (
                        <p className="mt-1.5 text-[13px]" style={{ color: "var(--cor-texto-2)" }}>
                          <span className="numero">
                            {v.oportunidades.filter((o) => ["a_contatar", "em_negociacao"].includes(o.estagio)).length}
                          </span>{" "}
                          em aberto ·{" "}
                          <span className="numero">{v.oportunidades.filter((o) => o.estagio === "aderiu").length}</span>{" "}
                          aderido(s) ·{" "}
                          <b className="numero font-bold" style={{ color: "var(--cor-texto)" }}>
                            {moedaCurta(
                              v.oportunidades
                                .filter((o) => o.estagio === "aderiu")
                                .reduce((soma, o) => soma + (o.valorAderido ? Number(o.valorAderido) : 0), 0),
                            )}
                          </b>{" "}
                          aderido ·{" "}
                          <Link
                            href={`/admin/pipeline?vendedor=${v.id}`}
                            className="font-bold hover:underline"
                            style={{ color: "var(--cor-marca-clara)" }}
                          >
                            ver no pipeline →
                          </Link>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tom={v.ativo ? "neutro" : "critico"}>{v.ativo ? "Ativo" : "Desativado"}</Badge>
                      <form action={alternarStatusVendedor}>
                        <input type="hidden" name="vendedorId" value={v.id} />
                        <button
                          type="submit"
                          className={v.ativo ? "botao-atas critico" : "botao-atas secundario"}
                        >
                          {v.ativo ? "Desativar" : "Reativar"}
                        </button>
                      </form>
                    </div>
                  </div>
                  {atas.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {atas.map((a) => (
                        <form
                          key={a.id}
                          action={devolverAtaAoPool}
                          className="inline-flex items-center gap-2 rounded-full border py-1 pl-3 pr-1.5 text-[12.5px]"
                          style={{ borderColor: "var(--cor-borda)", background: "var(--cor-superficie-2)" }}
                        >
                          <input type="hidden" name="ataId" value={a.id} />
                          <input type="hidden" name="vendedorId" value={v.id} />
                          <span className="codigo font-semibold" style={{ color: "var(--cor-texto)" }}>
                            Ata {a.numero}
                          </span>
                          <button
                            type="submit"
                            className="rounded-full px-2 py-0.5 text-[12px] font-semibold hover:underline"
                            style={{ color: "var(--cor-alerta)" }}
                          >
                            tirar da ata
                          </button>
                        </form>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      <FormularioNovoVendedor />

      <Secao titulo={`Fornecedores (${fornecedores.length})`}>
        {fornecedores.length === 0 ? (
          <VazioComAcao titulo="Nenhum fornecedor cadastrado" descricao="" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[620px]">
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th className="w-[180px]">CNPJ</th>
                  <th className="w-[1%]">Situação</th>
                </tr>
              </thead>
              <tbody>
                {fornecedores.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className="titulo-linha block">{f.razaoSocial}</span>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {f.email}
                      </span>
                    </td>
                    <td className="codigo whitespace-nowrap text-[12.5px]">{f.cnpj}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Badge tom={f.ativo ? "neutro" : "critico"}>{f.ativo ? "Ativo" : "Desativado"}</Badge>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao titulo={`Órgãos (${orgaos.length})`}>
        {orgaos.length === 0 ? (
          <VazioComAcao titulo="Nenhum órgão cadastrado" descricao="" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[680px]">
              <thead>
                <tr>
                  <th>Órgão</th>
                  <th className="w-[180px]">CNPJ</th>
                  <th className="w-[120px]">Esfera</th>
                  <th className="w-[64px]">UF</th>
                  <th className="w-[1%]">Situação</th>
                </tr>
              </thead>
              <tbody>
                {orgaos.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <span className="titulo-linha block">{o.nome}</span>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {o.email ?? "sem e-mail"}
                      </span>
                    </td>
                    <td className="codigo whitespace-nowrap text-[12.5px]">{o.cnpj}</td>
                    <td className="text-[13px] capitalize">{o.esfera}</td>
                    <td>
                      <span className="selo-uf">{o.uf}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Badge tom={o.ativo ? "neutro" : "critico"}>{o.ativo ? "Ativo" : "Desativado"}</Badge>
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
