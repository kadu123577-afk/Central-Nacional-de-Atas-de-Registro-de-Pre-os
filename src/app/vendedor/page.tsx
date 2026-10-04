import Link from "next/link";
import { redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { corDaCategoria, rotuloDaCategoria } from "@/lib/categorias";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { logoutVendedor } from "./actions";
import { NAV_VENDEDOR } from "./nav";

export const dynamic = "force-dynamic";

const DIAS_MOSTRAR_NEGADOS = 10;

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

  const [minhasAtas, disponiveis, pedidosPendentes, pedidosNegados] = await Promise.all([
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
      rodape={
        <form action={logoutVendedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
        Painel do vendedor
      </h1>

      <Secao titulo={`Minhas atas ${minhasAtas.length > 0 ? `(${minhasAtas.length})` : ""}`}>
        {minhasAtas.length === 0 ? (
          <VazioComAcao
            titulo="Você ainda não tem municípios liberados"
            descricao="Escolha uma ata disponível abaixo e peça os municípios em que quer negociar. O administrador libera."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {minhasAtas.map((ata) => {
              const total = ata.oportunidades.length;
              const aderiu = ata.oportunidades.filter((o) => o.estagio === "aderiu").length;
              return (
                <li key={ata.id} className="painel p-4">
                  <Link href={`/vendedor/atas/${ata.id}`} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                        Ata {ata.numero} — {ata.fornecedor.razaoSocial}
                      </p>
                      <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {ata.objeto}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {ata.categoria && (
                        <span
                          className="eyebrow rounded-full border px-2.5 py-0.5"
                          style={{ borderColor: corDaCategoria(ata.categoria), color: corDaCategoria(ata.categoria) }}
                        >
                          {rotuloDaCategoria(ata.categoria)}
                        </span>
                      )}
                      <Badge tom="marca">
                        {aderiu}/{total} aderiram
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      {(pedidosPendentes.length > 0 || pedidosNegados.length > 0) && (
        <Secao titulo="Meus pedidos de negociação">
          <ul className="flex flex-col gap-2">
            {pedidosPendentes.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <span style={{ color: "var(--cor-texto)" }}>
                  Ata {p.ata.numero} — {p.entidadeAlvo.nome}
                  {p.entidadeAlvo.uf ? `/${p.entidadeAlvo.uf}` : ""}
                </span>
                <Badge tom="neutro">Aguardando liberação</Badge>
              </li>
            ))}
            {pedidosNegados.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <span style={{ color: "var(--cor-texto-2)" }}>
                  Ata {p.ata.numero} — {p.entidadeAlvo.nome}
                  {p.entidadeAlvo.uf ? `/${p.entidadeAlvo.uf}` : ""}
                  {p.motivo ? ` — ${p.motivo}` : ""}
                </span>
                <Badge tom="critico">Negado</Badge>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <Secao titulo={`Atas disponíveis ${disponiveis.length > 0 ? `(${disponiveis.length})` : ""}`}>
        {disponiveis.length === 0 ? (
          <VazioComAcao
            titulo="Nenhuma ata disponível no momento"
            descricao="Só aparecem atas aprovadas pelo administrador e com contrato de intermediação cadastrado."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {disponiveis.map((ata) => (
              <li key={ata.id} className="painel flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                    Ata {ata.numero} — {ata.fornecedor.razaoSocial}
                  </p>
                  <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {ata.objeto}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    Órgão gerenciador: {ata.orgaoGerenciador.nome} — {ata.orgaoGerenciador.municipio}/
                    {ata.orgaoGerenciador.uf}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {ata._count.oportunidades > 0 && <Badge tom="neutro">Em negociação</Badge>}
                  {ata.categoria && (
                    <span
                      className="eyebrow rounded-full border px-2.5 py-0.5"
                      style={{ borderColor: corDaCategoria(ata.categoria), color: corDaCategoria(ata.categoria) }}
                    >
                      {rotuloDaCategoria(ata.categoria)}
                    </span>
                  )}
                  <Link href={`/vendedor/atas/${ata.id}/solicitar`} className="botao-atas">
                    Pedir municípios
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
