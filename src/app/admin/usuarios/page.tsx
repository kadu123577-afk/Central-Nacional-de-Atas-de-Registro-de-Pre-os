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
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { ROTULO_TIPO_VENDEDOR } from "@/lib/vendedores";
import { FormularioNovoVendedor } from "./formulario-vendedor";

export const dynamic = "force-dynamic";

const NAV_ADMIN = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Atas", href: "/atas" },
  { rotulo: "Contas a receber", href: "/admin/faturamento" },
  { rotulo: "Recebíveis — vendedores", href: "/admin/recebiveis-vendedores" },
  { rotulo: "Negociações", href: "/admin/negociacoes" },
  { rotulo: "Usuários", href: "/admin/usuarios" },
  { rotulo: "Fornecedores", href: "/admin/fornecedores" },
  { rotulo: "Municípios/Entidades", href: "/admin/entidades" },
  { rotulo: "Parceiros", href: "/admin/parceiros" },
  { rotulo: "Perfil", href: "/admin/perfil" },
];

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
          select: { ata: { select: { id: true, numero: true } } },
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

      <Secao titulo={`Vendedores (${vendedores.length})`}>
        {vendedores.length === 0 ? (
          <div className="mt-3">
            <VazioComAcao titulo="Nenhum vendedor cadastrado" descricao="" />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {vendedores.map((v) => (
              <li key={v.id} className="painel flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                      {v.nome}
                    </p>
                    <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      {v.email} · {ROTULO_TIPO_VENDEDOR[v.tipo as keyof typeof ROTULO_TIPO_VENDEDOR] ?? v.tipo}
                    </p>
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
                {atasDoVendedor(v).length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--cor-borda)" }}>
                    {atasDoVendedor(v).map((a) => (
                      <form key={a.id} action={devolverAtaAoPool} className="flex items-center gap-1.5">
                        <input type="hidden" name="ataId" value={a.id} />
                        <input type="hidden" name="vendedorId" value={v.id} />
                        <span className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
                          Ata {a.numero}
                        </span>
                        <button type="submit" className="eyebrow underline" style={{ color: "var(--cor-alerta)" }}>
                          tirar da ata
                        </button>
                      </form>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <FormularioNovoVendedor />
        </div>
      </Secao>

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
