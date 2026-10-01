import Link from "next/link";
import { redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { ROTULO_CATEGORIA_CONSUMO } from "@/lib/classificador-objeto";
import { NAV_VENDEDOR } from "../nav";

export const dynamic = "force-dynamic";

/** Lista de municípios levantados, com as necessidades (raio-X) já
 * identificadas — visão geral pro vendedor pesquisar antes de reivindicar
 * uma ata, sem precisar passar pelo painel de admin. */
export default async function MunicipiosVendedorPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  const { q } = await searchParams;
  const busca = q?.trim() ?? "";

  const municipios = await prisma.entidadeAlvo.findMany({
    where: {
      tipo: "municipal",
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: "insensitive" } },
              { uf: { contains: busca, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { historicoConsumo: true },
    orderBy: { nome: "asc" },
    take: 100,
  });

  return (
    <AppShell area="Vendedor" itens={NAV_VENDEDOR}>
      <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
        Municípios
      </h1>

      <Secao titulo="Buscar">
        <form className="flex gap-3">
          <input
            name="q"
            defaultValue={busca}
            placeholder="Nome do município ou UF"
            className="campo-atas flex-1"
          />
          <button type="submit" className="botao-atas">
            Buscar
          </button>
        </form>
      </Secao>

      {municipios.length === 0 ? (
        <VazioComAcao titulo="Nenhum município encontrado" descricao="Tente outro termo de busca." />
      ) : (
        <ul className="flex flex-col gap-3">
          {municipios.map((m) => (
            <li key={m.id} className="painel p-4 transition-colors hover:border-[var(--cor-borda-forte)]">
              <Link href={`/vendedor/municipios/${m.id}`} className="block">
                <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                  {m.nome}
                  {m.uf ? `/${m.uf}` : ""}
                </p>
                {m.historicoConsumo.length === 0 ? (
                  <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    Raio-X ainda não identificou necessidades.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.historicoConsumo.map((h) => (
                      <span
                        key={h.categoria}
                        className="eyebrow rounded-full border px-2 py-0.5"
                        style={{ borderColor: "var(--cor-borda-forte)", color: "var(--cor-texto-2)" }}
                      >
                        {ROTULO_CATEGORIA_CONSUMO[h.categoria] ?? h.categoria}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {municipios.length === 100 && (
        <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
          Mostrando os primeiros 100 resultados — refine a busca pra ver outros.
        </p>
      )}
    </AppShell>
  );
}
