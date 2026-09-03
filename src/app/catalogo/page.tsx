import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { saldoAgregadoDisponivel } from "@/lib/saldo";

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
    ata: {
      status: "APROVADA",
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
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Catálogo de atas de registro de preços</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600">
        Consulta pública, sem necessidade de cadastro. Um órgão público pode aderir a
        qualquer item aqui listado, respeitando o limite de 50% por órgão e o teto do
        dobro da quantidade registrada, previstos no art. 86 da Lei 14.133/2021.
      </p>

      <form className="mt-6 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Produto"
          className="col-span-2 rounded-md border border-neutral-300 px-3 py-2 text-sm sm:col-span-1"
        />
        <input
          name="categoria"
          defaultValue={categoria}
          placeholder="Categoria"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          name="uf"
          defaultValue={uf}
          placeholder="UF"
          maxLength={2}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm uppercase"
        />
        <input
          name="valorMax"
          defaultValue={valorMax}
          placeholder="Valor unitário até (R$)"
          type="number"
          step="0.01"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="col-span-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white sm:col-span-4"
        >
          Buscar
        </button>
      </form>

      {itens.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">
          Nenhum item encontrado para esses filtros.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {itens.map((item) => (
            <li key={item.id} className="rounded-lg border border-neutral-200 p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-medium">{item.descricao}</h2>
                <span className="text-sm text-neutral-600">
                  R$ {item.valorUnitario.toFixed(2)} / {item.unidade}
                </span>
              </div>
              <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                {item.categoria}
              </p>
              <p className="mt-2 text-sm text-neutral-600">
                Ata {item.ata.numero} — {item.ata.fornecedor.razaoSocial} · Órgão gerenciador:{" "}
                {item.ata.orgaoGerenciador.nome} ({item.ata.orgaoGerenciador.uf})
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                Saldo agregado disponível:{" "}
                <strong>
                  {saldoAgregadoDisponivel(
                    item.quantidadeRegistrada,
                    item.saldo?.quantidadeConsumida ?? 0,
                  )}{" "}
                  {item.unidade}
                </strong>
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/atas" className="underline">
          Ver cadastro interno de atas
        </Link>
      </p>
    </main>
  );
}
