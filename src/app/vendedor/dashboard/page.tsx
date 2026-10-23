import Link from "next/link";
import { redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { FunilVendedor, KpisVendedor, TarefasHoje } from "@/components/vendedor/painel-resumo";
import { corDaCategoria, rotuloDaCategoria } from "@/lib/categorias";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { carregarPainelVendedor } from "@/lib/painel-vendedor-db";
import { carregarIndicadoresSemanais } from "@/lib/indicadores-db";
import { fotoExata, semanaDe } from "@/lib/indicadores-semanais";
import { BlocoIndicadoresSemana } from "@/app/admin/indicadores/bloco-semana-vendedor";
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

  // Indicadores da semana: só deste consultor (id da sessão). Se a consulta falhar, o resto do painel segue.
  const agora = new Date();
  const semanaAtual = semanaDe(agora);
  const indicadoresSemana = await carregarIndicadoresSemanais(semanaAtual, { vendedorId }).catch((erro: unknown) => {
    console.error("Indicadores da semana do consultor indisponíveis:", erro);
    return null;
  });

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
      <CabecalhoPagina
        rotulo="Dashboard"
        titulo="Olá,"
        destaque={primeiroNome}
        descricao="Indicadores, o que fazer hoje, funil por valor e desempenho por ata."
      />

      <KpisVendedor kpis={painel.kpis} />

      <BlocoIndicadoresSemana resumo={indicadoresSemana} fotoExata={fotoExata(semanaAtual, agora)} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TarefasHoje tarefas={painel.tarefas} />
        <FunilVendedor funil={painel.funil} />
      </div>

      <Secao
        titulo="Desempenho por ata"
        descricao="Valor já fechado é o valor real aderido; o valor em aberto é estimativa pelo histórico de consumo."
      >
        {painel.atas.length === 0 ? (
          <VazioComAcao
            titulo="Nenhuma ata em negociação ainda"
            descricao="Peça municípios de uma ata disponível na aba Atas pra começar a ver seu desempenho aqui."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[720px]">
              <thead>
                <tr>
                  <th>Ata</th>
                  <th className="w-[190px]">Categoria</th>
                  <th className="w-[170px]">Aderiram</th>
                  <th className="w-[150px]">Valor já fechado</th>
                  <th className="w-[170px]">Valor estimado em aberto</th>
                </tr>
              </thead>
              <tbody>
                {painel.atas.map((a) => (
                  <tr key={a.ataId}>
                    <td>
                      <Link href={`/vendedor/atas/${a.ataId}`} className="titulo-linha block hover:text-[var(--cor-marca-clara)]">
                        Ata <span className="codigo">{a.ataNumero}</span>
                      </Link>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {a.fornecedor}
                      </span>
                    </td>
                    <td>
                      {a.categoria ? (
                        <span className="inline-flex items-start gap-2 text-[12.5px]">
                          <span
                            className="mt-1.5 inline-block size-2 shrink-0 rounded-full"
                            style={{ background: corDaCategoria(a.categoria) }}
                          />
                          {rotuloDaCategoria(a.categoria)}
                        </span>
                      ) : (
                        <span className="text-[12.5px]" style={{ color: "var(--cor-texto-3)" }}>
                          Sem categoria
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="numero block text-xs font-bold" style={{ color: "var(--cor-texto)" }}>
                        {a.aderidas}/{a.total}
                      </span>
                      <div className="barra-saldo mt-1.5">
                        <div style={{ width: a.total > 0 ? `${(a.aderidas / a.total) * 100}%` : "0%" }} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap font-bold" style={{ color: "var(--cor-texto)" }}>
                      <Cifra valor={a.valorFechado} />
                    </td>
                    <td className="whitespace-nowrap">
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
