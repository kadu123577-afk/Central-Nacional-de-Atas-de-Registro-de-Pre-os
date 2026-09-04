import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ataDisponivelParaAdesao } from "@/lib/atas";
import { saldoAgregadoDisponivel } from "@/lib/saldo";
import { Logo } from "@/components/ui/logo";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { Cifra, Numero } from "@/components/ui/valores";

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
    },
  });

  if (!ata || !ataDisponivelParaAdesao(ata)) notFound();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-10">
      <div>
        <Logo altura={26} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Ata {ata.numero}
          </h1>
          {ata.categoria && <Badge tom="neutro">{ata.categoria}</Badge>}
          {ata.origem === "PNCP" && <Badge tom="marca">PNCP</Badge>}
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
      </Secao>

      <Secao titulo={`Itens (${ata.itens.length})`}>
        <ul className="flex flex-col gap-3">
          {ata.itens.map((item) => (
            <li
              key={item.id}
              className="painel p-5"
              style={
                item.id === itemDestacado
                  ? { borderColor: "var(--cor-marca)", background: "var(--cor-marca-fundo)" }
                  : undefined
              }
            >
              <div className="flex items-baseline justify-between gap-3">
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
                    {saldoAgregadoDisponivel(
                      item.quantidadeRegistrada,
                      item.saldo?.quantidadeConsumida ?? 0,
                    )}{" "}
                    {item.unidade}
                  </Numero>
                </strong>
              </p>
              <Link href={`/orgao/pedido/novo?itemId=${item.id}`} className="botao-atas secundario mt-3">
                Pedir adesão
              </Link>
            </li>
          ))}
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
