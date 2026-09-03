import Link from "next/link";
import { redirect } from "next/navigation";
import { orgaoIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROTULO_ESTAGIO } from "@/lib/adesao";
import { logoutOrgao } from "./actions";

export const dynamic = "force-dynamic";

export default async function PainelOrgaoPage() {
  const orgaoId = await orgaoIdLogado();
  if (!orgaoId) {
    redirect("/orgao/login");
  }

  const orgao = await prisma.orgao.findUnique({
    where: { id: orgaoId },
    include: {
      adesoes: {
        include: { item: { include: { ata: { include: { fornecedor: true } } } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!orgao) {
    redirect("/orgao/login");
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Meus pedidos de adesão</h1>
          <p className="mt-1 text-sm text-neutral-600">{orgao.nome}</p>
        </div>
        <form action={logoutOrgao}>
          <button type="submit" className="text-sm text-neutral-500 underline">
            Sair
          </button>
        </form>
      </div>

      <Link
        href="/catalogo"
        className="mt-6 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
      >
        Buscar itens no catálogo
      </Link>

      {orgao.adesoes.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">
          Você ainda não pediu nenhuma adesão.
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {orgao.adesoes.map((adesao) => (
            <li key={adesao.id}>
              <Link
                href={`/adesoes/${adesao.id}`}
                className="block rounded-lg border border-neutral-200 p-4 hover:border-neutral-400"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{adesao.item.descricao}</span>
                  <span className="text-xs uppercase tracking-wide text-neutral-500">
                    {ROTULO_ESTAGIO[adesao.estagio]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-600">
                  {adesao.quantidadeSolicitada} {adesao.item.unidade} — Ata{" "}
                  {adesao.item.ata.numero} ({adesao.item.ata.fornecedor.razaoSocial})
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
