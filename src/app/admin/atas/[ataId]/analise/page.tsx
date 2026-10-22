import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin, rejeitarAta } from "../../../actions";
import { NAV_ADMIN } from "../../../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Badge, type Tom } from "@/components/ui/badge";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { dataSoDia } from "@/lib/acompanhamento-view";
import { ITENS_CONFORMIDADE, alertasAutomaticos, type RespostasConformidade } from "@/lib/conformidade";
import { percentualDeFracao } from "@/lib/formato";
import { TEXTO_AVISO_VANTAJOSIDADE, formatarReais, type SituacaoPreco } from "@/lib/vantajosidade";
import { carregarComparativoOuNulo, type ComparativoDaAta, type ItemComparado } from "@/lib/vantajosidade-db";
import { FormularioAnalise } from "./formulario";

export const dynamic = "force-dynamic";

const ROTULO_STATUS = { PENDENTE: "Pendente", APROVADA: "Aprovada", REJEITADA: "Rejeitada" } as const;

/**
 * Análise interna da ata (2026-10-04) — o gestor confere o checklist de
 * conformidade (SCP cl. 8), confirma o contrato de intermediação e só
 * então aprova. A ata só chega ao vendedor se estiver aprovada E com
 * contrato cadastrado.
 */
export default async function AnaliseAtaPage({ params }: { params: Promise<{ ataId: string }> }) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const { ataId } = await params;
  const ata = await prisma.ata.findUnique({
    where: { id: ataId },
    include: {
      fornecedor: true,
      orgaoGerenciador: true,
      contrato: true,
      conformidade: true,
      documentos: { select: { id: true, nomeArquivo: true } },
      _count: { select: { itens: true } },
    },
  });
  if (!ata) notFound();

  const alertas = alertasAutomaticos({
    dataVigenciaFim: ata.dataVigenciaFim,
    itensCount: ata._count.itens,
    categoria: ata.categoria,
    documentosCount: ata.documentos.length,
  });
  if (!ata.contrato) {
    alertas.push("Sem contrato de intermediação — o vendedor não verá esta ata até o contrato ser cadastrado.");
  }

  // Comparativo auxiliar de preços (null se o banco falhar: o bloco avisa e o resto da página segue).
  const comparativo = await carregarComparativoOuNulo(ata.id);

  const c = ata.conformidade;
  const respostasAtuais: RespostasConformidade = {
    fornecedorRegular: c?.fornecedorRegular ?? false,
    editalPermiteAdesao: c?.editalPermiteAdesao ?? false,
    limitesRespeitados: c?.limitesRespeitados ?? false,
    pesquisaPrecos: c?.pesquisaPrecos ?? false,
    anuenciaGerenciador: c?.anuenciaGerenciador ?? false,
    estimativaQuantidades: c?.estimativaQuantidades ?? false,
  };

  const totalItens = ITENS_CONFORMIDADE.length;
  const confirmados = ITENS_CONFORMIDADE.filter((i) => respostasAtuais[i.campo]).length;
  const pctConformidade = Math.round((confirmados / totalItens) * 100);
  // O vendedor só enxerga a ata aprovada E com contrato (portão do pool).
  const visivelAoVendedor = ata.status === "APROVADA" && Boolean(ata.contrato);

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
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
        titulo="Análise da ata"
        destaque={ata.numero}
        descricao={
          <>
            <span className="block">
              {ata.fornecedor.razaoSocial} · {ata.orgaoGerenciador.nome}{" "}
              <span className="selo-uf align-middle">{ata.orgaoGerenciador.uf}</span>
            </span>
            <span className="mt-1 block">{ata.objeto}</span>
          </>
        }
        voltar={{ href: "/admin", rotulo: "Painel" }}
        acoes={<Badge tom={ata.status === "APROVADA" ? "marca" : "neutro"}>{ROTULO_STATUS[ata.status]}</Badge>}
      />

      <section className="painel p-6">
        <ol className="passos">
          <Etapa
            marcador={1}
            titulo="Conformidade"
            concluida={confirmados === totalItens}
            valor={`${confirmados}/${totalItens}`}
            corValor={
              confirmados === totalItens ? "var(--cor-marca-clara)" : confirmados > 0 ? "var(--cor-atencao)" : undefined
            }
            nota={confirmados === totalItens ? "checklist completo" : `${totalItens - confirmados} item(ns) a confirmar`}
          >
            <div className="barra-saldo mx-auto mt-3 max-w-[140px]">
              <div style={{ width: `${pctConformidade}%` }} />
            </div>
          </Etapa>
          <Etapa
            marcador={2}
            titulo="Contrato"
            concluida={Boolean(ata.contrato)}
            valor={ata.contrato ? percentualDeFracao(Number(ata.contrato.percentualComissao)) : "Pendente"}
            corValor={ata.contrato ? "var(--cor-marca-clara)" : "var(--cor-alerta)"}
            nota={ata.contrato ? "comissão pactuada com o fornecedor" : "sem contrato o vendedor não vê a ata"}
          />
          <Etapa
            marcador={3}
            titulo="Aprovação"
            concluida={ata.status === "APROVADA"}
            valor={ROTULO_STATUS[ata.status]}
            corValor={
              ata.status === "APROVADA"
                ? "var(--cor-marca-clara)"
                : ata.status === "REJEITADA"
                  ? "var(--cor-critico)"
                  : undefined
            }
            nota={ata.status === "APROVADA" ? "liberada no catálogo público" : "só aparece no catálogo depois de aprovada"}
          />
          <Etapa
            marcador={<IconeOlho />}
            titulo="Visível ao vendedor"
            concluida={visivelAoVendedor}
            valor={visivelAoVendedor ? "Sim" : "Não"}
            corValor={visivelAoVendedor ? "var(--cor-marca-clara)" : "var(--cor-atencao)"}
            nota={visivelAoVendedor ? "no pool de atas disponíveis" : "precisa estar aprovada e com contrato"}
          />
        </ol>
      </section>

      {alertas.length > 0 && (
        <Aviso tom="atencao" titulo="Alertas">
          <ul className="mt-1 list-disc pl-5">
            {alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}

      <Secao
        titulo="Contrato de intermediação"
        acao={
          <Link href={`/admin/atas/${ata.id}/contrato`} className="botao-atas secundario">
            {ata.contrato ? "Editar contrato" : "Cadastrar contrato"}
          </Link>
        }
      >
        <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          {ata.contrato ? (
            <>
              Comissão pactuada:{" "}
              <strong className="numero text-[15px]" style={{ color: "var(--cor-texto)" }}>
                {String(Number((Number(ata.contrato.percentualComissao) * 100).toFixed(2))).replace(".", ",")}%
              </strong>
            </>
          ) : (
            "Nenhum contrato cadastrado."
          )}
        </p>
      </Secao>

      <Secao
        titulo="Vantajosidade dos preços"
        descricao="Compara o preço unitário de cada item da ata com preços de contratações públicas consultados no Compras.gov.br."
      >
        <BlocoVantajosidade comparativo={comparativo} />
      </Secao>

      <Secao titulo="Checklist de conformidade" destaque>
        {ata.documentos.length > 0 && (
          <p
            className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
            style={{ color: "var(--cor-texto-3)" }}
          >
            <span>Documentos:</span>
            {ata.documentos.map((d) => (
              <a
                key={d.id}
                href={`/api/documentos/${d.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2"
                style={{ color: "var(--cor-marca-clara)" }}
              >
                {d.nomeArquivo}
              </a>
            ))}
          </p>
        )}
        <FormularioAnalise ataId={ata.id} respostasAtuais={respostasAtuais} parecerAtual={c?.parecer ?? ""} />
        {ata.status !== "REJEITADA" && (
          <form action={rejeitarAta} className="mt-6 border-t pt-5" style={{ borderColor: "var(--cor-borda)" }}>
            <input type="hidden" name="ataId" value={ata.id} />
            <button type="submit" className="botao-atas critico">
              Rejeitar ata
            </button>
          </form>
        )}
      </Secao>
    </AppShell>
  );
}

/** Uma etapa da análise no passo-a-passo do site (círculo verde quando concluída). */
function Etapa({
  marcador,
  titulo,
  concluida,
  valor,
  corValor,
  nota,
  children,
}: {
  marcador: React.ReactNode;
  titulo: string;
  concluida: boolean;
  valor: React.ReactNode;
  corValor?: string;
  nota: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="passo" data-ativo={concluida}>
      <span className="passo-numero">{marcador}</span>
      <p className="marca text-[15px]" style={{ color: "var(--cor-texto)" }}>
        {titulo}
      </p>
      <p
        className="numero mt-2 text-[22px] font-extrabold leading-tight"
        style={{ color: corValor ?? "var(--cor-texto)", letterSpacing: "-0.03em" }}
      >
        {valor}
      </p>
      <p className="mx-auto mt-1 max-w-[200px] text-[12.5px] leading-relaxed" style={{ color: "var(--cor-texto-3)" }}>
        {nota}
      </p>
      {children}
    </li>
  );
}

const SITUACAO: Record<SituacaoPreco, { rotulo: string; tom: Tom }> = {
  acima: { rotulo: "Acima da referência", tom: "atencao" },
  // Preço muito baixo também merece conferência (item ou unidade diferente): mesmo tom de atenção.
  abaixo: { rotulo: "Abaixo da referência", tom: "atencao" },
  compativel: { rotulo: "Compatível", tom: "marca" },
  amostra_insuficiente: { rotulo: "Amostra insuficiente", tom: "neutro" },
  sem_referencia: { rotulo: "Sem referência", tom: "neutro" },
};

const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;

function percentual(valor: number, comSinal = false): string {
  return `${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: comSinal ? "exceptZero" : "auto",
  })}%`;
}

function reais(valor: number | null): string {
  return valor !== null && Number.isFinite(valor) ? formatarReais(valor) : "—";
}

function diaDaConsulta(quando: Date): string {
  return quando.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Preços de referência só valem para mostrar quando a comparação foi conclusiva. */
function comparacaoConclusiva(item: ItemComparado): boolean {
  return item.classificacao === "acima" || item.classificacao === "abaixo" || item.classificacao === "compativel";
}

/**
 * Comparativo AUXILIAR de preços da ata (Projeto RNA, etapa 4): o preço
 * unitário de cada item frente aos preços de contratações públicas consultados
 * no Compras.gov.br. Não substitui a pesquisa de preços do órgão (art. 23); o
 * aviso vai sempre junto dos números.
 */
function BlocoVantajosidade({ comparativo }: { comparativo: ComparativoDaAta | null }) {
  return (
    <div className="flex flex-col gap-5">
      <Aviso tom="info">{TEXTO_AVISO_VANTAJOSIDADE}</Aviso>

      {comparativo === null ? (
        <Aviso tom="atencao">Não foi possível carregar o comparativo agora. Recarregue a página para tentar de novo.</Aviso>
      ) : comparativo.itens.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Esta ata ainda não tem itens para comparar.
        </p>
      ) : (
        <ComparativoDosItens comparativo={comparativo} />
      )}
    </div>
  );
}

function ComparativoDosItens({ comparativo }: { comparativo: ComparativoDaAta }) {
  const { itens, resumo } = comparativo;
  const nenhumComCodigo = itens.every((i) => i.codigoCatalogo === null);
  const nenhumConsultado = itens.every((i) => i.referencia === null);

  return (
    <>
      <FaixaNumeros
        itens={[
          {
            valor: `${resumo.itensComReferencia} de ${resumo.itensTotal}`,
            rotulo: "Itens comparados",
            nota: `${resumo.semReferencia} sem comparação`,
            tom: resumo.itensComReferencia > 0 ? "marca" : undefined,
          },
          { valor: resumo.acima, rotulo: "Acima da referência", tom: resumo.acima > 0 ? "atencao" : undefined },
          {
            valor: resumo.abaixo,
            rotulo: "Abaixo da referência",
            nota: resumo.abaixo > 0 ? "também merece conferência" : undefined,
            tom: resumo.abaixo > 0 ? "atencao" : undefined,
          },
          {
            valor: resumo.pesoAcima !== null ? percentual(resumo.pesoAcima) : "—",
            rotulo: "Peso dos itens acima",
            nota: "do valor dos itens comparados",
            tom: resumo.pesoAcima !== null && resumo.pesoAcima > 0 ? "atencao" : undefined,
          },
        ]}
      />

      {nenhumConsultado && (
        <Aviso tom="atencao" titulo={nenhumComCodigo ? "Nenhum item desta ata tem código do catálogo." : "Ainda não há preços consultados para esta ata."}>
          {nenhumComCodigo
            ? "O código CATMAT ou CATSER é informado em cada item (campo “Código do catálogo”), ao cadastrar a ata ou ao adicionar um item na tela de completar a ata. "
            : "Há itens com código, mas os preços ainda não foram buscados. "}
          O script <span className="codigo">scripts/inteligencia/buscar-precos-referencia.ts</span> busca os preços de
          referência no Compras.gov.br depois que os itens têm código; quando ele rodar, esta tabela é preenchida.
        </Aviso>
      )}

      <div className="moldura-tabela">
        <table className="tabela-atas min-w-[1040px]">
          <caption className="sr-only">Comparativo auxiliar do preço unitário de cada item da ata</caption>
          <thead>
            <tr>
              <th>Item</th>
              <th>Preço da ata</th>
              <th>Mediana e faixa (p25–p75)</th>
              <th>Preços usados</th>
              <th>Período e consulta</th>
              <th>Diferença sobre a mediana</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <LinhaDoItem key={item.itemId} item={item} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LinhaDoItem({ item }: { item: ItemComparado }) {
  const { referencia } = item;
  const situacao = SITUACAO[item.classificacao];
  const conclusiva = comparacaoConclusiva(item);

  return (
    <tr>
      <td className="min-w-[14rem] max-w-[20rem] align-top">
        <span className="titulo-linha block text-[13.5px] leading-snug">{item.descricao}</span>
        <span className="mt-0.5 block text-xs" style={COR_SECUNDARIA}>
          <span className="numero">{item.quantidade.toLocaleString("pt-BR")}</span> {item.unidade}
          {item.codigoCatalogo ? (
            <>
              {" · cód. "}
              <span className="codigo">{item.codigoCatalogo}</span>
            </>
          ) : (
            " · sem código"
          )}
        </span>
      </td>
      <td className="align-top">
        <span className="numero font-semibold" style={{ color: "var(--cor-texto)" }}>
          {reais(item.precoAta)}
        </span>
      </td>
      <td className="align-top">
        {conclusiva && referencia ? (
          <>
            <span className="numero font-semibold" style={{ color: "var(--cor-texto)" }}>
              {reais(referencia.mediana)}
            </span>
            <span className="mt-0.5 block text-xs" style={COR_SECUNDARIA}>
              <span className="numero">
                {reais(referencia.p25)} – {reais(referencia.p75)}
              </span>
            </span>
            {referencia.unidadeFornecimento && (
              <span className="mt-0.5 block text-xs" style={COR_SECUNDARIA}>
                por {referencia.unidadeFornecimento}
              </span>
            )}
          </>
        ) : (
          <span style={COR_SECUNDARIA}>—</span>
        )}
      </td>
      <td className="align-top">
        {referencia ? (
          <>
            <span className="numero font-semibold" style={{ color: "var(--cor-texto)" }}>
              {referencia.nUsadas}
            </span>
            <span className="mt-0.5 block text-xs" style={COR_SECUNDARIA}>
              de <span className="numero">{referencia.n}</span> consultados
            </span>
          </>
        ) : (
          <span style={COR_SECUNDARIA}>—</span>
        )}
      </td>
      <td className="align-top">
        {referencia ? (
          <>
            <span className="numero whitespace-nowrap text-[13px]">
              {dataSoDia(referencia.janelaInicio)} a {dataSoDia(referencia.janelaFim)}
            </span>
            <span className="mt-0.5 block text-xs" style={COR_SECUNDARIA}>
              consultado em <span className="numero">{diaDaConsulta(referencia.consultadoEm)}</span>
            </span>
          </>
        ) : (
          <span style={COR_SECUNDARIA}>—</span>
        )}
      </td>
      <td className="align-top">
        {conclusiva && item.diferencaPercentual !== null ? (
          <span className="numero font-semibold whitespace-nowrap" style={{ color: "var(--cor-texto)" }}>
            {percentual(item.diferencaPercentual, true)}
          </span>
        ) : (
          <span style={COR_SECUNDARIA}>—</span>
        )}
      </td>
      <td className="min-w-[16rem] max-w-[26rem] align-top">
        <Badge tom={situacao.tom}>{situacao.rotulo}</Badge>
        <span className="mt-1.5 block text-xs leading-relaxed" style={COR_SECUNDARIA}>
          {item.explicacao}
        </span>
        {referencia?.erro && (
          <span className="mt-1 block break-words text-xs" style={COR_SECUNDARIA}>
            Detalhe da consulta: {referencia.erro.slice(0, 200)}
          </span>
        )}
      </td>
    </tr>
  );
}

function IconeOlho() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M1.8 9S4.4 3.8 9 3.8 16.2 9 16.2 9 13.6 14.2 9 14.2 1.8 9 1.8 9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
