import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { saldoAgregadoDisponivel } from "@/lib/saldo";
import { Logo } from "@/components/ui/logo";
import { Secao } from "@/components/ui/secao";
import { Cifra, Numero } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";

export const dynamic = "force-dynamic";

interface FiltrosCatalogo {
  q?: string;
  categoria?: string;
  uf?: string;
  valorMax?: string;
}

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<FiltrosCatalogo>;
}) {
  const filtros = await searchParams;
  const q = filtros.q?.trim() ?? "";
  const categoria = filtros.categoria?.trim() ?? "";
  const uf = filtros.uf?.trim().toUpperCase() ?? "";
  const valorMax = filtros.valorMax?.trim() ?? "";

  const where: Prisma.ItemWhereInput = {
    // Ata aprovada e ainda dentro da vigência — ver src/lib/atas.ts
    // (ataDisponivelParaAdesao) para a mesma regra aplicada onde o pedido
    // de adesão é de fato criado.
    ata: {
      status: "APROVADA",
      dataVigenciaFim: { gte: new Date() },
      ...(uf ? { orgaoGerenciador: { uf } } : {}),
    },
    ...(q ? { descricao: { contains: q, mode: "insensitive" } } : {}),
    ...(categoria ? { categoria: { contains: categoria, mode: "insensitive" } } : {}),
    ...(valorMax && !Number.isNaN(Number(valorMax))
      ? { valorUnitario: { lte: new Prisma.Decimal(valorMax) } }
      : {}),
  };

  const itens = await prisma.item.findMany({
    where,
    include: {
      saldo: true,
      ata: { include: { fornecedor: true, orgaoGerenciador: true } },
    },
    orderBy: { descricao: "asc" },
  });

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-10">
      <div>
        <Logo altura={26} />
        <h1 className="marca mt-4 text-2xl" style={{ color: "var(--cor-texto)" }}>
          Catálogo de atas de registro de preços
        </h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Consulta pública, sem necessidade de cadastro. Um órgão público pode aderir a
          qualquer item aqui listado, respeitando o limite de 50% por órgão e o teto do
          dobro da quantidade registrada, previstos no art. 86 da Lei 14.133/2021.
        </p>
      </div>

      <Secao titulo="Buscar">
        <form className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input name="q" defaultValue={q} placeholder="Produto" className="campo-atas col-span-2 sm:col-span-1" />
          <input name="categoria" defaultValue={categoria} placeholder="Categoria" className="campo-atas" />
          <input
            name="uf"
            defaultValue={uf}
            placeholder="UF"
            maxLength={2}
            className="campo-atas uppercase"
          />
          <input
            name="valorMax"
            defaultValue={valorMax}
            placeholder="Valor unitário até (R$)"
            type="number"
            step="0.01"
            className="campo-atas"
          />
          <button type="submit" className="botao-atas col-span-2 sm:col-span-4">
            Buscar
          </button>
        </form>
      </Secao>

      {itens.length === 0 ? (
        <VazioComAcao
          titulo="Nenhum item encontrado"
          descricao="Ajuste os filtros de busca ou tente um termo mais genérico."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {itens.map((item) => (
            <li key={item.id} className="painel p-5">
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
                Ata {item.ata.numero} — {item.ata.fornecedor.razaoSocial} · Órgão gerenciador:{" "}
                {item.ata.orgaoGerenciador.nome} ({item.ata.orgaoGerenciador.uf})
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
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
      )}

      <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
        <Link href="/atas" className="underline">
          Ver cadastro interno de atas
        </Link>
      </p>
    </main>
  );
}
