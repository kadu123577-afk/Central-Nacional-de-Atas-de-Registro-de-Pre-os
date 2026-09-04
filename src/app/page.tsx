import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CATEGORIAS_ATAS } from "@/lib/categorias";
import { BarraTopo } from "@/components/ui/barra-topo";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";

export const dynamic = "force-dynamic";

export default async function Home() {
  const contagens = await Promise.all(
    CATEGORIAS_ATAS.map(async (c) => ({
      ...c,
      total: await prisma.item.count({
        where: { categoria: c.rotulo, ata: { status: "APROVADA" } },
      }),
    })),
  );

  const totalGeral = contagens.reduce((soma, c) => soma + c.total, 0);
  const categoriasParaExibir = contagens.some((c) => c.total > 0)
    ? contagens.filter((c) => c.total > 0)
    : contagens;

  const categoriasEmDestaque = [...contagens]
    .sort((a, b) => b.total - a.total)
    .slice(0, 2)
    .filter((c) => c.total > 0);

  const secoesDestaque = await Promise.all(
    categoriasEmDestaque.map(async (c) => ({
      categoria: c,
      itens: await prisma.item.findMany({
        where: { categoria: c.rotulo, ata: { status: "APROVADA" } },
        include: { ata: { include: { orgaoGerenciador: true } } },
        take: 4,
        orderBy: { descricao: "asc" },
      }),
    })),
  );

  return (
    <main className="flex min-h-screen flex-col">
      <BarraTopo />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8">
        {totalGeral === 0 ? (
          <VazioComAcao
            titulo="Catálogo ainda vazio"
            descricao="Assim que as primeiras atas forem aprovadas, elas aparecem aqui."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {categoriasParaExibir.map((c, indice) => (
                <Link
                  key={c.slug}
                  href={`/catalogo?categoria=${encodeURIComponent(c.rotulo)}`}
                  className={`painel relative flex min-h-32 flex-col justify-end p-5 transition-colors hover:border-[var(--cor-borda-forte)] ${
                    indice === 0 ? "lg:col-span-2 lg:row-span-2 lg:min-h-72" : ""
                  }`}
                >
                  <span
                    className={`marca ${indice === 0 ? "text-2xl" : "text-base"}`}
                    style={{ color: "var(--cor-texto)" }}
                  >
                    {c.rotulo}
                  </span>
                  <span className="eyebrow mt-2">
                    {c.total} {c.total === 1 ? "item" : "itens"} disponíveis
                  </span>
                </Link>
              ))}
            </div>

            {secoesDestaque.map(({ categoria, itens }) => (
              <Secao
                key={categoria.slug}
                titulo={categoria.rotulo}
                acao={
                  <Link
                    href={`/catalogo?categoria=${encodeURIComponent(categoria.rotulo)}`}
                    className="botao-atas link"
                  >
                    Ver tudo
                  </Link>
                }
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {itens.map((item) => (
                    <div key={item.id} className="painel p-4">
                      <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                        {item.descricao}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <Badge tom="neutro">{item.ata.orgaoGerenciador.uf}</Badge>
                        <span className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                          <Cifra valor={item.valorUnitario} />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Secao>
            ))}
          </>
        )}
      </div>
    </main>
  );
}
