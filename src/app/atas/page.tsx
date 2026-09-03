import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { limitePorOrgao, saldoAgregadoDisponivel } from "@/lib/saldo";

// Depende sempre de dados atuais do banco — nunca pré-renderizar em build.
export const dynamic = "force-dynamic";

export default async function AtasPage() {
  const atas = await prisma.ata.findMany({
    include: {
      fornecedor: true,
      orgaoGerenciador: true,
      itens: { include: { saldo: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Atas cadastradas</h1>
        <Link
          href="/atas/nova"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          Nova ata
        </Link>
      </div>

      {atas.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">
          Nenhuma ata cadastrada ainda. Comece pela primeira.
        </p>
      ) : (
        <ul className="mt-8 space-y-6">
          {atas.map((ata) => (
            <li key={ata.id} className="rounded-lg border border-neutral-200 p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-medium">
                  Ata {ata.numero} — {ata.fornecedor.razaoSocial}
                </h2>
                <span className="text-xs uppercase tracking-wide text-neutral-500">
                  {ata.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-600">{ata.objeto}</p>
              <p className="mt-1 text-xs text-neutral-500">
                Órgão gerenciador: {ata.orgaoGerenciador.nome} ({ata.orgaoGerenciador.uf})
              </p>

              <table className="mt-4 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                    <th className="py-1 pr-4">Item</th>
                    <th className="py-1 pr-4">Qtd. registrada</th>
                    <th className="py-1 pr-4">Limite por órgão (50%)</th>
                    <th className="py-1 pr-4">Saldo agregado disponível</th>
                  </tr>
                </thead>
                <tbody>
                  {ata.itens.map((item) => (
                    <tr key={item.id} className="border-b border-neutral-100 last:border-0">
                      <td className="py-2 pr-4">{item.descricao}</td>
                      <td className="py-2 pr-4">
                        {item.quantidadeRegistrada} {item.unidade}
                      </td>
                      <td className="py-2 pr-4">{limitePorOrgao(item.quantidadeRegistrada)}</td>
                      <td className="py-2 pr-4">
                        {saldoAgregadoDisponivel(
                          item.quantidadeRegistrada,
                          item.saldo?.quantidadeConsumida ?? 0,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
