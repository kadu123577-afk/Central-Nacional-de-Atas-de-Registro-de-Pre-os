import Link from "next/link";
import { redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { corDaCategoria, rotuloDaCategoria } from "@/lib/categorias";
import { logoutVendedor, reivindicarAta } from "./actions";

export const dynamic = "force-dynamic";

const NAV_VENDEDOR = [{ rotulo: "Painel", href: "/vendedor" }];

/**
 * Painel de fluxo do vendedor (2026-10-01) — "uma espécie de match entre
 * um e outro para conseguirmos vender as atas das empresas vencedoras
 * que cadastramos". Duas listas: atas ainda sem dono (pool, qualquer
 * vendedor pode pegar) e as já reivindicadas por este vendedor (levam
 * pro Kanban de municípios).
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

  const [disponiveis, minhasAtas] = await Promise.all([
    prisma.ata.findMany({
      where: { vendedorId: null },
      include: { fornecedor: true, orgaoGerenciador: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.ata.findMany({
      where: { vendedorId },
      include: {
        fornecedor: true,
        orgaoGerenciador: true,
        oportunidades: true,
      },
      orderBy: { createdAt: "desc" },
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
            titulo="Você ainda não pegou nenhuma ata"
            descricao="Escolha uma ata disponível na lista abaixo pra começar a trabalhar."
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

      <Secao titulo={`Atas disponíveis ${disponiveis.length > 0 ? `(${disponiveis.length})` : ""}`}>
        {disponiveis.length === 0 ? (
          <VazioComAcao titulo="Nenhuma ata disponível no momento" descricao="Todas as atas já têm um vendedor." />
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
                  {ata.categoria && (
                    <span
                      className="eyebrow rounded-full border px-2.5 py-0.5"
                      style={{ borderColor: corDaCategoria(ata.categoria), color: corDaCategoria(ata.categoria) }}
                    >
                      {rotuloDaCategoria(ata.categoria)}
                    </span>
                  )}
                  <form action={reivindicarAta.bind(null, ata.id)}>
                    <button type="submit" className="botao-atas">
                      Pegar esta ata
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
