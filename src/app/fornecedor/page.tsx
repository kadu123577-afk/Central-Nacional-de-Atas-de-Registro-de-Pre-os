import { redirect } from "next/navigation";
import { fornecedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saldoAgregadoDisponivel, limitePorOrgao } from "@/lib/saldo";
import { logoutFornecedor } from "./actions";

export const dynamic = "force-dynamic";

export default async function PainelFornecedorPage() {
  const fornecedorId = await fornecedorIdLogado();
  if (!fornecedorId) {
    redirect("/fornecedor/login");
  }

  const fornecedor = await prisma.fornecedor.findUnique({
    where: { id: fornecedorId },
    include: {
      atas: {
        include: { itens: { include: { saldo: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!fornecedor) {
    redirect("/fornecedor/login");
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Minhas atas</h1>
          <p className="mt-1 text-sm text-neutral-600">{fornecedor.razaoSocial}</p>
        </div>
        <form action={logoutFornecedor}>
          <button type="submit" className="text-sm text-neutral-500 underline">
            Sair
          </button>
        </form>
      </div>

      {fornecedor.atas.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">
          Você ainda não tem nenhuma ata cadastrada.
        </p>
      ) : (
        <ul className="mt-8 space-y-6">
          {fornecedor.atas.map((ata) => (
            <li key={ata.id} className="rounded-lg border border-neutral-200 p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-medium">Ata {ata.numero}</h2>
                <span className="text-xs uppercase tracking-wide text-neutral-500">
                  {ata.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-600">{ata.objeto}</p>

              <table className="mt-4 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                    <th className="py-1 pr-4">Item</th>
                    <th className="py-1 pr-4">Registrado</th>
                    <th className="py-1 pr-4">Limite por órgão</th>
                    <th className="py-1 pr-4">Saldo disponível</th>
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
