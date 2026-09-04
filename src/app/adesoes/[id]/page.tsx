import { notFound } from "next/navigation";
import { fornecedorIdLogado, orgaoIdLogado } from "@/lib/auth";
import { ORDEM_ESTAGIOS, ROTULO_ESTAGIO, estagioConcluido } from "@/lib/adesao";
import { prisma } from "@/lib/prisma";
import { BotaoAvancar } from "./botao-avancar";
import { BotaoImprimir } from "./botao-imprimir";
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
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-6 py-10">
      {/* Timbre — só aparece na impressão/PDF */}
      <div className="timbre-impressao mb-6 border-b pb-4" style={{ borderColor: "#999" }}>
        <p className="marca text-lg">Central Nacional de Atas de Registro de Preços</p>
        <p className="text-xs">Tech 10 Digital — comprovante de adesão nº {adesao.id}</p>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            {adesao.item.descricao}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {adesao.quantidadeSolicitada} {adesao.item.unidade} — Ata {adesao.item.ata.numero} (
            {adesao.item.ata.fornecedor.razaoSocial}) · Órgão: {adesao.orgaoAderente.nome}
          </p>
        </div>
        <div className="sem-impressao">
          <BotaoImprimir />
        </div>
      </div>

      {/* Resumo compacto — só aparece na impressão/PDF */}
      <p className="somente-impressao text-sm">
        Estágio atual: <strong>{ROTULO_ESTAGIO[adesao.estagio]}</strong>
      </p>

      <Secao titulo="Estágio do pedido">
        <ol className="flex flex-col">
          {ORDEM_ESTAGIOS.map((estagio, indice) => {
            const concluido = indice < indiceAtual;
            const atual = indice === indiceAtual;
            const cor = concluido || atual ? "var(--cor-marca)" : "var(--cor-borda-forte)";
            return (
              <li key={estagio} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium numero"
                    style={{
                      borderColor: cor,
                      background: concluido ? "var(--cor-marca)" : "transparent",
                      color: concluido ? "var(--cor-fundo)" : cor,
                    }}
                  >
                    {indice + 1}
                  </span>
                  {indice < ORDEM_ESTAGIOS.length - 1 && (
                    <span
                      className="h-8 w-px"
                      style={{ background: concluido ? "var(--cor-marca)" : "var(--cor-borda)" }}
                    />
                  )}
                </div>
                <p
                  className="pb-8 text-sm"
                  style={{
                    color: atual
                      ? "var(--cor-texto)"
                      : concluido
                        ? "var(--cor-texto-2)"
                        : "var(--cor-texto-3)",
                    fontWeight: atual ? 600 : 400,
                  }}
                >
                  {ROTULO_ESTAGIO[estagio]}
                </p>
              </li>
            );
          })}
        </ol>

        {podeAvancar && !estagioConcluido(adesao.estagio) && (
          <div className="sem-impressao">
            <BotaoAvancar adesaoId={adesao.id} />
          </div>
        )}
        {estagioConcluido(adesao.estagio) && (
          <p className="text-sm font-medium" style={{ color: "var(--cor-texto-2)" }}>
            Pedido concluído — taxa de intermediação faturada.
          </p>
        )}
      </Secao>

      {adesao.faturamento && (
        <Secao
          titulo="Faturamento — cobrado do fornecedor"
          acao={<Badge tom={tomFaturamento(adesao.faturamento.pago)}>
            {adesao.faturamento.pago ? "Recebido" : "A receber"}
          </Badge>}
        >
          <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
            O órgão público não paga nada nesta operação. A taxa abaixo é devida
            exclusivamente por {adesao.item.ata.fornecedor.razaoSocial}.
          </p>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt style={{ color: "var(--cor-texto-2)" }}>Valor do contrato</dt>
              <dd className="font-medium" style={{ color: "var(--cor-texto)" }}>
                <Cifra valor={adesao.faturamento.valorContrato} />
              </dd>
            </div>
            <div
              className="flex justify-between border-t pt-2"
              style={{ borderColor: "var(--cor-borda)" }}
            >
              <dt style={{ color: "var(--cor-texto-2)" }}>
                Taxa de intermediação (<Percentual valor={adesao.faturamento.percentualTaxa} />)
              </dt>
              <dd className="font-medium" style={{ color: "var(--cor-texto)" }}>
                <Cifra valor={adesao.faturamento.valorTaxaIntermediacao} />
              </dd>
            </div>
          </dl>
        </Secao>
      )}

      <Secao titulo="Histórico">
        <ul className="flex flex-col gap-2 text-sm">
          {adesao.historico.map((entrada) => (
            <li key={entrada.id} style={{ color: "var(--cor-texto-2)" }}>
              <span className="numero">
                {new Date(entrada.alteradoEm).toLocaleString("pt-BR")}
              </span>{" "}
              — {entrada.alteradoPor} moveu para{" "}
              <strong style={{ color: "var(--cor-texto)" }}>
                {ROTULO_ESTAGIO[entrada.estagioNovo]}
              </strong>
            </li>
          ))}
        </ul>
      </Secao>

      {/* Rodapé legal — só aparece na impressão/PDF */}
      <p className="rodape-impressao mt-6 border-t pt-3 text-xs" style={{ borderColor: "#999" }}>
        Documento gerado pela Central Nacional de Atas de Registro de Preços em{" "}
        {new Date().toLocaleString("pt-BR")}. Não substitui os atos formais de empenho,
        contrato e publicação exigidos pela Lei 14.133/2021.
      </p>
    </main>
  );
}
