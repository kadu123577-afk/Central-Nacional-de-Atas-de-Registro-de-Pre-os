import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Secao } from "@/components/ui/secao";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { moedaCurta } from "@/lib/formato";
import { contarPorSituacao, resumirComissao } from "@/lib/recebiveis";
import { LinhaRecebivel } from "./linha-recebivel";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

type FiltroLinhas = "todas" | "cobrar" | "aguardando_ente" | "sem_nota" | "recebidas";

const ROTULO_FILTRO: Record<FiltroLinhas, string> = {
  todas: "Todas",
  cobrar: "Com comissão a cobrar",
  aguardando_ente: "Aguardando pagamento do ente",
  sem_nota: "Aguardando 1ª nota",
  recebidas: "Quitadas",
};

/** "1 nota" / "3 notas" — o texto da tela não deve dizer "1 nota(s)". */
function quantidade(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

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
  const filtro: FiltroLinhas =
    f === "cobrar" || f === "aguardando_ente" || f === "sem_nota" || f === "recebidas" ? f : "todas";

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
      o.liquidacoes.map((l) => ({
        valorLiquidado: Number(l.valorLiquidado),
        statusCobranca: l.statusCobranca,
        dataPagamentoEnte: l.dataPagamentoEnte,
      })),
      percentual,
    );
    // "A cobrar" só conta o que já está liberado (o ente pagou o fornecedor);
    // o resto da comissão pendente aguarda o pagamento do ente.
    const situacoes = contarPorSituacao(o.liquidacoes);
    return {
      oportunidade: o,
      valorAderido: o.valorAderido ? Number(o.valorAderido) : 0,
      somaLiquidado,
      valorAReceber: comissao.devida,
      valorRecebido: comissao.recebida,
      valorACobrar: comissao.aCobrar ?? 0,
      valorAguardando: comissao.aguardandoPagamentoEnte ?? 0,
      aCobrar: situacoes.a_cobrar,
      aguardando: situacoes.aguardando_pagamento_ente,
    };
  });

  const totalAderido = linhas.reduce((soma, l) => soma + l.valorAderido, 0);
  const totalLiquidado = linhas.reduce((soma, l) => soma + l.somaLiquidado, 0);
  const totalComissaoDevida = linhas.reduce((soma, l) => soma + l.valorAReceber, 0);
  const totalRecebido = linhas.reduce((soma, l) => soma + l.valorRecebido, 0);
  const totalFaltaReceber = totalComissaoDevida - totalRecebido;
  const totalNotasACobrar = linhas.reduce((soma, l) => soma + l.aCobrar, 0);
  const totalValorACobrar = linhas.reduce((soma, l) => soma + l.valorACobrar, 0);
  const totalNotasAguardando = linhas.reduce((soma, l) => soma + l.aguardando, 0);
  const totalValorAguardando = linhas.reduce((soma, l) => soma + l.valorAguardando, 0);
  const pctLiquidado = totalAderido > 0 ? Math.round((totalLiquidado / totalAderido) * 100) : 0;

  const quitada = (l: (typeof linhas)[number]) =>
    l.oportunidade.liquidacoes.length > 0 &&
    l.aCobrar === 0 &&
    l.aguardando === 0 &&
    l.valorAReceber - l.valorRecebido < 0.005;
  const contagens: Record<FiltroLinhas, number> = {
    todas: linhas.length,
    cobrar: linhas.filter((l) => l.aCobrar > 0).length,
    aguardando_ente: linhas.filter((l) => l.aguardando > 0).length,
    sem_nota: linhas.filter((l) => l.oportunidade.liquidacoes.length === 0).length,
    recebidas: linhas.filter(quitada).length,
  };
  const exibidas = linhas.filter((l) => {
    if (filtro === "cobrar") return l.aCobrar > 0;
    if (filtro === "aguardando_ente") return l.aguardando > 0;
    if (filtro === "sem_nota") return l.oportunidade.liquidacoes.length === 0;
    if (filtro === "recebidas") return quitada(l);
    return true;
  });

  // Resumo por vendedor — "qual o vendedor que vendeu", agregado.
  const porVendedor = new Map<
    string,
    {
      nome: string;
      atasAderidas: number;
      valorAderido: number;
      valorAReceber: number;
      valorRecebido: number;
      valorAguardando: number;
    }
  >();
  for (const l of linhas) {
    const v = l.oportunidade.vendedor;
    const atual = porVendedor.get(v.id) ?? {
      nome: v.nome,
      atasAderidas: 0,
      valorAderido: 0,
      valorAReceber: 0,
      valorRecebido: 0,
      valorAguardando: 0,
    };
    atual.atasAderidas += 1;
    atual.valorAderido += l.valorAderido;
    atual.valorAReceber += l.valorAReceber;
    atual.valorRecebido += l.valorRecebido;
    atual.valorAguardando += l.valorAguardando;
    porVendedor.set(v.id, atual);
  }
  // O id do vendedor é a chave da linha: dois vendedores podem ter o mesmo nome.
  const resumoVendedores = [...porVendedor.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.valorAReceber - a.valorAReceber);

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
      <CabecalhoPagina
        rotulo="Financeiro"
        titulo="Recebíveis —"
        destaque="vendedores"
        descricao={
          <>
            Adesões fechadas pelo time de vendas (Kanban), por município. O valor a receber é
            sempre sobre o que foi liquidado (nota fiscal que o ente, o município ou órgão
            comprador, já reconheceu), nunca sobre o valor aderido — o ente pode usar menos do
            que aderiu. A comissão só pode ser cobrada depois que o ente pagar o fornecedor.
          </>
        }
        voltar={{ href: "/admin", rotulo: "Voltar ao painel" }}
      />

      {/* Duas faixas de três: seis células numa faixa só quebram em 5 + 1 na tela de 1280. */}
      <FaixaNumeros
        itens={[
          {
            valor: moedaCurta(totalAderido),
            rotulo: "Total aderido",
            nota: quantidade(linhas.length, "município", "municípios"),
          },
          { valor: moedaCurta(totalLiquidado), rotulo: "Total liquidado", nota: `${pctLiquidado}% do valor aderido` },
          { valor: moedaCurta(totalComissaoDevida), rotulo: "Comissão devida", nota: "sobre o liquidado" },
        ]}
      />
      <FaixaNumeros
        itens={[
          {
            valor: moedaCurta(totalRecebido),
            rotulo: "Comissão recebida",
            tom: "marca",
            nota: "já paga pelo fornecedor",
          },
          {
            valor: moedaCurta(totalFaltaReceber),
            rotulo: "Falta receber",
            tom: totalFaltaReceber > 0 ? "atencao" : "neutro",
            nota:
              totalNotasACobrar > 0
                ? `${quantidade(totalNotasACobrar, "nota", "notas")} a cobrar · ${moedaCurta(totalValorACobrar)}`
                : "nenhuma nota a cobrar agora",
          },
          {
            valor: moedaCurta(totalValorAguardando),
            rotulo: "Aguardando pagamento do ente",
            tom: totalNotasAguardando > 0 ? "atencao" : "neutro",
            nota:
              totalNotasAguardando > 0
                ? `comissão de ${quantidade(totalNotasAguardando, "nota", "notas")} sem data de pagamento`
                : "nenhuma nota aguardando",
          },
        ]}
      />

      {totalNotasAguardando > 0 && (
        <Aviso tom="info" titulo="Comissão só vence depois que o ente paga o fornecedor.">
          {totalNotasAguardando === 1 ? "1 nota está" : `${totalNotasAguardando} notas estão`} sem a data de
          pagamento do ente e {totalNotasAguardando === 1 ? "aparece" : "aparecem"} como “Aguardando pagamento
          do ente” — inclusive as lançadas antes desta regra. Abra a adesão na lista abaixo, escolha a nota e
          informe a data em que o ente pagou o fornecedor para liberar a cobrança.
        </Aviso>
      )}

      {resumoVendedores.length > 0 && (
        <Secao
          titulo="Por vendedor"
          descricao="Quanto cada vendedor fechou e quanto da comissão já entrou. A comissão é calculada sobre as notas fiscais liquidadas."
        >
          <div className="moldura-tabela">
            <table className="tabela-atas min-w-[860px]">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Municípios aderidos</th>
                  <th>Valor aderido</th>
                  <th>Comissão devida</th>
                  <th>Comissão recebida</th>
                  <th>Falta receber</th>
                  <th>Aguardando o ente</th>
                </tr>
              </thead>
              <tbody>
                {resumoVendedores.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <span className="titulo-linha">{v.nome}</span>
                    </td>
                    <td className="numero">{v.atasAderidas}</td>
                    <td className="whitespace-nowrap">
                      <Cifra valor={v.valorAderido} />
                    </td>
                    <td className="whitespace-nowrap">
                      <Cifra valor={v.valorAReceber} />
                    </td>
                    <td className="whitespace-nowrap">
                      <Cifra valor={v.valorRecebido} />
                    </td>
                    <td className="whitespace-nowrap font-bold" style={{ color: "var(--cor-texto)" }}>
                      <Cifra valor={v.valorAReceber - v.valorRecebido} />
                    </td>
                    <td className="whitespace-nowrap">
                      <Cifra valor={v.valorAguardando} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      <Secao
        titulo={`Adesões (${exibidas.length})`}
        descricao="Clique em uma adesão para ver as notas fiscais liquidadas, informar a data em que o ente pagou o fornecedor, cobrar a comissão e lançar novas liquidações."
      >
        <div className="kb-barra mb-5" role="group" aria-label="Filtrar adesões por situação">
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
                ? "Uma adesão aparece aqui quando um vendedor marca uma oportunidade como “Aderiu” no Kanban."
                : "Nenhuma adesão está nesta situação agora. Troque o filtro acima para ver as demais."
            }
            acao={
              linhas.length === 0 ? (
                <Link href="/admin/pipeline" className="botao-atas secundario">
                  Abrir o pipeline de vendas
                </Link>
              ) : (
                <Link href="/admin/recebiveis-vendedores" className="botao-atas secundario">
                  Ver todas as adesões
                </Link>
              )
            }
          />
        ) : (
          <ul className="lista-linhas">
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
                  dataPagamentoEnte: l.dataPagamentoEnte ? l.dataPagamentoEnte.toISOString() : null,
                }))}
              />
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
