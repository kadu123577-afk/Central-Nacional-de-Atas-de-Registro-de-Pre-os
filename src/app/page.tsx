import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CATEGORIAS_ATAS } from "@/lib/categorias";
import { BarraTopo } from "@/components/ui/barra-topo";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { TituloCiclico } from "@/components/ui/titulo-ciclico";
import { VitrineInclinada } from "@/components/ui/vitrine-inclinada";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Ata aprovada e ainda dentro da vigência — mesma regra de
  // src/lib/atas.ts (ataDisponivelParaAdesao), aplicada aqui como filtro
  // de banco porque essas consultas não carregam o registro inteiro da
  // ata pra chamar a função.
  const ataDisponivel = { status: "APROVADA" as const, dataVigenciaFim: { gte: new Date() } };

  // A home navega por tema de ata, não por item — uma ata com seis itens
  // quase idênticos (ex.: variações de máscara cirúrgica) conta como uma
  // ata só, não seis linhas. isSeed: false — a home pública só mostra
  // dado real; o catálogo (tela de trabalho) continua vendo demonstração.
  const contagens = await Promise.all(
    CATEGORIAS_ATAS.map(async (c) => ({
      ...c,
      total: await prisma.ata.count({
        where: { categoria: c.rotulo, ...ataDisponivel, isSeed: false },
      }),
    })),
  );

  const totalGeral = contagens.reduce((soma, c) => soma + c.total, 0);
  const contagensOrdenadas = [...contagens].sort((a, b) => b.total - a.total);
  const categoriasParaExibir = contagens.some((c) => c.total > 0)
    ? contagensOrdenadas.filter((c) => c.total > 0)
    : contagensOrdenadas;
  const [destaque, ...resto] = categoriasParaExibir;

  const categoriasEmDestaque = contagensOrdenadas.slice(0, 2).filter((c) => c.total > 0);

  const atasVitrine = destaque
    ? await prisma.ata.findMany({
        where: { categoria: destaque.rotulo, ...ataDisponivel, isSeed: false },
        include: { _count: { select: { itens: true } } },
        orderBy: { dataVigenciaFim: "asc" },
        take: 3,
      })
    : [];

  const secoesDestaque = await Promise.all(
    categoriasEmDestaque.map(async (c) => ({
      categoria: c,
      atas: await prisma.ata.findMany({
        where: { categoria: c.rotulo, ...ataDisponivel, isSeed: false },
        include: { fornecedor: true, orgaoGerenciador: true, _count: { select: { itens: true } } },
        take: 4,
        orderBy: { dataVigenciaFim: "asc" },
      }),
    })),
  );

  return (
    <main className="flex min-h-screen flex-col">
      <BarraTopo />

      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        <p className="max-w-2xl text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Adesão <TituloCiclico palavras={["simples", "segura", "auditável"]} /> a atas de
          registro de preços vigentes, com a trava do art. 86 da Lei 14.133/2021 aplicada
          automaticamente.
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8">
        {totalGeral === 0 ? (
          <VazioComAcao
            titulo="Catálogo ainda vazio"
            descricao="Assim que as primeiras atas forem aprovadas, elas aparecem aqui."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {destaque && (
                <Link
                  key={destaque.slug}
                  href={`/catalogo?categoria=${encodeURIComponent(destaque.rotulo)}`}
                  className="painel relative flex min-h-72 flex-col justify-between gap-4 p-5 transition-colors hover:border-[var(--cor-borda-forte)] lg:col-span-2 lg:row-span-2"
                >
                  {atasVitrine.length > 0 && (
                    <VitrineInclinada>
                      <ul className="flex flex-col gap-2">
                        {atasVitrine.map((ata) => (
                          <li key={ata.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate" style={{ color: "var(--cor-texto-2)" }}>
                              Ata {ata.numero}
                            </span>
                            <span style={{ color: "var(--cor-texto)" }}>
                              {ata._count.itens} {ata._count.itens === 1 ? "item" : "itens"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </VitrineInclinada>
                  )}
                  <div>
                    <span className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
                      {destaque.rotulo}
                    </span>
                    <span className="eyebrow mt-2 block">
                      {destaque.total} {destaque.total === 1 ? "ata disponível" : "atas disponíveis"}
                    </span>
                  </div>
                </Link>
              )}
              {resto.map((c) => (
                <Link
                  key={c.slug}
                  href={`/catalogo?categoria=${encodeURIComponent(c.rotulo)}`}
                  className="painel relative flex min-h-32 flex-col justify-end p-5 transition-colors hover:border-[var(--cor-borda-forte)]"
                >
                  <span className="marca text-base" style={{ color: "var(--cor-texto)" }}>
                    {c.rotulo}
                  </span>
                  <span className="eyebrow mt-2">
                    {c.total} {c.total === 1 ? "ata disponível" : "atas disponíveis"}
                  </span>
                </Link>
              ))}
            </div>

            {secoesDestaque.map(({ categoria, atas }) => (
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
                  {atas.map((ata) => (
                    <Link key={ata.id} href={`/catalogo/${ata.id}`} className="painel p-4">
                      <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                        Ata {ata.numero}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {ata.fornecedor.razaoSocial}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <Badge tom="neutro">{ata.orgaoGerenciador.uf}</Badge>
                        <span className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                          {ata._count.itens} {ata._count.itens === 1 ? "item" : "itens"}
                        </span>
                      </div>
                    </Link>
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
