import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { CartaoIndicador } from "@/components/ui/cartao-indicador";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { StatusFaturamento } from "./status-faturamento";
import { logoutAdmin } from "../actions";

export const dynamic = "force-dynamic";

const NAV_ADMIN = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Contas a receber", href: "/admin/faturamento" },
  { rotulo: "Usuários", href: "/admin/usuarios" },
  { rotulo: "Perfil", href: "/admin/perfil" },
];

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
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Contas a receber
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Taxa de intermediação devida por cada fornecedor, por adesão empenhada.
          </p>
        </div>
        <Link href="/admin" className="botao-atas link">
          ← Painel
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CartaoIndicador
          rotulo="Total em aberto"
          valor={<Cifra valor={totalAReceber} />}
          tom={totalAReceber > 0 ? "atencao" : "neutro"}
        />
      </div>

      {faturamentos.length === 0 ? (
        <VazioComAcao
          titulo="Nenhuma cobrança gerada ainda"
          descricao="Cobranças nascem sozinhas quando um pedido de adesão chega em Empenhada."
        />
      ) : (
        <div className="painel overflow-x-auto p-1">
          <table className="tabela-atas">
            <thead>
              <tr>
                <th>Ata</th>
                <th>Fornecedor</th>
                <th>Órgão aderente</th>
                <th>Valor do contrato</th>
                <th>A receber</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {faturamentos.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Link href={`/adesoes/${f.adesaoId}`} className="underline">
                      {f.adesao.item.ata.numero}
                    </Link>
                  </td>
                  <td>{f.adesao.item.ata.fornecedor.razaoSocial}</td>
                  <td>
                    {f.adesao.orgaoAderente.nome} ({f.adesao.orgaoAderente.uf})
                  </td>
                  <td>
                    <Cifra valor={f.valorContrato} />
                  </td>
                  <td className="font-medium" style={{ color: "var(--cor-texto)" }}>
                    <Cifra valor={f.valorTaxaIntermediacao} />
                  </td>
                  <StatusFaturamento faturamentoId={f.id} pagoInicial={f.pago} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
