import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Aviso } from "@/components/ui/aviso";
import { Cifra } from "@/components/ui/valores";
import { KanbanAta } from "@/components/kanban/kanban-ata";
import { FunilVendedor, KpisVendedor } from "@/components/vendedor/painel-resumo";
import { carregarCartoes } from "@/lib/kanban-db";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { carregarLinhasOportunidades } from "@/lib/painel-vendedor-db";
import { montarPainel, resumirPorVendedor } from "@/lib/painel-vendedor";

export const dynamic = "force-dynamic";

/** Teto de cards na tela: o mais urgente primeiro, o resto aparece filtrando. */
const LIMITE_CARDS = 300;

interface Filtros {
  vendedor?: string;
  ata?: string;
  uf?: string;
}

/**
 * Pipeline do gestor (fase 2 de design, 2026-10-05) — o Kanban de TODOS os
 * vendedores numa tela só, com os mesmos cards e o mesmo dossiê do município
 * (somente leitura). Filtra por vendedor, ata e UF; os indicadores e o resumo
 * por vendedor valem pro filtro inteiro, mesmo quando o teto de cards corta
 * a lista.
 */
export default async function PipelineGestorPage({ searchParams }: { searchParams: Promise<Filtros> }) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const filtros = await searchParams;
  await expirarOportunidadesVencidas();

  const where: Prisma.OportunidadeVendaWhereInput = {
    expiradaEm: null,
    ...(filtros.vendedor ? { vendedorId: filtros.vendedor } : {}),
    ...(filtros.ata ? { ataId: filtros.ata } : {}),
    ...(filtros.uf ? { entidadeAlvo: { uf: filtros.uf } } : {}),
  };

  const [linhas, { cartoes, total }, vendedores, atas, ufs] = await Promise.all([
    carregarLinhasOportunidades(where),
    carregarCartoes(where, { limite: LIMITE_CARDS, verDesvio: true }),
    prisma.vendedor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.ata.findMany({
      where: { oportunidades: { some: { expiradaEm: null } } },
      orderBy: { numero: "asc" },
      select: { id: true, numero: true, fornecedor: { select: { razaoSocial: true } } },
    }),
    prisma.entidadeAlvo.findMany({
      where: { oportunidades: { some: { expiradaEm: null } }, uf: { not: null } },
      distinct: ["uf"],
      orderBy: { uf: "asc" },
      select: { uf: true },
    }),
  ]);

  const painel = montarPainel(linhas);
  const porVendedor = resumirPorVendedor(linhas);
  const filtrando = Boolean(filtros.vendedor || filtros.ata || filtros.uf);

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-7xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Operação"
        titulo="Pipeline"
        descricao={
          <>
            Todos os municípios em negociação, de todos os vendedores. Clique num card para ver o dossiê do município
            (somente leitura).
          </>
        }
      />

      <form
        method="get"
        className="painel grid grid-cols-1 gap-x-4 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.6fr_0.6fr_auto] lg:items-end"
        aria-label="Filtros do pipeline"
      >
        <label className="block">
          <span className="rotulo-campo">Vendedor</span>
          <select name="vendedor" defaultValue={filtros.vendedor ?? ""} className="campo-atas">
            <option value="">Todos os vendedores</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo-campo">Ata</span>
          <select name="ata" defaultValue={filtros.ata ?? ""} className="campo-atas">
            <option value="">Todas as atas</option>
            {atas.map((a) => (
              <option key={a.id} value={a.id}>
                Ata {a.numero} — {a.fornecedor.razaoSocial}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo-campo">UF</span>
          <select name="uf" defaultValue={filtros.uf ?? ""} className="campo-atas">
            <option value="">Todas as UFs</option>
            {ufs.map((u) => (
              <option key={u.uf} value={u.uf ?? ""}>
                {u.uf}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-4">
          <button type="submit" className="botao-atas">
            Filtrar
          </button>
          {filtrando && (
            <Link href="/admin/pipeline" className="botao-atas link">
              Limpar
            </Link>
          )}
        </div>
      </form>

      <KpisVendedor kpis={painel.kpis} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FunilVendedor funil={painel.funil} />
        <Secao titulo="Por vendedor">
          {porVendedor.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--cor-texto-3)" }}>
              Nenhuma oportunidade ativa{filtrando ? " neste filtro" : ""}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabela-atas">
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th>Em aberto</th>
                    <th>Aderidos</th>
                    <th>Valor aderido</th>
                    <th>Prazos</th>
                  </tr>
                </thead>
                <tbody>
                  {porVendedor.map((v) => (
                    <tr key={v.vendedorId}>
                      <td>
                        <Link
                          href={`/admin/pipeline?vendedor=${v.vendedorId}`}
                          className="titulo-linha hover:text-[var(--cor-marca-clara)]"
                        >
                          {v.nome}
                        </Link>
                      </td>
                      <td className="numero">{v.abertos}</td>
                      <td className="numero">{v.aderidos}</td>
                      <td className="whitespace-nowrap" style={{ color: "var(--cor-texto)" }}>
                        <Cifra valor={v.valorAderido} />
                      </td>
                      <td
                        className="numero whitespace-nowrap"
                        style={{
                          color: v.vencendo > 0 ? "var(--cor-critico)" : undefined,
                          fontWeight: v.vencendo > 0 ? 600 : undefined,
                        }}
                      >
                        {v.vencendo > 0 ? `${v.vencendo} vencendo` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Secao>
      </div>

      {total > cartoes.length && (
        <Aviso tom="info">
          Mostrando os {cartoes.length} cards mais urgentes de {total}. Filtre por vendedor, ata ou UF para ver o resto.
        </Aviso>
      )}

      <KanbanAta cartoes={cartoes} somenteLeitura mostrarOrigem semIndicadores colunasRolaveis />
    </AppShell>
  );
}
