import Link from "next/link";
import { redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { KpisVendedor, TarefasHoje } from "@/components/vendedor/painel-resumo";
import { carregarPainelVendedor } from "@/lib/painel-vendedor-db";
import { corDaCategoria, rotuloDaCategoria } from "@/lib/categorias";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { logoutVendedor } from "./actions";
import { NAV_VENDEDOR } from "./nav";

export const dynamic = "force-dynamic";

const DIAS_MOSTRAR_NEGADOS = 10;

/** Categoria da ata como na tabela do site: ponto na cor do tema + rótulo. */
function CategoriaDaAta({ categoria }: { categoria: string | null }) {
  if (!categoria) return <span style={{ color: "var(--cor-texto-3)" }}>—</span>;
  return (
    <span className="inline-flex items-start gap-2 text-[12.5px]">
      <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full" style={{ background: corDaCategoria(categoria) }} />
      {rotuloDaCategoria(categoria)}
    </span>
  );
}

/**
 * Painel de fluxo do vendedor (2026-10-01, revisto em 2026-10-04) — duas
 * listas: as atas em que já tenho municípios liberados (levam pro Kanban)
 * e as atas disponíveis. Uma ata disponível NÃO some pros outros quando
 * alguém negocia nela: aparece "em negociação" e cada vendedor pede os
 * municípios que quer, com liberação do admin.
 */
export default async function PainelVendedorPage() {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) {
    redirect("/vendedor/login");
  }

  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId } });
  if (!vendedor) {
    redirect("/vendedor/login");
  }

  await expirarOportunidadesVencidas();

  const limiteNegados = new Date();
  limiteNegados.setDate(limiteNegados.getDate() - DIAS_MOSTRAR_NEGADOS);

  const [painel, minhasAtas, disponiveis, pedidosPendentes, pedidosNegados] = await Promise.all([
    carregarPainelVendedor(vendedorId),
    prisma.ata.findMany({
      where: { oportunidades: { some: { vendedorId, expiradaEm: null } } },
      include: {
        fornecedor: true,
        orgaoGerenciador: true,
        oportunidades: { where: { vendedorId, expiradaEm: null } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Portão: só ata aprovada pelo gestor E com contrato de intermediação.
    prisma.ata.findMany({
      where: {
        status: "APROVADA",
        contrato: { isNot: null },
        oportunidades: { none: { vendedorId, expiradaEm: null } },
      },
      include: {
        fornecedor: true,
        orgaoGerenciador: true,
        _count: { select: { oportunidades: { where: { expiradaEm: null } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pedidoNegociacao.findMany({
      where: { vendedorId, status: "pendente" },
      include: { ata: true, entidadeAlvo: true },
      orderBy: { criadoEm: "desc" },
    }),
    prisma.pedidoNegociacao.findMany({
      where: { vendedorId, status: "negado", decididoEm: { gte: limiteNegados } },
      include: { ata: true, entidadeAlvo: true },
      orderBy: { decididoEm: "desc" },
    }),
  ]);

  return (
    <AppShell
      area={`Vendedor — ${vendedor.nome}`}
      itens={NAV_VENDEDOR}
      larguraMaxima="max-w-6xl"
      rodape={
        <form action={logoutVendedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Atas"
        titulo="Painel"
        destaque="do vendedor"
        descricao="As atas em que você já tem municípios liberados e as atas disponíveis para pedir municípios."
      />

      <KpisVendedor kpis={painel.kpis} />
      {painel.tarefas.length > 0 && <TarefasHoje tarefas={painel.tarefas} />}

      <Secao
        titulo={`Minhas atas ${minhasAtas.length > 0 ? `(${minhasAtas.length})` : ""}`}
        descricao="Atas em que você já tem municípios liberados. Abra uma para ver o Kanban."
        destaque
      >
        {minhasAtas.length === 0 ? (
          <VazioComAcao
            titulo="Você ainda não tem municípios liberados"
            descricao="Escolha uma ata disponível abaixo e peça os municípios em que quer negociar. O administrador libera."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[700px]">
              <thead>
                <tr>
                  <th className="w-[1%]">Nº</th>
                  <th>Objeto da ata</th>
                  <th className="w-[170px]">Categoria</th>
                  <th className="w-[170px]">Adesões</th>
                  <th className="w-[1%]" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {minhasAtas.map((ata) => {
                  const total = ata.oportunidades.length;
                  const aderiu = ata.oportunidades.filter((o) => o.estagio === "aderiu").length;
                  return (
                    <tr key={ata.id}>
                      <td className="codigo whitespace-nowrap text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        Nº {ata.numero}
                      </td>
                      <td>
                        <Link
                          href={`/vendedor/atas/${ata.id}`}
                          className="titulo-linha block hover:text-[var(--cor-marca-clara)]"
                        >
                          {ata.objeto}
                        </Link>
                        <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                          {ata.fornecedor.razaoSocial}
                        </span>
                      </td>
                      <td>
                        <CategoriaDaAta categoria={ata.categoria} />
                      </td>
                      <td>
                        <Badge tom="marca">
                          {aderiu}/{total} aderiram
                        </Badge>
                        <div className="barra-saldo mt-2">
                          <div style={{ width: total > 0 ? `${(aderiu / total) * 100}%` : "0%" }} />
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <Link href={`/vendedor/atas/${ata.id}`} className="botao-atas link">
                          Abrir Kanban →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {(pedidosPendentes.length > 0 || pedidosNegados.length > 0) && (
        <Secao titulo="Meus pedidos de negociação">
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[560px]">
              <thead>
                <tr>
                  <th className="w-[1%]">Ata</th>
                  <th>Município</th>
                  <th className="w-[1%]">Situação</th>
                </tr>
              </thead>
              <tbody>
                {pedidosPendentes.map((p) => (
                  <tr key={p.id}>
                    <td className="codigo whitespace-nowrap text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      Ata {p.ata.numero}
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <span className="titulo-linha">{p.entidadeAlvo.nome}</span>
                        {p.entidadeAlvo.uf && <span className="selo-uf">{p.entidadeAlvo.uf}</span>}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      <Badge tom="neutro">Aguardando liberação</Badge>
                    </td>
                  </tr>
                ))}
                {pedidosNegados.map((p) => (
                  <tr key={p.id}>
                    <td className="codigo whitespace-nowrap text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      Ata {p.ata.numero}
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <span className="titulo-linha">{p.entidadeAlvo.nome}</span>
                        {p.entidadeAlvo.uf && <span className="selo-uf">{p.entidadeAlvo.uf}</span>}
                      </span>
                      {p.motivo && (
                        <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                          {p.motivo}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <Badge tom="critico">Negado</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      <Secao
        titulo={`Atas disponíveis ${disponiveis.length > 0 ? `(${disponiveis.length})` : ""}`}
        descricao="Aprovadas pelo administrador e com contrato de intermediação. Peça os municípios em que quer negociar; o administrador libera."
      >
        {disponiveis.length === 0 ? (
          <VazioComAcao
            titulo="Nenhuma ata disponível no momento"
            descricao="Só aparecem atas aprovadas pelo administrador e com contrato de intermediação cadastrado."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[880px]">
              <thead>
                <tr>
                  <th className="w-[1%]">Nº</th>
                  <th>Objeto da ata</th>
                  <th className="w-[220px]">Órgão gerenciador</th>
                  <th className="w-[160px]">Categoria</th>
                  <th className="w-[1%]" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {disponiveis.map((ata) => (
                  <tr key={ata.id}>
                    <td className="codigo whitespace-nowrap text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      Nº {ata.numero}
                    </td>
                    <td>
                      <span className="titulo-linha block">{ata.objeto}</span>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {ata.fornecedor.razaoSocial}
                      </span>
                    </td>
                    <td>
                      <span className="block text-[13px]" style={{ color: "var(--cor-texto)" }}>
                        {ata.orgaoGerenciador.nome}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {ata.orgaoGerenciador.municipio}
                        <span className="selo-uf">{ata.orgaoGerenciador.uf}</span>
                      </span>
                    </td>
                    <td>
                      <CategoriaDaAta categoria={ata.categoria} />
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        {ata._count.oportunidades > 0 && <Badge tom="neutro">Em negociação</Badge>}
                        <Link href={`/vendedor/atas/${ata.id}/solicitar`} className="botao-atas">
                          Pedir municípios
                        </Link>
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
