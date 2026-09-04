import { notFound } from "next/navigation";
import { fornecedorIdLogado, orgaoIdLogado } from "@/lib/auth";
import { ORDEM_ESTAGIOS, ROTULO_ESTAGIO, estagioConcluido } from "@/lib/adesao";
import { prisma } from "@/lib/prisma";
import { BotaoAvancar } from "./botao-avancar";

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
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">{adesao.item.descricao}</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {adesao.quantidadeSolicitada} {adesao.item.unidade} — Ata {adesao.item.ata.numero} (
        {adesao.item.ata.fornecedor.razaoSocial}) · Órgão: {adesao.orgaoAderente.nome}
      </p>

      <ol className="mt-8 space-y-0">
        {ORDEM_ESTAGIOS.map((estagio, indice) => {
          const concluido = indice < indiceAtual;
          const atual = indice === indiceAtual;
          return (
            <li key={estagio} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium " +
                    (concluido
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : atual
                        ? "border-neutral-900 text-neutral-900"
                        : "border-neutral-300 text-neutral-400")
                  }
                >
                  {indice + 1}
                </span>
                {indice < ORDEM_ESTAGIOS.length - 1 && (
                  <span
                    className={
                      "h-8 w-px " + (concluido ? "bg-neutral-900" : "bg-neutral-200")
                    }
                  />
                )}
              </div>
              <p
                className={
                  "pb-8 text-sm " +
                  (atual
                    ? "font-medium text-neutral-900"
                    : concluido
                      ? "text-neutral-600"
                      : "text-neutral-400")
                }
              >
                {ROTULO_ESTAGIO[estagio]}
              </p>
            </li>
          );
        })}
      </ol>

      {podeAvancar && !estagioConcluido(adesao.estagio) && (
        <BotaoAvancar adesaoId={adesao.id} />
      )}
      {estagioConcluido(adesao.estagio) && (
        <p className="text-sm font-medium text-neutral-600">
          Pedido concluído — taxa de intermediação faturada.
        </p>
      )}

      {adesao.faturamento && (
        <section className="mt-8 rounded-lg border border-neutral-200 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Faturamento — cobrado do fornecedor
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            O órgão público não paga nada nesta operação. A taxa abaixo é devida
            exclusivamente por {adesao.item.ata.fornecedor.razaoSocial}.
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-600">Valor do contrato</dt>
              <dd className="font-medium tabular-nums">
                R$ {Number(adesao.faturamento.valorContrato).toFixed(2)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-neutral-100 pt-2">
              <dt className="text-neutral-600">
                Taxa de intermediação (
                {(Number(adesao.faturamento.percentualTaxa) * 100).toFixed(1)}%)
              </dt>
              <dd className="font-medium tabular-nums">
                R$ {Number(adesao.faturamento.valorTaxaIntermediacao).toFixed(2)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-600">Status</dt>
              <dd className="tabular-nums">
                {adesao.faturamento.pago ? "Recebido" : "A receber"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Histórico
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {adesao.historico.map((entrada) => (
            <li key={entrada.id} className="text-neutral-600">
              {new Date(entrada.alteradoEm).toLocaleString("pt-BR")} — {entrada.alteradoPor}{" "}
              moveu para <strong>{ROTULO_ESTAGIO[entrada.estagioNovo]}</strong>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
