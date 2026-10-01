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

  const minhasAtas = await prisma.ata.findMany({
    where: { vendedorId },
    include: {
      fornecedor: true,
      oportunidades: true,
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
      const valor = ata.categoria ? (valorPorEntidadeCategoria.get(`${o.entidadeAlvoId}|${ata.categoria}`) ?? 0) : 0;
      if (o.estagio === "aderiu") {
        valorFechado += valor;
        aderidas += 1;
      } else if (o.estagio === "a_contatar" || o.estagio === "em_negociacao") {
        valorEmAberto += valor;
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

  return (
    <AppShell area="Vendedor" itens={NAV_VENDEDOR}>
      <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
        Dashboard
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="painel p-4">
          <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
            Atas reivindicadas
          </p>
          <p className="marca text-3xl" style={{ color: "var(--cor-texto)" }}>
            {minhasAtas.length}
          </p>
        </div>
        <div className="painel p-4">
          <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
            Atas vendidas (1+ adesão)
          </p>
          <p className="marca text-3xl" style={{ color: "var(--cor-marca-clara)" }}>
            {totalAtasVendidas}
          </p>
        </div>
        <div className="painel p-4">
          <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
            Valor já fechado
          </p>
          <p className="marca text-3xl" style={{ color: "var(--cor-marca-clara)" }}>
            <Cifra valor={valorFechadoGeral} />
          </p>
        </div>
        <div className="painel p-4">
          <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
            Valor ainda em aberto
          </p>
          <p className="marca text-3xl" style={{ color: "var(--cor-texto)" }}>
            <Cifra valor={valorEmAbertoGeral} />
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
                  <th>Valor ainda em aberto</th>
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
                      {aderidas}/{total}
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
