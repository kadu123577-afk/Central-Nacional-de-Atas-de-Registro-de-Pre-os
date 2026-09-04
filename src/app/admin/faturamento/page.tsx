import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marcarFaturamentoComoPago, marcarFaturamentoComoPendente } from "../actions";

export const dynamic = "force-dynamic";

export default async function FaturamentoAdminPage() {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const faturamentos = await prisma.faturamento.findMany({
    include: {
      adesao: {
        include: {
          orgaoAderente: true,
          item: { include: { ata: { include: { fornecedor: true } } } },
        },
      },
    },
    orderBy: { criadoEm: "desc" },
  });

  const totalAReceber = faturamentos
    .filter((f) => !f.pago)
    .reduce((total, f) => total + Number(f.valorTaxaIntermediacao), 0);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contas a receber</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Taxa de intermediação devida por cada fornecedor, por adesão empenhada.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-neutral-500 underline">
          ← Painel
        </Link>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-200 p-4">
        <p className="text-2xl font-semibold tabular-nums">R$ {totalAReceber.toFixed(2)}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
          Total em aberto
        </p>
      </div>

      {faturamentos.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">Nenhuma cobrança gerada ainda.</p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                <th className="py-2 pr-4">Ata</th>
                <th className="py-2 pr-4">Fornecedor</th>
                <th className="py-2 pr-4">Órgão aderente</th>
                <th className="py-2 pr-4">Valor do contrato</th>
                <th className="py-2 pr-4">A receber</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {faturamentos.map((f) => (
                <tr key={f.id} className="border-b border-neutral-100 last:border-0">
                  <td className="py-2 pr-4">
                    <Link href={`/adesoes/${f.adesaoId}`} className="underline">
                      {f.adesao.item.ata.numero}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{f.adesao.item.ata.fornecedor.razaoSocial}</td>
                  <td className="py-2 pr-4">
                    {f.adesao.orgaoAderente.nome} ({f.adesao.orgaoAderente.uf})
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    R$ {Number(f.valorContrato).toFixed(2)}
                  </td>
                  <td className="py-2 pr-4 font-medium tabular-nums">
                    R$ {Number(f.valorTaxaIntermediacao).toFixed(2)}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (f.pago
                          ? "bg-green-50 text-green-700"
                          : "bg-amber-50 text-amber-700")
                      }
                    >
                      {f.pago ? "Recebido" : "A receber"}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <form
                      action={f.pago ? marcarFaturamentoComoPendente : marcarFaturamentoComoPago}
                    >
                      <input type="hidden" name="faturamentoId" value={f.id} />
                      <button type="submit" className="text-xs underline">
                        {f.pago ? "Marcar como pendente" : "Marcar como recebido"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
