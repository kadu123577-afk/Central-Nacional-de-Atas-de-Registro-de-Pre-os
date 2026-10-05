import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { moedaCurta } from "@/lib/formato";
import { resumirComissao } from "@/lib/recebiveis";
import { LinhaRecebivel } from "./linha-recebivel";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

type FiltroLinhas = "todas" | "cobrar" | "sem_nota" | "recebidas";

const ROTULO_FILTRO: Record<FiltroLinhas, string> = {
  todas: "Todas",
  cobrar: "Com comissão a cobrar",
  sem_nota: "Aguardando 1ª nota",
  recebidas: "Quitadas",
};

/**
 * Controle de recebíveis do canal de vendedores (2026-10-01, pedido
 * explícito): "quantas atas foram aderidas e qual o valor que foi
 * aderido e qual o vendedor que vendeu, para termos controle de
 * recebíveis". Separado de /admin/faturamento (que é o canal de
 * autoatendimento do órgão, ligado a Adesao/Item) porque aqui a adesão
 * nasce do Kanban do vendedor (OportunidadeVenda), outro pipeline
 * comercial — mesma régua de negócio (percentual sobre o liquidado),
 * fonte de dados diferente. Redesenhado na fase 2 (2026-10-05): indicadores
 * da cascata completa, filtros por situação e barra de liquidação por linha.
 */
export default async function RecebiveisVendedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const { f } = await searchParams;
  const filtro: FiltroLinhas = f === "cobrar" || f === "sem_nota" || f === "recebidas" ? f : "todas";

  const oportunidadesAderidas = await prisma.oportunidadeVenda.findMany({
    where: { estagio: "aderiu" },
    include: {
      ata: { include: { fornecedor: true } },
      entidadeAlvo: true,
      vendedor: true,
      liquidacoes: { orderBy: { dataLiquidacao: "desc" } },
    },
    orderBy: { atualizadoEm: "desc" },
  });

  const linhas = oportunidadesAderidas.map((o) => {
    const somaLiquidado = o.liquidacoes.reduce((soma, l) => soma + Number(l.valorLiquidado), 0);
    const percentual = o.percentualComissao ? Number(o.percentualComissao) : 0;
    const comissao = resumirComissao(
      o.liquidacoes.map((l) => ({ valorLiquidado: Number(l.valorLiquidado), statusCobranca: l.statusCobranca })),
      percentual,
    );
    return {
      oportunidade: o,
      valorAderido: o.valorAderido ? Number(o.valorAderido) : 0,
      somaLiquidado,
      valorAReceber: comissao.devida,
      valorRecebido: comissao.recebida,
      aCobrar: o.liquidacoes.filter((l) => l.statusCobranca === "pendente").length,
    };
  });

  const totalAderido = linhas.reduce((soma, l) => soma + l.valorAderido, 0);
  const totalLiquidado = linhas.reduce((soma, l) => soma + l.somaLiquidado, 0);
  const totalComissaoDevida = linhas.reduce((soma, l) => soma + l.valorAReceber, 0);
  const totalRecebido = linhas.reduce((soma, l) => soma + l.valorRecebido, 0);
  const totalFaltaReceber = totalComissaoDevida - totalRecebido;
  const totalNotasACobrar = linhas.reduce((soma, l) => soma + l.aCobrar, 0);
  const pctLiquidado = totalAderido > 0 ? Math.round((totalLiquidado / totalAderido) * 100) : 0;

  const quitada = (l: (typeof linhas)[number]) =>
    l.oportunidade.liquidacoes.length > 0 && l.aCobrar === 0 && l.valorAReceber - l.valorRecebido < 0.005;
  const contagens: Record<FiltroLinhas, number> = {
    todas: linhas.length,
    cobrar: linhas.filter((l) => l.aCobrar > 0).length,
    sem_nota: linhas.filter((l) => l.oportunidade.liquidacoes.length === 0).length,
    recebidas: linhas.filter(quitada).length,
  };
  const exibidas = linhas.filter((l) => {
    if (filtro === "cobrar") return l.aCobrar > 0;
    if (filtro === "sem_nota") return l.oportunidade.liquidacoes.length === 0;
    if (filtro === "recebidas") return quitada(l);
    return true;
  });

  // Resumo por vendedor — "qual o vendedor que vendeu", agregado.
  const porVendedor = new Map<
    string,
    { nome: string; atasAderidas: number; valorAderido: number; valorAReceber: number; valorRecebido: number }
  >();
  for (const l of linhas) {
    const v = l.oportunidade.vendedor;
    const atual = porVendedor.get(v.id) ?? {
      nome: v.nome,
      atasAderidas: 0,
      valorAderido: 0,
      valorAReceber: 0,
      valorRecebido: 0,
    };
    atual.atasAderidas += 1;
    atual.valorAderido += l.valorAderido;
    atual.valorAReceber += l.valorAReceber;
    atual.valorRecebido += l.valorRecebido;
    porVendedor.set(v.id, atual);
  }
  const resumoVendedores = [...porVendedor.values()].sort((a, b) => b.valorAReceber - a.valorAReceber);

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-6xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Recebíveis — vendedores
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Adesões fechadas pelo time de vendas (Kanban), por município. O valor a receber é
            sempre sobre o que foi liquidado (nota fiscal), nunca sobre o valor aderido — o
            ente pode usar menos do que aderiu.
          </p>
        </div>
        <Link href="/admin" className="botao-atas link">
          ← Painel
        </Link>
      </div>

      <div className="kb-kpis">
        <div className="kb-kpi">
          <p className="eyebrow">Total aderido</p>
          <p className="kb-kpi-valor numero">{moedaCurta(totalAderido)}</p>
          <p className="kb-kpi-nota">{linhas.length} município(s)</p>
        </div>
        <div className="kb-kpi">
          <p className="eyebrow">Total liquidado</p>
          <p className="kb-kpi-valor numero">{moedaCurta(totalLiquidado)}</p>
          <p className="kb-kpi-nota">{pctLiquidado}% do valor aderido</p>
        </div>
        <div className="kb-kpi">
          <p className="eyebrow">Comissão devida</p>
          <p className="kb-kpi-valor numero">{moedaCurta(totalComissaoDevida)}</p>
          <p className="kb-kpi-nota">sobre o liquidado</p>
        </div>
        <div className="kb-kpi">
          <p className="eyebrow">Comissão recebida</p>
          <p className="kb-kpi-valor numero" style={{ color: "var(--cor-marca-clara)" }}>
            {moedaCurta(totalRecebido)}
          </p>
          <p className="kb-kpi-nota">já paga pelo fornecedor</p>
        </div>
        <div className="kb-kpi">
          <p className="eyebrow">Falta receber</p>
          <p className="kb-kpi-valor numero" style={{ color: totalFaltaReceber > 0 ? "var(--cor-atencao)" : undefined }}>
            {moedaCurta(totalFaltaReceber)}
          </p>
          <p className="kb-kpi-nota">{totalNotasACobrar} nota(s) ainda a cobrar</p>
        </div>
      </div>

      {resumoVendedores.length > 0 && (
        <Secao titulo="Por vendedor">
          <div className="overflow-x-auto">
            <table className="tabela-atas">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Municípios aderidos</th>
                  <th>Valor aderido</th>
                  <th>Comissão devida</th>
                  <th>Recebida</th>
                  <th>Falta receber</th>
                </tr>
              </thead>
              <tbody>
                {resumoVendedores.map((v) => (
                  <tr key={v.nome}>
                    <td>{v.nome}</td>
                    <td className="numero">{v.atasAderidas}</td>
                    <td>
                      <Cifra valor={v.valorAderido} />
                    </td>
                    <td>
                      <Cifra valor={v.valorAReceber} />
                    </td>
                    <td>
                      <Cifra valor={v.valorRecebido} />
                    </td>
                    <td>
                      <Cifra valor={v.valorAReceber - v.valorRecebido} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      <Secao titulo={`Adesões (${exibidas.length})`}>
        <div className="kb-barra mb-4">
          {(Object.keys(ROTULO_FILTRO) as FiltroLinhas[]).map((chave) => (
            <Link
              key={chave}
              href={chave === "todas" ? "/admin/recebiveis-vendedores" : `/admin/recebiveis-vendedores?f=${chave}`}
              className="kb-chip"
              aria-current={filtro === chave ? "page" : undefined}
            >
              {ROTULO_FILTRO[chave]}
              <b className="numero">{contagens[chave]}</b>
            </Link>
          ))}
        </div>
        {exibidas.length === 0 ? (
          <VazioComAcao
            titulo={linhas.length === 0 ? "Nenhuma adesão registrada ainda" : "Nenhuma adesão neste filtro"}
            descricao={
              linhas.length === 0
                ? "Nasce quando um vendedor marca uma oportunidade como 'Aderiu' no Kanban."
                : "Troque o filtro acima para ver as demais."
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {exibidas.map(({ oportunidade: o, valorAderido }) => (
              <LinhaRecebivel
                key={o.id}
                oportunidadeId={o.id}
                nomeMunicipio={o.entidadeAlvo.nome}
                uf={o.entidadeAlvo.uf}
                ataNumero={o.ata.numero}
                fornecedorRazaoSocial={o.ata.fornecedor.razaoSocial}
                vendedorNome={o.vendedor.nome}
                valorAderido={String(valorAderido)}
                percentualComissao={o.percentualComissao ? o.percentualComissao.toString() : "0"}
                liquidacoes={o.liquidacoes.map((l) => ({
                  id: l.id,
                  valorLiquidado: l.valorLiquidado.toString(),
                  numeroNotaFiscal: l.numeroNotaFiscal,
                  dataLiquidacao: l.dataLiquidacao.toISOString(),
                  tipo: l.tipo,
                  statusCobranca: l.statusCobranca,
                  notaFiscalComissao: l.notaFiscalComissao,
                }))}
              />
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
