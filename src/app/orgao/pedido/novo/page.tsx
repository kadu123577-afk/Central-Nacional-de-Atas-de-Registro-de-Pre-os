import { redirect } from "next/navigation";
import { orgaoIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saldoAgregadoDisponivel, limitePorOrgao } from "@/lib/saldo";
import { FormularioPedido } from "./formulario";

export const dynamic = "force-dynamic";

export default async function NovoPedidoPage({
  searchParams,
}: {
  searchParams: Promise<{ itemId?: string }>;
}) {
  const orgaoId = await orgaoIdLogado();
  if (!orgaoId) {
    redirect("/orgao/login");
  }

  const { itemId } = await searchParams;
  if (!itemId) {
    redirect("/catalogo");
  }

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { saldo: true, ata: { include: { fornecedor: true, orgaoGerenciador: true } } },
  });

  if (!item || item.ata.status !== "APROVADA") {
    redirect("/catalogo");
  }

  const quantidadeConsumida = item.saldo?.quantidadeConsumida ?? 0;

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <h1 className="text-2xl font-semibold">Pedir adesão</h1>

      <div className="mt-4 rounded-lg border border-neutral-200 p-4 text-sm">
        <p className="font-medium">{item.descricao}</p>
        <p className="mt-1 text-neutral-600">
          Ata {item.ata.numero} — {item.ata.fornecedor.razaoSocial}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-600">
          <dt>Limite por órgão (50%)</dt>
          <dd className="text-right font-medium text-neutral-900">
            {limitePorOrgao(item.quantidadeRegistrada)} {item.unidade}
          </dd>
          <dt>Saldo agregado disponível</dt>
          <dd className="text-right font-medium text-neutral-900">
            {saldoAgregadoDisponivel(item.quantidadeRegistrada, quantidadeConsumida)}{" "}
            {item.unidade}
          </dd>
        </dl>
      </div>

      <FormularioPedido itemId={item.id} unidade={item.unidade} />
    </main>
  );
}
