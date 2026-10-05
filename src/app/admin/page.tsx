import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saldoAgregadoDisponivel } from "@/lib/saldo";
import { logoutAdmin, rejeitarAta } from "./actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { CartaoIndicador } from "@/components/ui/cartao-indicador";
import { Badge, type Tom } from "@/components/ui/badge";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { FunilVendedor } from "@/components/vendedor/painel-resumo";
import { NAV_ADMIN } from "@/app/admin/nav";
import { ITENS_CONFORMIDADE } from "@/lib/conformidade";
import { moedaCurta, percentualDeFracao } from "@/lib/formato";
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
    prisma.liquidacao.count({ where: { statusCobranca: "pendente" } }),
    carregarLinhasOportunidades({}),
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
      descricao: "Notas fiscais já liquidadas pelo órgão, sem cobrança ao fornecedor.",
      n: liquidacoesACobrar,
      href: "/admin/recebiveis-vendedores",
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
      <div>
        <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
          Painel administrativo
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          {totalFila === 0 ? "Tudo em dia." : `${totalFila} ponto(s) esperando uma decisão sua.`}
        </p>
      </div>

      <Secao titulo="Fila de ação">
        <ul className="flex flex-col">
          {fila.map((item) => (
            <li
              key={item.rotulo}
              className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0"
              style={{ borderColor: "var(--cor-borda)" }}
            >
              <div className="flex items-start gap-3">
                <i
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
                <div>
                  <p className="text-sm font-medium" style={{ color: item.n === 0 ? "var(--cor-texto-2)" : "var(--cor-texto)" }}>
                    {item.rotulo}
                  </p>
                  <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {item.descricao}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="numero text-lg font-medium"
                  style={{ color: item.n === 0 ? "var(--cor-texto-3)" : "var(--cor-texto)" }}
                >
                  {item.n}
                </span>
                {item.n > 0 ? (
                  <Link href={item.href} className="botao-atas secundario">
                    Abrir
                  </Link>
                ) : (
                  <Badge tom="neutro">Em dia</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
        {atasSemContrato.length > 1 && (
          <p className="mt-2 text-xs" style={{ color: "var(--cor-texto-3)" }}>
            Sem contrato:{" "}
            {atasSemContrato.map((a, i) => (
              <span key={a.id}>
                {i > 0 ? " · " : ""}
                <Link href={`/admin/atas/${a.id}/contrato`} className="underline">
                  Ata {a.numero}
                </Link>
              </span>
            ))}
            {totalAtasSemContrato > atasSemContrato.length ? ` · +${totalAtasSemContrato - atasSemContrato.length}` : ""}
          </p>
        )}
      </Secao>

      <div className="kb-kpis">
        <div className="kb-kpi">
          <p className="eyebrow">Aderido (vendedores)</p>
          <p className="kb-kpi-valor numero" style={{ color: "var(--cor-marca-clara)" }}>
            {moedaCurta(k.aderido)}
          </p>
          <p className="kb-kpi-nota">{k.aderidos} município(s) aderiram</p>
        </div>
        <div className="kb-kpi">
          <p className="eyebrow">Comissão a receber</p>
          <p className="kb-kpi-valor numero" style={{ color: k.comissaoDevida - k.comissaoRecebida > 0 ? "var(--cor-atencao)" : undefined }}>
            {moedaCurta(k.comissaoDevida - k.comissaoRecebida)}
          </p>
          <p className="kb-kpi-nota">
            devida {moedaCurta(k.comissaoDevida)} · recebida {moedaCurta(k.comissaoRecebida)}
          </p>
        </div>
        <div className="kb-kpi">
          <p className="eyebrow">Em negociação</p>
          <p className="kb-kpi-valor numero">{k.emNegociacao}</p>
          <p className="kb-kpi-nota">
            {k.abertos} município(s) em aberto · ~{moedaCurta(k.potencial)} em potencial
          </p>
        </div>
        <div className="kb-kpi">
          <p className="eyebrow">Sem decisor com contato</p>
          <p className="kb-kpi-valor numero" style={{ color: k.semContato > 0 ? "var(--cor-atencao)" : undefined }}>
            {k.semContato}
          </p>
          <p className="kb-kpi-nota">municípios em aberto sem telefone nem e-mail</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <FunilVendedor funil={painel.funil} />
        <Secao
          titulo="Por vendedor"
          acao={
            <Link href="/admin/pipeline" className="botao-atas secundario">
              Abrir pipeline
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
                        <Link href={`/admin/pipeline?vendedor=${v.vendedorId}`} className="underline">
                          {v.nome}
                        </Link>
                      </td>
                      <td className="numero">{v.abertos}</td>
                      <td className="numero">{v.aderidos}</td>
                      <td>
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

      <div id="moderacao">
        <Secao titulo={`Atas aguardando moderação (${atasPendentes.length})`}>
          <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Uma ata só aparece no catálogo público depois de aprovada aqui — e só chega ao vendedor com contrato de
            intermediação cadastrado.
          </p>

          {atasPendentes.length === 0 ? (
            <div className="mt-4">
              <VazioComAcao titulo="Nada pendente" descricao="Nenhuma ata aguardando moderação no momento." />
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-4">
              {atasPendentes.map((ata) => {
                const confirmados = ITENS_CONFORMIDADE.filter((i) => ata.conformidade?.[i.campo]).length;
                return (
                  <li key={ata.id} className="painel p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-medium" style={{ color: "var(--cor-texto)" }}>
                        Ata {ata.numero}
                      </h3>
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
                    </div>
                    <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
                      {ata.objeto}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      {ata.fornecedor.cnpj === CNPJ_FORNECEDOR_A_CONFIRMAR
                        ? "Fornecedor a confirmar"
                        : ata.fornecedor.razaoSocial}{" "}
                      · Órgão gerenciador: {ata.orgaoGerenciador.nome} ({ata.orgaoGerenciador.uf}) ·{" "}
                      {ata.itens.length === 0
                        ? "sem itens (a completar)"
                        : `${ata.itens.length} ${ata.itens.length === 1 ? "item" : "itens"}`}
                    </p>
                    {ata.documentos.map((doc) => (
                      <a
                        key={doc.id}
                        href={`/api/documentos/${doc.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs underline"
                        style={{ color: "var(--cor-texto-2)" }}
                      >
                        📎 {doc.nomeArquivo}
                      </a>
                    ))}

                    <div className="mt-3 flex flex-wrap gap-2">
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

      <Secao titulo="Canal de autoatendimento (órgãos)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CartaoIndicador rotulo="Atas aprovadas" valor={totalAtas} />
          <CartaoIndicador rotulo="Saldo total disponível" valor={saldoTotalDisponivel} />
          <CartaoIndicador
            rotulo="Pedidos em andamento"
            valor={pedidosEmAndamento}
            tom={pedidosEmAndamento > 0 ? "atencao" : "neutro"}
          />
          <CartaoIndicador rotulo="Contratos faturados" valor={pedidosFaturados} tom="marca" />
          <CartaoIndicador
            rotulo="Total a receber"
            valor={<Cifra valor={totalAReceber} />}
            tom={totalAReceber > 0 ? "atencao" : "neutro"}
          />
          <CartaoIndicador rotulo="Total recebido" valor={<Cifra valor={totalRecebido} />} />
          <CartaoIndicador rotulo="Atas com adesão" valor={atasComAdesao} nota={`de ${totalAtas} aprovadas`} />
          <CartaoIndicador
            rotulo="Taxa de conversão"
            valor={taxaConversao === null ? "—" : `${taxaConversao}%`}
            tom={taxaConversao !== null && taxaConversao > 0 ? "marca" : "neutro"}
            nota="atas aprovadas que já fecharam ao menos 1 adesão"
          />
        </div>
      </Secao>
    </AppShell>
  );
}
