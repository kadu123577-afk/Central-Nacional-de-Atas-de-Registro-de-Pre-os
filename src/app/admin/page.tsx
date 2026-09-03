import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saldoAgregadoDisponivel } from "@/lib/saldo";
import { aprovarAta, logoutAdmin, rejeitarAta } from "./actions";

export const dynamic = "force-dynamic";

export default async function PainelAdminPage() {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const [totalAtas, itensComSaldo, pedidosEmAndamento, pedidosFaturados, atasPendentes] =
    await Promise.all([
      prisma.ata.count({ where: { status: "APROVADA" } }),
      prisma.item.findMany({ include: { saldo: true } }),
      prisma.adesao.count({ where: { estagio: { not: "FATURADA" } } }),
      prisma.adesao.count({ where: { estagio: "FATURADA" } }),
      prisma.ata.findMany({
        where: { status: "PENDENTE" },
        include: { fornecedor: true, orgaoGerenciador: true, itens: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const saldoTotalDisponivel = itensComSaldo.reduce(
    (total, item) =>
      total + saldoAgregadoDisponivel(item.quantidadeRegistrada, item.saldo?.quantidadeConsumida ?? 0),
    0,
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Painel administrativo</h1>
        <form action={logoutAdmin}>
          <button type="submit" className="text-sm text-neutral-500 underline">
            Sair
          </button>
        </form>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica rotulo="Atas aprovadas" valor={totalAtas} />
        <Metrica rotulo="Saldo total disponível" valor={saldoTotalDisponivel} />
        <Metrica rotulo="Pedidos em andamento" valor={pedidosEmAndamento} />
        <Metrica rotulo="Contratos faturados" valor={pedidosFaturados} />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Atas aguardando moderação</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Uma ata só aparece no catálogo público depois de aprovada aqui.
        </p>

        {atasPendentes.length === 0 ? (
          <p className="mt-6 text-sm text-neutral-600">Nenhuma ata pendente no momento.</p>
        ) : (
          <ul className="mt-6 space-y-4">
            {atasPendentes.map((ata) => (
              <li key={ata.id} className="rounded-lg border border-neutral-200 p-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-medium">Ata {ata.numero}</h3>
                  <span className="text-xs uppercase tracking-wide text-neutral-500">
                    {ata.origem === "PNCP" ? "Importada do PNCP" : "Cadastro manual"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-600">{ata.objeto}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {ata.fornecedor.razaoSocial} · Órgão gerenciador: {ata.orgaoGerenciador.nome} (
                  {ata.orgaoGerenciador.uf}) · {ata.itens.length}{" "}
                  {ata.itens.length === 1 ? "item" : "itens"}
                </p>

                <div className="mt-3 flex gap-2">
                  <form action={aprovarAta}>
                    <input type="hidden" name="ataId" value={ata.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
                    >
                      Aprovar
                    </button>
                  </form>
                  <form action={rejeitarAta}>
                    <input type="hidden" name="ataId" value={ata.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800"
                    >
                      Rejeitar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">{rotulo}</p>
    </div>
  );
}
