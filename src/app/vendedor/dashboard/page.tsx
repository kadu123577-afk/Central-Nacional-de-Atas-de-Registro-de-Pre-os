import Link from "next/link";
import { redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { Cifra } from "@/components/ui/valores";
import { rotuloDaCategoria } from "@/lib/categorias";
import { NAV_VENDEDOR } from "../nav";

export const dynamic = "force-dynamic";

/**
 * Desempenho do vendedor (2026-10-01) — pedido explícito do usuário:
 * "quantas atas ele vendeu, qual o valor que ainda tem pra aderir de
 * cada ata, e qual seria o valor de cada ata que ele ainda pode sofrer
 * adesão". Valor estimado por oportunidade = valor da última
 * contratação daquele município na mesma categoria da ata (sinal real
 * de histórico de consumo, não um número inventado).
 */
export default async function DashboardVendedorPage() {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId } });
  if (!vendedor) redirect("/vendedor/login");

  const minhasAtas = await prisma.ata.findMany({
    where: { oportunidades: { some: { vendedorId, expiradaEm: null } } },
    include: {
      fornecedor: true,
      // Só os municípios deste vendedor (a ata pode ter outros vendedores).
      oportunidades: { where: { vendedorId, expiradaEm: null } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Valor estimado por (entidade, categoria) — busca só as categorias
  // em jogo nas atas deste vendedor, pra não trazer o histórico de
  // consumo inteiro de todo mundo.
  const categoriasEmJogo = [...new Set(minhasAtas.map((a) => a.categoria).filter((c): c is string => !!c))];
  const entidadesEmJogo = [...new Set(minhasAtas.flatMap((a) => a.oportunidades.map((o) => o.entidadeAlvoId)))];

  const historico =
    categoriasEmJogo.length > 0 && entidadesEmJogo.length > 0
      ? await prisma.historicoConsumoCategoria.findMany({
          where: { categoria: { in: categoriasEmJogo }, entidadeAlvoId: { in: entidadesEmJogo } },
        })
      : [];
  const valorPorEntidadeCategoria = new Map<string, number>();
  for (const h of historico) {
    valorPorEntidadeCategoria.set(`${h.entidadeAlvoId}|${h.categoria}`, Number(h.valorUltimaContratacao));
  }

  const linhasPorAta = minhasAtas.map((ata) => {
    let valorFechado = 0;
    let valorEmAberto = 0;
    let aderidas = 0;
    for (const o of ata.oportunidades) {
      if (o.estagio === "aderiu") {
        // Valor real registrado na adesão, nunca a estimativa — é o que
        // vale pro controle de recebíveis (ver /admin/recebiveis).
        valorFechado += o.valorAderido ? Number(o.valorAderido) : 0;
        aderidas += 1;
      } else if (o.estagio === "a_contatar" || o.estagio === "em_negociacao") {
        // Aqui ainda não existe valor real — é só um indicativo de
        // apetite de mercado (última contratação dessa categoria nesse
        // município, não o valor desta ata).
        valorEmAberto += ata.categoria
          ? (valorPorEntidadeCategoria.get(`${o.entidadeAlvoId}|${ata.categoria}`) ?? 0)
          : 0;
      }
    }
    return {
      ata,
      aderidas,
      total: ata.oportunidades.length,
      valorFechado,
      valorEmAberto,
    };
  });

  const totalAtasVendidas = linhasPorAta.filter((l) => l.aderidas > 0).length;
  const valorFechadoGeral = linhasPorAta.reduce((soma, l) => soma + l.valorFechado, 0);
  const valorEmAbertoGeral = linhasPorAta.reduce((soma, l) => soma + l.valorEmAberto, 0);

  const primeiroNome = vendedor.nome.split(" ")[0];

  return (
    <AppShell area={`Vendedor — ${vendedor.nome}`} itens={NAV_VENDEDOR} larguraMaxima="max-w-7xl">
      <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
        Olá, {primeiroNome}
      </h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="painel flex flex-col justify-between gap-4 p-8">
          <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
            Atas reivindicadas
          </p>
          <p className="marca text-5xl" style={{ color: "var(--cor-texto)" }}>
            {minhasAtas.length}
          </p>
        </div>
        <div className="painel flex flex-col justify-between gap-4 p-8">
          <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
            Atas vendidas (1+ adesão)
          </p>
          <p className="marca text-5xl" style={{ color: "var(--cor-marca-clara)" }}>
            {totalAtasVendidas}
          </p>
        </div>
        <div className="painel flex flex-col justify-between gap-4 p-8">
          <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
            Valor já fechado
          </p>
          <p
            className="marca whitespace-nowrap text-3xl"
            style={{ color: "var(--cor-marca-clara)" }}
          >
            <Cifra valor={valorFechadoGeral} />
          </p>
        </div>
        <div className="painel flex flex-col justify-between gap-4 p-8">
          <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
            Valor estimado em aberto
          </p>
          <p className="marca whitespace-nowrap text-3xl" style={{ color: "var(--cor-texto)" }}>
            <Cifra valor={valorEmAbertoGeral} />
          </p>
          <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
            Estimativa pelo histórico de consumo — não é o valor real da ata.
          </p>
        </div>
      </div>

      <Secao titulo="Desempenho por ata">
        {linhasPorAta.length === 0 ? (
          <VazioComAcao
            titulo="Nenhuma ata reivindicada ainda"
            descricao="Pegue uma ata disponível na aba Atas pra começar a ver seu desempenho aqui."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela-atas">
              <thead>
                <tr>
                  <th>Ata</th>
                  <th>Categoria</th>
                  <th>Aderiram</th>
                  <th>Valor já fechado</th>
                  <th>Valor estimado em aberto</th>
                </tr>
              </thead>
              <tbody>
                {linhasPorAta.map(({ ata, aderidas, total, valorFechado, valorEmAberto }) => (
                  <tr key={ata.id}>
                    <td>
                      <Link href={`/vendedor/atas/${ata.id}`} className="underline">
                        Ata {ata.numero}
                      </Link>
                    </td>
                    <td>{ata.categoria ? rotuloDaCategoria(ata.categoria) : "Sem categoria"}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 w-20 overflow-hidden rounded-full"
                          style={{ background: "var(--cor-superficie-2)" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: total > 0 ? `${(aderidas / total) * 100}%` : "0%",
                              background: "var(--cor-marca-clara)",
                            }}
                          />
                        </div>
                        <span className="whitespace-nowrap text-xs" style={{ color: "var(--cor-texto-2)" }}>
                          {aderidas}/{total}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Cifra valor={valorFechado} />
                    </td>
                    <td>
                      <Cifra valor={valorEmAberto} />
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
