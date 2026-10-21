import { notFound } from "next/navigation";
import { fornecedorIdLogado, orgaoIdLogado } from "@/lib/auth";
import { ORDEM_ESTAGIOS, ROTULO_ESTAGIO, estagioConcluido } from "@/lib/adesao";
import { prisma } from "@/lib/prisma";
import { BotaoAvancar } from "./botao-avancar";
import { BotaoImprimir } from "./botao-imprimir";
import { Aviso } from "@/components/ui/aviso";
import { BarraTopo } from "@/components/ui/barra-topo";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Cifra, Percentual } from "@/components/ui/valores";
import { Badge } from "@/components/ui/badge";
import { tomFaturamento } from "@/lib/severidade";

export const dynamic = "force-dynamic";

export default async function DetalheAdesaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const adesao = await prisma.adesao.findUnique({
    where: { id },
    include: {
      item: { include: { ata: { include: { fornecedor: true } } } },
      orgaoAderente: true,
      historico: { orderBy: { alteradoEm: "asc" } },
      faturamento: true,
    },
  });

  if (!adesao) notFound();

  const [fornecedorId, orgaoId] = await Promise.all([fornecedorIdLogado(), orgaoIdLogado()]);
  const podeAvancar =
    fornecedorId === adesao.item.ata.fornecedorId || orgaoId === adesao.orgaoAderenteId;

  const indiceAtual = ORDEM_ESTAGIOS.indexOf(adesao.estagio);

  return (
    <>
      {/* Cabeçalho do site — fica fora da impressão/PDF (lá vale o timbre). */}
      <div className="sem-impressao contents">
        <BarraTopo />
      </div>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
        {/* Timbre — só aparece na impressão/PDF */}
        <div className="timbre-impressao mb-6 border-b pb-4" style={{ borderColor: "var(--cor-borda)" }}>
          <p className="marca-wordmark text-lg">Central Nacional de Atas de Registro de Preços</p>
          <p className="text-xs">Tech 10 Digital — comprovante de adesão nº {adesao.id}</p>
        </div>

        <CabecalhoPagina
          rotulo="Comprovante de adesão"
          titulo={adesao.item.descricao}
          descricao={
            <>
              <span className="numero font-semibold" style={{ color: "var(--cor-texto)" }}>
                {adesao.quantidadeSolicitada} {adesao.item.unidade}
              </span>{" "}
              — Ata <span className="codigo">{adesao.item.ata.numero}</span> ({adesao.item.ata.fornecedor.razaoSocial})
              · Órgão: {adesao.orgaoAderente.nome}
            </>
          }
          acoes={
            <div className="sem-impressao">
              <BotaoImprimir />
            </div>
          }
        />

        {/* Resumo compacto — só aparece na impressão/PDF */}
        <p className="somente-impressao text-sm">
          Estágio atual: <strong>{ROTULO_ESTAGIO[adesao.estagio]}</strong>
        </p>

        <Secao titulo="Estágio do pedido" destaque>
          <ol className="flex flex-col">
            {ORDEM_ESTAGIOS.map((estagio, indice) => {
              const concluido = indice < indiceAtual;
              const atual = indice === indiceAtual;
              const ultimo = indice === ORDEM_ESTAGIOS.length - 1;
              return (
                <li key={estagio} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span
                      className="numero grid size-8 shrink-0 place-items-center rounded-full border text-[13px] font-extrabold"
                      style={{
                        borderColor: concluido || atual ? "var(--cor-marca)" : "var(--cor-borda)",
                        background: concluido
                          ? "var(--cor-marca)"
                          : atual
                            ? "var(--cor-marca-fundo)"
                            : "var(--cor-superficie-2)",
                        color: concluido
                          ? "var(--cor-superficie)"
                          : atual
                            ? "var(--cor-marca-clara)"
                            : "var(--cor-texto-3)",
                        boxShadow: atual ? "0 0 0 4px var(--cor-marca-fundo)" : undefined,
                      }}
                    >
                      {indice + 1}
                    </span>
                    {!ultimo && (
                      <span
                        className="h-7 w-0 border-l-[1.5px]"
                        style={{
                          borderColor: concluido ? "var(--cor-marca)" : "var(--cor-borda-forte)",
                          borderLeftStyle: concluido ? "solid" : "dashed",
                        }}
                      />
                    )}
                  </div>
                  <p
                    className={`pt-1.5 text-sm ${ultimo ? "" : "pb-7"}`}
                    style={{
                      color: atual
                        ? "var(--cor-texto)"
                        : concluido
                          ? "var(--cor-texto-2)"
                          : "var(--cor-texto-3)",
                      fontWeight: atual ? 700 : 400,
                    }}
                  >
                    {ROTULO_ESTAGIO[estagio]}
                  </p>
                </li>
              );
            })}
          </ol>

          {podeAvancar && !estagioConcluido(adesao.estagio) && (
            <div className="sem-impressao mt-6 border-t pt-5" style={{ borderColor: "var(--cor-borda)" }}>
              <BotaoAvancar adesaoId={adesao.id} />
            </div>
          )}
          {estagioConcluido(adesao.estagio) && (
            <Aviso tom="sucesso" className="mt-6">
              Pedido concluído — taxa de intermediação faturada.
            </Aviso>
          )}
        </Secao>

        {adesao.faturamento && (
          <Secao
            titulo="Faturamento — cobrado do fornecedor"
            acao={
              <Badge tom={tomFaturamento(adesao.faturamento.pago)}>
                {adesao.faturamento.pago ? "Recebido" : "A receber"}
              </Badge>
            }
          >
            <Aviso tom="info">
              O órgão público não paga nada nesta operação. A taxa abaixo é devida
              exclusivamente por {adesao.item.ata.fornecedor.razaoSocial}.
            </Aviso>
            <dl className="lista-linhas mt-5 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt style={{ color: "var(--cor-texto-2)" }}>Valor do contrato</dt>
                <dd className="font-semibold" style={{ color: "var(--cor-texto)" }}>
                  <Cifra valor={adesao.faturamento.valorContrato} />
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt style={{ color: "var(--cor-texto-2)" }}>
                  Taxa de intermediação (<Percentual valor={adesao.faturamento.percentualTaxa} />)
                </dt>
                <dd
                  className="text-[18px] font-extrabold tracking-[-0.02em]"
                  style={{ color: "var(--cor-texto)" }}
                >
                  <Cifra valor={adesao.faturamento.valorTaxaIntermediacao} />
                </dd>
              </div>
            </dl>
          </Secao>
        )}

        <Secao titulo="Histórico">
          <ul className="lista-linhas text-sm">
            {adesao.historico.map((entrada) => (
              <li
                key={entrada.id}
                className="flex flex-col gap-0.5 sm:grid sm:grid-cols-[170px_1fr] sm:gap-4"
                style={{ color: "var(--cor-texto-2)" }}
              >
                <span className="numero text-[13px]" style={{ color: "var(--cor-texto-3)" }}>
                  {new Date(entrada.alteradoEm).toLocaleString("pt-BR")}
                </span>
                <span>
                  {entrada.alteradoPor} moveu para{" "}
                  <strong style={{ color: "var(--cor-texto)" }}>{ROTULO_ESTAGIO[entrada.estagioNovo]}</strong>
                </span>
              </li>
            ))}
          </ul>
        </Secao>

        {/* Rodapé legal — só aparece na impressão/PDF */}
        <p className="rodape-impressao mt-6 border-t pt-3 text-xs" style={{ borderColor: "var(--cor-borda)" }}>
          Documento gerado pela Central Nacional de Atas de Registro de Preços em{" "}
          {new Date().toLocaleString("pt-BR")}. Não substitui os atos formais de empenho,
          contrato e publicação exigidos pela Lei 14.133/2021.
        </p>
      </main>
    </>
  );
}
