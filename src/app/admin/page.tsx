import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saldoAgregadoDisponivel } from "@/lib/saldo";
import { logoutAdmin, rejeitarAta } from "./actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Badge, type Tom } from "@/components/ui/badge";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { FunilVendedor } from "@/components/vendedor/painel-resumo";
import { NAV_ADMIN } from "@/app/admin/nav";
import { ITENS_CONFORMIDADE } from "@/lib/conformidade";
import { moedaCurta, percentualDeFracao } from "@/lib/formato";
import { ONDE_LIQUIDACAO_A_COBRAR } from "@/lib/recebiveis";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { montarPainel, resumirPorVendedor } from "@/lib/painel-vendedor";
import { carregarLinhasOportunidades } from "@/lib/painel-vendedor-db";

export const dynamic = "force-dynamic";

// Mesmo valor usado em src/lib/rastreador-pncp.ts pro fornecedor
// placeholder quando o PNCP não retorna o vencedor da compra.
const CNPJ_FORNECEDOR_A_CONFIRMAR = "00000000000000";

/** Ata importada automaticamente (PNCP ou Compras.gov.br) que ainda não tem
 * fornecedor real identificado ou nenhum item enriquecido — acha da revisão
 * de telas de 2026-09-04: essas atas se perdiam misturadas com a fila
 * normal de moderação. Mesma checagem serve pras duas fontes, que rodam em
 * paralelo desde 2026-09-04. */
function ataImportadaIncompleta(ata: { origem: string; itens: unknown[]; fornecedor: { cnpj: string } }): boolean {
  return (
    (ata.origem === "PNCP" || ata.origem === "COMPRAS_GOV") &&
    (ata.itens.length === 0 || ata.fornecedor.cnpj === CNPJ_FORNECEDOR_A_CONFIRMAR)
  );
}

interface ItemFila {
  rotulo: string;
  descricao: string;
  n: number;
  href: string;
  tom: Tom;
}

/**
 * Painel do gestor (2026-09, redesenhado na fase 2 em 2026-10-05): primeiro o
 * que precisa de ação (fila), depois o canal de vendedores (indicadores,
 * funil, por vendedor), as atas aguardando moderação e, por último, o canal
 * de autoatendimento dos órgãos.
 */
export default async function PainelAdminPage() {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  await expirarOportunidadesVencidas();

  const [
    totalAtas,
    atasComAdesao,
    itensComSaldo,
    pedidosEmAndamento,
    pedidosFaturados,
    atasPendentes,
    faturamentos,
    pedidosNegociacaoPendentes,
    contatosParaRevisar,
    atasSemContrato,
    totalAtasSemContrato,
    liquidacoesACobrar,
    linhasPipeline,
    contratosDetectadosParaConfirmar,
    aditivosAAcompanhar,
  ] = await Promise.all([
    prisma.ata.count({ where: { status: "APROVADA" } }),
    // Funil de conversão (mapa do núcleo de atas, 2026-09-05): quantas atas
    // aprovadas conseguiram fechar pelo menos uma adesão de verdade — não
    // existe estágio de "cancelada" em Adesao hoje, então qualquer adesão
    // registrada já conta.
    prisma.ata.count({
      where: { status: "APROVADA", itens: { some: { adesoes: { some: {} } } } },
    }),
    prisma.item.findMany({ include: { saldo: true } }),
    prisma.adesao.count({ where: { estagio: { not: "FATURADA" } } }),
    prisma.adesao.count({ where: { estagio: "FATURADA" } }),
    prisma.ata
      .findMany({
        where: { status: "PENDENTE" },
        include: {
          fornecedor: true,
          orgaoGerenciador: true,
          itens: true,
          documentos: true,
          conformidade: true,
          contrato: true,
        },
        orderBy: { createdAt: "asc" },
      })
      .then((atas) =>
        // Incompletas primeiro — são as que mais precisam de atenção do
        // admin antes de aprovar/rejeitar, não deveriam ficar perdidas no
        // meio da fila comum.
        [...atas].sort((a, b) => Number(ataImportadaIncompleta(b)) - Number(ataImportadaIncompleta(a))),
      ),
    prisma.faturamento.findMany(),
    prisma.pedidoNegociacao.count({ where: { status: "pendente" } }),
    prisma.pontoFocal.count({ where: { contatoErradoEm: { not: null }, ativo: true } }),
    prisma.ata.findMany({
      where: { status: "APROVADA", contrato: { is: null } },
      select: { id: true, numero: true },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.ata.count({ where: { status: "APROVADA", contrato: { is: null } } }),
    prisma.liquidacao.count({ where: ONDE_LIQUIDACAO_A_COBRAR }),
    carregarLinhasOportunidades({}),
    // Acompanhamento de contratos do PNCP (Projeto RNA, etapa 2): vínculos que
    // o script sugeriu e esperam o gestor confirmar ou descartar.
    prisma.vinculoContrato.count({ where: { status: "sugerido" } }),
    // Aditivos (valor ou prazo) de contratos com vínculo já confirmado: geram
    // comissão em cascata e ficam a acompanhar até o gestor lançar a
    // liquidação ou marcar "sem comissão".
    prisma.termoContratoPublico.count({
      where: { cobrancaStatus: "a_acompanhar", contrato: { vinculo: { is: { status: "confirmado" } } } },
    }),
  ]);

  const taxaConversao = totalAtas > 0 ? Math.round((atasComAdesao / totalAtas) * 100) : null;

  const saldoTotalDisponivel = itensComSaldo.reduce(
    (total, item) =>
      total + saldoAgregadoDisponivel(item.quantidadeRegistrada, item.saldo?.quantidadeConsumida ?? 0),
    0,
  );

  const totalAReceber = faturamentos
    .filter((f) => !f.pago)
    .reduce((total, f) => total + Number(f.valorTaxaIntermediacao), 0);
  const totalRecebido = faturamentos
    .filter((f) => f.pago)
    .reduce((total, f) => total + Number(f.valorTaxaIntermediacao), 0);

  const painel = montarPainel(linhasPipeline);
  const porVendedor = resumirPorVendedor(linhasPipeline);
  const k = painel.kpis;

  const fila: ItemFila[] = [
    {
      rotulo: "Atas aguardando análise",
      descricao: "Aprovar libera a ata no catálogo; sem contrato ela não chega ao vendedor.",
      n: atasPendentes.length,
      href: "#moderacao",
      tom: "atencao",
    },
    {
      rotulo: "Pedidos de negociação aguardando liberação",
      descricao: "Vendedores esperando o município ser liberado.",
      n: pedidosNegociacaoPendentes,
      href: "/admin/negociacoes",
      tom: "atencao",
    },
    {
      rotulo: "Atas aprovadas sem contrato de intermediação",
      descricao: "Ficam invisíveis para os vendedores até o contrato ser cadastrado.",
      n: totalAtasSemContrato,
      href: atasSemContrato[0] ? `/admin/atas/${atasSemContrato[0].id}/contrato` : "/admin",
      tom: "alerta",
    },
    {
      rotulo: "Contatos marcados como errados",
      descricao: "Vendedores sinalizaram telefone, e-mail ou pessoa incorretos.",
      n: contatosParaRevisar,
      href: "/admin/contatos-revisao",
      tom: "atencao",
    },
    {
      rotulo: "Comissões a cobrar",
      descricao: "Notas fiscais já liquidadas e pagas pelo órgão, sem cobrança ao fornecedor.",
      n: liquidacoesACobrar,
      href: "/admin/recebiveis-vendedores",
      tom: "atencao",
    },
    {
      rotulo: "Contratos detectados para confirmar",
      descricao: "O PNCP publicou contratos que parecem ter nascido das nossas atas ou negociações.",
      n: contratosDetectadosParaConfirmar,
      href: "/admin/contratos-detectados",
      tom: "atencao",
    },
    {
      rotulo: "Aditivos a acompanhar",
      descricao: "Aditivo de valor ou prazo gera comissão em cascata: lance a liquidação ou marque sem comissão.",
      n: aditivosAAcompanhar,
      href: "/admin/contratos-detectados",
      tom: "atencao",
    },
    {
      rotulo: "Prazos de negociação vencendo",
      descricao: "Municípios que expiram em até 3 dias sem avanço.",
      n: k.vencendo,
      href: "/admin/pipeline",
      tom: "critico",
    },
  ];
  const totalFila = fila.reduce((soma, item) => soma + item.n, 0);

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
        rotulo="Operação"
        titulo="Painel"
        destaque="administrativo"
        descricao={totalFila === 0 ? "Tudo em dia." : `${totalFila} ponto(s) esperando uma decisão sua.`}
      />

      <Secao titulo="Fila de ação" destaque>
        <ul className="lista-linhas">
          {fila.map((item) => (
            <li key={item.rotulo} className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <i
                  aria-hidden="true"
                  className="kb-ponto mt-1.5"
                  style={{
                    background:
                      item.n === 0
                        ? "var(--cor-borda-forte)"
                        : item.tom === "critico"
                          ? "var(--cor-critico)"
                          : item.tom === "alerta"
                            ? "var(--cor-alerta)"
                            : "var(--cor-atencao)",
                  }}
                />
                <div className="min-w-0">
                  <p
                    className="text-[14px] font-bold tracking-[-0.01em]"
                    style={{ color: item.n === 0 ? "var(--cor-texto-2)" : "var(--cor-texto)" }}
                  >
                    {item.rotulo}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {item.descricao}
                  </p>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <span
                  className="numero min-w-8 text-right text-[22px] font-extrabold tracking-[-0.03em]"
                  style={{ color: item.n === 0 ? "var(--cor-texto-3)" : "var(--cor-texto)" }}
                >
                  {item.n}
                </span>
                <div className="flex min-w-[4.75rem] justify-end">
                  {item.n > 0 ? (
                    <Link href={item.href} className="botao-atas secundario pequeno" aria-label={`Abrir: ${item.rotulo}`}>
                      Abrir
                    </Link>
                  ) : (
                    <Badge tom="neutro">Em dia</Badge>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {atasSemContrato.length > 1 && (
          <p
            className="mt-4 border-t pt-3 text-xs"
            style={{ borderColor: "var(--cor-borda)", color: "var(--cor-texto-3)" }}
          >
            Sem contrato:{" "}
            {atasSemContrato.map((a, i) => (
              <span key={a.id}>
                {i > 0 ? " · " : ""}
                <Link
                  href={`/admin/atas/${a.id}/contrato`}
                  className="font-semibold hover:underline"
                  style={{ color: "var(--cor-marca-clara)" }}
                >
                  Ata <span className="codigo">{a.numero}</span>
                </Link>
              </span>
            ))}
            {totalAtasSemContrato > atasSemContrato.length ? ` · +${totalAtasSemContrato - atasSemContrato.length}` : ""}
          </p>
        )}
      </Secao>

      <FaixaNumeros
        itens={[
          {
            valor: moedaCurta(k.aderido),
            rotulo: "Aderido (vendedores)",
            nota: `${k.aderidos} município(s) aderiram`,
            tom: "marca",
          },
          {
            valor: moedaCurta(k.comissaoDevida - k.comissaoRecebida),
            rotulo: "Comissão a receber",
            nota: `devida ${moedaCurta(k.comissaoDevida)} · recebida ${moedaCurta(k.comissaoRecebida)}`,
            tom: k.comissaoDevida - k.comissaoRecebida > 0 ? "atencao" : undefined,
          },
          {
            valor: k.emNegociacao,
            rotulo: "Em negociação",
            nota: `${k.abertos} município(s) em aberto · ~${moedaCurta(k.potencial)} em potencial`,
          },
          {
            valor: k.semContato,
            rotulo: "Sem decisor com contato",
            nota: "municípios em aberto sem telefone nem e-mail",
            tom: k.semContato > 0 ? "atencao" : undefined,
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FunilVendedor funil={painel.funil} />
        <Secao
          titulo="Por vendedor"
          acao={
            <Link href="/admin/pipeline" className="botao-atas link">
              Abrir pipeline →
            </Link>
          }
        >
          {porVendedor.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--cor-texto-3)" }}>
              Nenhum vendedor com município ativo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabela-atas">
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th>Em aberto</th>
                    <th>Aderidos</th>
                    <th>Valor aderido</th>
                  </tr>
                </thead>
                <tbody>
                  {porVendedor.slice(0, 6).map((v) => (
                    <tr key={v.vendedorId}>
                      <td>
                        <Link
                          href={`/admin/pipeline?vendedor=${v.vendedorId}`}
                          className="titulo-linha hover:text-[var(--cor-marca-clara)]"
                        >
                          {v.nome}
                        </Link>
                      </td>
                      <td className="numero">{v.abertos}</td>
                      <td className="numero">{v.aderidos}</td>
                      <td className="whitespace-nowrap" style={{ color: "var(--cor-texto)" }}>
                        <Cifra valor={v.valorAderido} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Secao>
      </div>

      <div id="moderacao" className="scroll-mt-6">
        <Secao
          titulo={`Atas aguardando moderação (${atasPendentes.length})`}
          descricao={
            <>
              Uma ata só aparece no catálogo público depois de aprovada aqui — e só chega ao vendedor com contrato de
              intermediação cadastrado.
            </>
          }
        >
          {atasPendentes.length === 0 ? (
            <VazioComAcao titulo="Nada pendente" descricao="Nenhuma ata aguardando moderação no momento." />
          ) : (
            <ul className="lista-linhas">
              {atasPendentes.map((ata) => {
                const confirmados = ITENS_CONFORMIDADE.filter((i) => ata.conformidade?.[i.campo]).length;
                return (
                  <li key={ata.id} className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="codigo text-xs font-semibold" style={{ color: "var(--cor-texto-3)" }}>
                          Ata {ata.numero}
                        </h3>
                        <span className="eyebrow">
                          {ata.origem === "PNCP"
                            ? "Importada do PNCP"
                            : ata.origem === "COMPRAS_GOV"
                              ? "Importada do Compras.gov.br"
                              : ata.origem === "CIABC"
                                ? "Repassada pelo CIABC"
                                : "Cadastro manual"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {ataImportadaIncompleta(ata) && <Badge tom="alerta">Importação incompleta</Badge>}
                        <Badge tom={confirmados === ITENS_CONFORMIDADE.length ? "marca" : confirmados > 0 ? "atencao" : "neutro"}>
                          Conformidade {confirmados}/{ITENS_CONFORMIDADE.length}
                        </Badge>
                        <Badge tom={ata.contrato ? "marca" : "alerta"}>
                          {ata.contrato
                            ? `Contrato ${percentualDeFracao(Number(ata.contrato.percentualComissao))}`
                            : "Sem contrato"}
                        </Badge>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[14.5px] font-bold leading-snug tracking-[-0.01em]" style={{ color: "var(--cor-texto)" }}>
                        {ata.objeto}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        <span>
                          {ata.fornecedor.cnpj === CNPJ_FORNECEDOR_A_CONFIRMAR
                            ? "Fornecedor a confirmar"
                            : ata.fornecedor.razaoSocial}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Órgão gerenciador: {ata.orgaoGerenciador.nome}</span>
                        <span className="selo-uf">{ata.orgaoGerenciador.uf}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {ata.itens.length === 0
                            ? "sem itens (a completar)"
                            : `${ata.itens.length} ${ata.itens.length === 1 ? "item" : "itens"}`}
                        </span>
                      </p>
                      {ata.documentos.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          {ata.documentos.map((doc) => (
                            <a
                              key={doc.id}
                              href={`/api/documentos/${doc.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
                              style={{ color: "var(--cor-marca-clara)" }}
                            >
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <path
                                  d="M13.5 7.6 8.2 12.9a3.4 3.4 0 0 1-4.8-4.8l5.6-5.6a2.3 2.3 0 0 1 3.2 3.2L6.6 11.3a1.1 1.1 0 0 1-1.6-1.6l5-5"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              {doc.nomeArquivo}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {ataImportadaIncompleta(ata) && (
                        <Link href={`/admin/atas/${ata.id}/completar`} className="botao-atas secundario">
                          Completar
                        </Link>
                      )}
                      <Link href={`/admin/atas/${ata.id}/contrato`} className="botao-atas secundario">
                        Contrato
                      </Link>
                      <Link href={`/admin/atas/${ata.id}/analise`} className="botao-atas">
                        Analisar e aprovar
                      </Link>
                      <form action={rejeitarAta}>
                        <input type="hidden" name="ataId" value={ata.id} />
                        <button type="submit" className="botao-atas critico">
                          Rejeitar
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Secao>
      </div>

      <section className="flex flex-col gap-3">
        <h2
          className="marca text-[17px]"
          style={{ color: "var(--cor-texto)", fontWeight: 800, letterSpacing: "-0.025em" }}
        >
          Canal de autoatendimento (órgãos)
        </h2>
        <FaixaNumeros
          itens={[
            { valor: totalAtas, rotulo: "Atas aprovadas" },
            { valor: saldoTotalDisponivel.toLocaleString("pt-BR"), rotulo: "Saldo total disponível" },
            { valor: atasComAdesao, rotulo: "Atas com adesão", nota: `de ${totalAtas} aprovadas` },
            {
              valor: taxaConversao === null ? "—" : `${taxaConversao}%`,
              rotulo: "Taxa de conversão",
              nota: "atas aprovadas que já fecharam ao menos 1 adesão",
              tom: taxaConversao !== null && taxaConversao > 0 ? "marca" : undefined,
            },
          ]}
        />
        <FaixaNumeros
          itens={[
            { valor: pedidosFaturados, rotulo: "Contratos faturados", tom: "marca" },
            {
              valor: pedidosEmAndamento,
              rotulo: "Pedidos em andamento",
              tom: pedidosEmAndamento > 0 ? "atencao" : undefined,
            },
            {
              valor: <Cifra valor={totalAReceber} />,
              rotulo: "Total a receber",
              tom: totalAReceber > 0 ? "atencao" : undefined,
            },
            { valor: <Cifra valor={totalRecebido} />, rotulo: "Total recebido" },
          ]}
        />
      </section>
    </AppShell>
  );
}
