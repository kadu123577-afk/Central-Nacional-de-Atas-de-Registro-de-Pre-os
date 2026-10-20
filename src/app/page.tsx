import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CATEGORIAS_ATAS, rotuloDaCategoria } from "@/lib/categorias";
import { diasParaVencer } from "@/lib/atas";
import { percentualSaldo, percentualSaldoItem, UFS } from "@/lib/vitrine";
import { BarraTopo } from "@/components/ui/barra-topo";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { TabelaAtasVitrine } from "@/components/ui/tabela-atas-vitrine";

export const dynamic = "force-dynamic";

const PASSOS = [
  {
    titulo: "Encontre a ata",
    texto: "Busque pelo objeto ou pelo item e confira vigência, preço e saldo disponível.",
    quem: "Seu órgão",
  },
  {
    titulo: "Peça a adesão",
    texto: "Escolha os itens e as quantidades. O pedido sai completo para o gerenciador avaliar.",
    quem: "Seu órgão",
  },
  {
    titulo: "Receba os aceites",
    texto: "O órgão gerenciador e o fornecedor analisam. Você acompanha cada resposta.",
    quem: "Gerenciador e fornecedor",
  },
  {
    titulo: "Formalize e contrate",
    texto: "Com a justificativa de vantagem e a pesquisa de preços, seu órgão conclui o processo.",
    quem: "Seu órgão",
  },
];

function IconeBusca() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default async function Home() {
  // Ata aprovada e ainda dentro da vigência — mesma regra de
  // src/lib/atas.ts (ataDisponivelParaAdesao), aplicada aqui como filtro
  // de banco porque essas consultas não carregam o registro inteiro da
  // ata pra chamar a função. isSeed: false — a home pública só mostra
  // dado real; o catálogo (tela de trabalho) continua vendo demonstração.
  const ataDisponivel = { status: "APROVADA" as const, dataVigenciaFim: { gte: new Date() }, isSeed: false };

  const [contagens, recentes, totalAtas, totalItens, estados, somaRegistrada, somaConsumida] = await Promise.all([
    Promise.all(
      CATEGORIAS_ATAS.map(async (c) => ({
        ...c,
        total: await prisma.ata.count({ where: { categoria: c.slug, ...ataDisponivel } }),
      })),
    ),
    prisma.ata.findMany({
      where: ataDisponivel,
      include: {
        orgaoGerenciador: { select: { nome: true, uf: true } },
        itens: { select: { quantidadeRegistrada: true, saldo: { select: { quantidadeConsumida: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.ata.count({ where: ataDisponivel }),
    prisma.item.count({ where: { ata: ataDisponivel } }),
    prisma.orgao.findMany({
      where: { atasGerenciadas: { some: ataDisponivel } },
      select: { uf: true },
      distinct: ["uf"],
    }),
    prisma.item.aggregate({ where: { ata: ataDisponivel }, _sum: { quantidadeRegistrada: true } }),
    prisma.saldo.aggregate({ where: { item: { ata: ataDisponivel } }, _sum: { quantidadeConsumida: true } }),
  ]);

  const maisProcurados = contagens.filter((c) => c.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);

  // Destaque: a ata recente com mais itens, com os quatro primeiros itens.
  const escolhida = [...recentes].sort((a, b) => b.itens.length - a.itens.length)[0];
  const destaque = escolhida
    ? await prisma.ata.findUnique({
        where: { id: escolhida.id },
        include: {
          orgaoGerenciador: { select: { nome: true, uf: true } },
          itens: {
            include: { saldo: { select: { quantidadeConsumida: true } } },
            orderBy: { descricao: "asc" },
            take: 4,
          },
          _count: { select: { itens: true } },
        },
      })
    : null;

  const teto = 2 * (somaRegistrada._sum.quantidadeRegistrada ?? 0);
  const saldoMedio = teto > 0 ? Math.max(0, Math.round(((teto - (somaConsumida._sum.quantidadeConsumida ?? 0)) / teto) * 100)) : null;

  return (
    <main className="flex flex-col">
      <BarraTopo />

      {/* ---- herói ---- */}
      <section style={{ background: "linear-gradient(180deg, var(--cor-superficie) 0%, var(--cor-fundo) 100%)" }}>
        {/* Tudo centralizado, no mesmo eixo de "Como funciona a adesão" (pedido do Carlos, 19/10). */}
        <div className="mx-auto flex max-w-[1040px] flex-col items-center px-6 pb-14 pt-16">
          <div className="flex w-full flex-col items-center text-center">
            <p className="selo-ponto">Catálogo nacional de atas de registro de preços</p>
            <h1
              className="mt-5 max-w-[820px] font-extrabold"
              style={{
                fontSize: "clamp(38px, 5.2vw, 56px)",
                lineHeight: 1.02,
                letterSpacing: "-0.045em",
                color: "var(--cor-texto)",
                textWrap: "balance",
              }}
            >
              Encontre atas vigentes com <span className="marca-destaque">saldo para o seu órgão aderir</span>.
            </h1>
            <p className="mt-5 max-w-[600px] text-[17px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
              Atas publicadas por outros órgãos, organizadas por objeto, UF e prazo. Veja itens,
              preços e quanto ainda pode ser aderido, e faça o pedido em um só lugar.
            </p>

            <form
              action="/catalogo"
              method="GET"
              className="painel mt-8 flex w-full max-w-[780px] flex-col gap-3 p-2 text-left sm:flex-row sm:items-stretch"
            >
              <label className="flex-1 px-3 py-1.5">
                <span className="block text-[11.5px] font-semibold" style={{ color: "var(--cor-texto)" }}>
                  O que o seu órgão precisa comprar?
                </span>
                <input
                  name="q"
                  placeholder="Ex.: luminária LED, dipirona"
                  className="mt-1 w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--cor-texto-3)]"
                />
              </label>
              <label className="px-3 py-1.5 sm:w-44 sm:border-l" style={{ borderColor: "var(--cor-borda)" }}>
                <span className="block text-[11.5px] font-semibold" style={{ color: "var(--cor-texto)" }}>
                  Estado (UF)
                </span>
                <select name="uf" defaultValue="" className="mt-1 w-full bg-transparent text-[15px] outline-none">
                  <option value="">Todas as UFs</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="botao-atas px-6">
                <IconeBusca /> Buscar atas
              </button>
            </form>

            {maisProcurados.length > 0 && (
              <div className="mt-6 flex max-w-[820px] flex-wrap items-center justify-center gap-2">
                <span className="mr-1 text-[13px]" style={{ color: "var(--cor-texto-3)" }}>
                  Mais procurados
                </span>
                {maisProcurados.map((c) => (
                  <Link key={c.slug} href={`/catalogo?categoria=${encodeURIComponent(c.slug)}`} className="chip-site">
                    {c.rotulo} <b>{c.total}</b>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {destaque && (
            <div className="painel painel-destaque mt-12 w-full max-w-[640px] p-6" style={{ borderRadius: 18 }}>
              <div className="flex items-center justify-between gap-3">
                <span className="eyebrow">Ata em destaque</span>
                <span className="codigo text-[11px]" style={{ color: "var(--cor-texto-3)" }}>
                  Nº {destaque.numero}
                </span>
              </div>
              <h2 className="marca mt-3 text-[19px] leading-snug" style={{ color: "var(--cor-texto)" }}>
                {destaque.objeto}
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--cor-texto-3)" }}>
                {[destaque.categoria ? rotuloDaCategoria(destaque.categoria) : null, destaque.orgaoGerenciador.uf, destaque.orgaoGerenciador.nome]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div
                className="mt-4 flex items-center justify-between rounded-[10px] px-3.5 py-2.5 text-[13px]"
                style={{ background: "var(--cor-superficie-2)" }}
              >
                <span>
                  <span className="numero font-semibold" style={{ color: "var(--cor-texto)" }}>
                    até {destaque.dataVigenciaFim.toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                  </span>{" "}
                  <span style={{ color: "var(--cor-texto-3)" }}>{diasParaVencer(destaque.dataVigenciaFim)} dias</span>
                </span>
                <span style={{ color: "var(--cor-texto-2)" }}>
                  {destaque._count.itens} {destaque._count.itens === 1 ? "item" : "itens"}
                </span>
              </div>
              <table className="mt-3 w-full text-[13px]">
                <thead>
                  <tr style={{ color: "var(--cor-texto-2)" }}>
                    <th className="py-2 text-left font-semibold">Item</th>
                    <th className="py-2 text-right font-semibold">Preço</th>
                    <th className="w-24 py-2 pl-4 text-left font-semibold">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {destaque.itens.map((item) => {
                    const saldo = percentualSaldoItem(item) ?? 0;
                    return (
                      <tr key={item.id} className="border-t" style={{ borderColor: "var(--cor-borda)" }}>
                        <td className="py-2.5 pr-3" style={{ color: "var(--cor-texto)" }}>
                          {item.descricao}
                        </td>
                        <td className="whitespace-nowrap py-2.5 text-right">
                          <b style={{ color: "var(--cor-texto)" }}>
                            <Cifra valor={item.valorUnitario} />
                          </b>{" "}
                          <span className="text-[11px]" style={{ color: "var(--cor-texto-3)" }}>
                            /{item.unidade}
                          </span>
                        </td>
                        <td className="py-2.5 pl-4">
                          <span className="flex items-center gap-2">
                            <span className="barra-saldo flex-1">
                              <span className="block h-full rounded-full" style={{ width: `${saldo}%`, background: "var(--cor-marca)" }} />
                            </span>
                            <span className="numero text-[11.5px] font-bold" style={{ color: "var(--cor-texto)" }}>
                              {saldo}%
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Link href={`/catalogo/${destaque.id}`} className="botao-atas mt-4 w-full">
                Ver a ata completa
              </Link>
            </div>
          )}
        </div>

        {totalAtas > 0 && (
          <div className="mx-auto max-w-[1040px] px-6 pb-12">
            <div className="faixa-numeros">
              <div>
                <strong style={{ color: "var(--cor-marca-clara)" }}>{totalAtas}</strong>
                <span>Atas vigentes</span>
              </div>
              <div>
                <strong>{totalItens}</strong>
                <span>Itens com saldo para adesão</span>
              </div>
              <div>
                <strong>{estados.length}</strong>
                <span>{estados.length === 1 ? "Estado de origem" : "Estados de origem"}</span>
              </div>
              {saldoMedio !== null && (
                <div>
                  <strong>{saldoMedio}%</strong>
                  <span>Saldo médio disponível</span>
                </div>
              )}
            </div>
            <p className="mt-2.5 text-right text-xs" style={{ color: "var(--cor-texto-3)" }}>
              Atualizado em {new Date().toLocaleDateString("pt-BR")}. Só contamos atas dentro da vigência.
            </p>
          </div>
        )}
      </section>

      {/* ---- atas recentes ---- */}
      <section className="border-t" style={{ borderColor: "var(--cor-borda)", background: "var(--cor-superficie)" }}>
        <div className="mx-auto max-w-[1040px] px-6 py-14">
          <div className="flex flex-col items-center text-center">
            <h2 className="marca text-[30px]" style={{ color: "var(--cor-texto)", fontWeight: 800, letterSpacing: "-0.035em" }}>
              Atas publicadas recentemente
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
              As últimas atas que entraram no catálogo. Clique em uma para ver os itens, os preços e
              o saldo de cada um.
            </p>
            {totalAtas > 0 && (
              <Link href="/catalogo" className="botao-atas link mt-2">
                Ver todas as {totalAtas} atas →
              </Link>
            )}
          </div>
          <div className="mt-7">
            {recentes.length === 0 ? (
              <VazioComAcao
                titulo="Catálogo ainda vazio"
                descricao="Assim que as primeiras atas forem aprovadas, elas aparecem aqui."
              />
            ) : (
              <TabelaAtasVitrine
                atas={recentes.map((ata) => ({
                  id: ata.id,
                  numero: ata.numero,
                  objeto: ata.objeto,
                  categoria: ata.categoria,
                  orgao: ata.orgaoGerenciador.nome,
                  uf: ata.orgaoGerenciador.uf,
                  itens: ata.itens.length,
                  vigenciaFim: ata.dataVigenciaFim,
                  saldo: percentualSaldo(ata.itens),
                }))}
              />
            )}
          </div>
        </div>
      </section>

      {/* ---- como funciona ---- */}
      <section className="border-t" style={{ borderColor: "var(--cor-borda)", background: "var(--cor-superficie-2)" }}>
        <div className="mx-auto max-w-[1040px] px-6 py-16 text-center">
          <h2 className="marca text-[30px]" style={{ color: "var(--cor-texto)", fontWeight: 800, letterSpacing: "-0.035em" }}>
            Como funciona a adesão
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-[15px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
            A adesão a uma ata de registro de preços (o &ldquo;carona&rdquo;) é um caminho previsto em
            lei. A plataforma organiza a informação e o pedido; as decisões continuam com os órgãos e
            o fornecedor.
          </p>
          <ol className="passos mt-12">
            {PASSOS.map((passo, i) => (
              <li key={passo.titulo} className="passo" data-ativo={i === PASSOS.length - 1}>
                <span className="passo-numero">{i + 1}</span>
                <p className="marca text-[16px]" style={{ color: "var(--cor-texto)" }}>
                  {passo.titulo}
                </p>
                <p className="mx-auto mt-2 max-w-[220px] text-[13px] leading-relaxed" style={{ color: "var(--cor-texto-3)" }}>
                  {passo.texto}
                </p>
                <span
                  className="mt-3 inline-block rounded-full border px-3 py-1 text-[11.5px] font-semibold"
                  style={{ borderColor: "var(--cor-borda)", background: "var(--cor-superficie)", color: "var(--cor-texto-2)" }}
                >
                  {passo.quem}
                </span>
              </li>
            ))}
          </ol>
          <div className="caixa-info mx-auto mt-12 max-w-3xl text-left">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 7.2v3.6M8 5.2v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p>
              <b>A adesão não é automática.</b> Ela exige justificativa da vantagem, compatibilidade
              dos preços com o mercado e aceite do órgão gerenciador e do fornecedor (Lei
              14.133/2021, art. 86). Cada órgão pode aderir a até 50% da quantidade registrada por
              item.
            </p>
          </div>
        </div>
      </section>

      {/* ---- chamada (verde profundo) ---- */}
      <section style={{ background: "linear-gradient(135deg, var(--cor-profundo-faixa) 0%, var(--cor-profundo) 100%)" }}>
        <div className="mx-auto grid max-w-[1040px] gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow" style={{ color: "var(--cor-ouro-claro)" }}>
              Não achou a ata?
            </p>
            <h2
              className="mt-3 font-extrabold"
              style={{ fontSize: 34, lineHeight: 1.08, letterSpacing: "-0.04em", color: "var(--cor-superficie)" }}
            >
              Conte o que o seu órgão precisa e a gente procura por você.
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed" style={{ color: "var(--cor-profundo-texto)" }}>
              Cadastre o seu órgão e registre a necessidade. A equipe verifica se existe ata vigente
              com saldo em outras regiões e responde pelo contato informado.
            </p>
            <ol className="mt-6 flex flex-col gap-3">
              {["Você descreve a necessidade", "A equipe busca atas compatíveis", "Você recebe as opções com saldo"].map((t, i) => (
                <li key={t} className="flex items-center gap-3 font-bold" style={{ color: "var(--cor-superficie)" }}>
                  <span
                    className="grid size-7 place-items-center rounded-full border text-xs"
                    style={{ borderColor: "var(--cor-profundo-texto-2)", color: "var(--cor-profundo-texto)" }}
                  >
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ol>
          </div>
          <div className="painel p-7" style={{ borderRadius: 18 }}>
            <p className="marca text-lg" style={{ color: "var(--cor-texto)" }}>
              Órgão público
            </p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
              O cadastro é gratuito para o órgão. Com ele, você faz o pedido de adesão pela
              plataforma e acompanha cada resposta.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Link href="/orgao/cadastro" className="botao-atas">
                Cadastrar meu órgão
              </Link>
              <Link href="/orgao/login" className="botao-atas link">
                Já tenho cadastro →
              </Link>
            </div>
            <p className="mt-5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
              Usamos os dados só para responder ao seu pedido. Veja a{" "}
              <Link href="/politica-privacidade" className="underline">
                política de privacidade
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
