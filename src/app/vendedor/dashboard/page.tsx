import Link from "next/link";
import { redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { FunilVendedor, KpisVendedor, TarefasHoje } from "@/components/vendedor/painel-resumo";
import { rotuloDaCategoria } from "@/lib/categorias";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { carregarPainelVendedor } from "@/lib/painel-vendedor-db";
import { logoutVendedor } from "../actions";
import { NAV_VENDEDOR } from "../nav";

export const dynamic = "force-dynamic";

/**
 * Dashboard do vendedor (2026-10-01, redesenhado na fase 2 em 2026-10-04):
 * indicadores, o que fazer hoje, funil por valor e desempenho por ata.
 * "Valor já fechado" é sempre o valor real aderido; "em aberto" é
 * estimativa pelo histórico de consumo — nunca o valor da ata.
 */
export default async function DashboardVendedorPage() {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId } });
  if (!vendedor) redirect("/vendedor/login");

  await expirarOportunidadesVencidas();
  const painel = await carregarPainelVendedor(vendedorId);

  const primeiroNome = vendedor.nome.split(" ")[0];

  return (
    <AppShell
      area={`Vendedor — ${vendedor.nome}`}
      itens={NAV_VENDEDOR}
      larguraMaxima="max-w-7xl"
      rodape={
        <form action={logoutVendedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
        Olá, {primeiroNome}
      </h1>

      <KpisVendedor kpis={painel.kpis} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TarefasHoje tarefas={painel.tarefas} />
        <FunilVendedor funil={painel.funil} />
      </div>

      <Secao titulo="Desempenho por ata">
        {painel.atas.length === 0 ? (
          <VazioComAcao
            titulo="Nenhuma ata em negociação ainda"
            descricao="Peça municípios de uma ata disponível na aba Atas pra começar a ver seu desempenho aqui."
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
                {painel.atas.map((a) => (
                  <tr key={a.ataId}>
                    <td>
                      <Link href={`/vendedor/atas/${a.ataId}`} className="underline">
                        Ata {a.ataNumero}
                      </Link>
                    </td>
                    <td>{a.categoria ? rotuloDaCategoria(a.categoria) : "Sem categoria"}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="kb-progresso" style={{ marginTop: 0, width: 80 }}>
                          <div style={{ width: a.total > 0 ? `${(a.aderidas / a.total) * 100}%` : "0%" }} />
                        </div>
                        <span className="whitespace-nowrap text-xs" style={{ color: "var(--cor-texto-2)" }}>
                          {a.aderidas}/{a.total}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Cifra valor={a.valorFechado} />
                    </td>
                    <td>
                      <Cifra valor={a.valorEmAberto} />
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
