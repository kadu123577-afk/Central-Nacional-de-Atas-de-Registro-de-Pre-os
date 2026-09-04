import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ataDisponivelParaAdesao, diasParaVencer } from "@/lib/atas";
import { saldoAgregadoDisponivel, limitePorOrgao, limiteAgregado } from "@/lib/saldo";
import { tomVigencia } from "@/lib/severidade";
import { orgaoIdLogado } from "@/lib/auth";
import { Logo } from "@/components/ui/logo";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { SeloCategoria } from "@/components/ui/selo-categoria";
import { Cifra, Numero } from "@/components/ui/valores";
import { BarraConsumo } from "@/components/ui/barra-consumo";

export const dynamic = "force-dynamic";

export default async function DetalheAtaPage({
  params,
  searchParams,
}: {
  params: Promise<{ ataId: string }>;
  searchParams: Promise<{ item?: string }>;
}) {
  const { ataId } = await params;
  const { item: itemDestacado } = await searchParams;

  const ata = await prisma.ata.findUnique({
    where: { id: ataId },
    include: {
      fornecedor: true,
      orgaoGerenciador: true,
      itens: { include: { saldo: true }, orderBy: { descricao: "asc" } },
      documentos: true,
    },
  });

  if (!ata || !ataDisponivelParaAdesao(ata)) notFound();

  const orgaoId = await orgaoIdLogado();
  const itemIds = ata.itens.map((item) => item.id);

  // Quanto o órgão logado (se houver) já aderiu de cada item desta ata —
  // só faz sentido calcular "seu órgão" quando existe um órgão de fato
  // navegando; visitante anônimo só vê a barra agregada (pública).
  const adesaoDoOrgaoPorItem = orgaoId
    ? new Map(
        (
          await prisma.adesao.groupBy({
            by: ["itemId"],
            where: { itemId: { in: itemIds }, orgaoAderenteId: orgaoId },
            _sum: { quantidadeSolicitada: true },
          })
        ).map((linha) => [linha.itemId, linha._sum.quantidadeSolicitada ?? 0]),
      )
    : null;

  const diasVigencia = diasParaVencer(ata.dataVigenciaFim);
  const tomVig = tomVigencia(diasVigencia);
  const rotuloVigencia =
    diasVigencia < 0 ? `Vencida há ${Math.abs(diasVigencia)} dia(s)` : `Vence em ${diasVigencia} dia(s)`;

  const itemDestacadoObj = itemDestacado ? ata.itens.find((i) => i.id === itemDestacado) : undefined;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-10">
      <div>
        <Logo altura={26} />

        <nav className="mt-4 flex flex-wrap items-center gap-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
          <Link href="/" className="underline">
            Início
          </Link>
          <span>/</span>
          {ata.categoria ? (
            <Link href={`/catalogo?categoria=${encodeURIComponent(ata.categoria)}`} className="underline">
              {ata.categoria}
            </Link>
          ) : (
            <span>Sem tema classificado</span>
          )}
          <span>/</span>
          <span>Ata {ata.numero}</span>
          {itemDestacadoObj && (
            <>
              <span>/</span>
              <span style={{ color: "var(--cor-texto-2)" }}>{itemDestacadoObj.descricao}</span>
            </>
          )}
        </nav>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Ata {ata.numero}
          </h1>
          {ata.categoria && <SeloCategoria categoria={ata.categoria} />}
          {ata.origem === "PNCP" && <Badge tom="marca">Importado do PNCP</Badge>}
          {ata.origem === "COMPRAS_GOV" && <Badge tom="marca">Importado do Compras.gov.br</Badge>}
          <Badge tom={tomVig}>{rotuloVigencia}</Badge>
        </div>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--cor-texto-2)" }}>
          {ata.objeto}
        </p>
      </div>

      <Secao titulo="Dados da ata">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Campo rotulo="Fornecedor" valor={ata.fornecedor.razaoSocial} />
          <Campo
            rotulo="Órgão gerenciador"
            valor={`${ata.orgaoGerenciador.nome} (${ata.orgaoGerenciador.uf})`}
          />
          <Campo rotulo="Assinatura" valor={ata.dataAssinatura.toLocaleDateString("pt-BR")} />
          <Campo rotulo="Vigência até" valor={ata.dataVigenciaFim.toLocaleDateString("pt-BR")} />
          {ata.numeroControlePncp && (
            <Campo rotulo="Número de controle PNCP" valor={ata.numeroControlePncp} />
          )}
        </div>
        {ata.documentos.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {ata.documentos.map((doc) => (
              <a
                key={doc.id}
                href={`/api/documentos/${doc.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline"
                style={{ color: "var(--cor-texto-2)" }}
              >
                📎 {doc.nomeArquivo}
              </a>
            ))}
          </div>
        )}
      </Secao>

      <Secao titulo={`Itens (${ata.itens.length})`}>
        <ul className="flex flex-col gap-3">
          {ata.itens.map((item) => {
            const consumidoAgregado = item.saldo?.quantidadeConsumida ?? 0;
            const percentualAgregado = (consumidoAgregado / limiteAgregado(item.quantidadeRegistrada)) * 100;

            const consumidoPeloOrgao = adesaoDoOrgaoPorItem?.get(item.id) ?? 0;
            const percentualOrgao = orgaoId
              ? (consumidoPeloOrgao / limitePorOrgao(item.quantidadeRegistrada)) * 100
              : null;

            return (
              <li
                key={item.id}
                className="painel p-5"
                style={
                  item.id === itemDestacado
                    ? { borderColor: "var(--cor-marca)", background: "var(--cor-marca-fundo)" }
                    : undefined
                }
              >
                {item.id === itemDestacado && (
                  <Badge tom="marca">Item que você buscou</Badge>
                )}
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <h2 className="font-medium" style={{ color: "var(--cor-texto)" }}>
                    {item.descricao}
                  </h2>
                  <span className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                    <Cifra valor={item.valorUnitario} /> / {item.unidade}
                  </span>
                </div>
                <p className="eyebrow mt-1">{item.categoria}</p>
                <p className="mt-2 text-sm" style={{ color: "var(--cor-texto-2)" }}>
                  Saldo agregado disponível:{" "}
                  <strong style={{ color: "var(--cor-texto)" }}>
                    <Numero>
                      {saldoAgregadoDisponivel(item.quantidadeRegistrada, consumidoAgregado)}{" "}
                      {item.unidade}
                    </Numero>
                  </strong>
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-4">
                  <BarraConsumo
                    rotulo="Consumo agregado (limite: 200% do registrado)"
                    percentual={percentualAgregado}
                    detalhe={`${consumidoAgregado} de ${limiteAgregado(item.quantidadeRegistrada)} ${item.unidade}`}
                  />
                  {percentualOrgao !== null ? (
                    <BarraConsumo
                      rotulo="Consumo do seu órgão (limite: 50% do registrado)"
                      percentual={percentualOrgao}
                      detalhe={`${consumidoPeloOrgao} de ${limitePorOrgao(item.quantidadeRegistrada)} ${item.unidade}`}
                    />
                  ) : (
                    <p className="self-center text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      <Link href="/orgao/login" className="underline">
                        Faça login como órgão
                      </Link>{" "}
                      para ver o consumo específico do seu órgão neste item.
                    </p>
                  )}
                </div>

                <Link href={`/orgao/pedido/novo?itemId=${item.id}`} className="botao-atas secundario mt-4">
                  Pedir adesão
                </Link>
              </li>
            );
          })}
        </ul>
      </Secao>

      <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
        <Link href="/catalogo" className="underline">
          Voltar ao catálogo
        </Link>
      </p>
    </main>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="eyebrow">{rotulo}</p>
      <p style={{ color: "var(--cor-texto)" }}>{valor}</p>
    </div>
  );
}
