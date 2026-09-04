import Link from "next/link";
import { redirect } from "next/navigation";
import { orgaoIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROTULO_ESTAGIO } from "@/lib/adesao";
import { logoutOrgao } from "./actions";
import { AppShell } from "@/components/ui/app-shell";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { Numero } from "@/components/ui/valores";

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
    <AppShell
      area="Órgão comprador"
      itens={[
        { rotulo: "Meus pedidos", href: "/orgao" },
        { rotulo: "Catálogo", href: "/catalogo" },
      ]}
      rodape={
        <form action={logoutOrgao}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <div>
        <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
          Meus pedidos de adesão
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          {orgao.nome}
        </p>
      </div>

      {orgao.adesoes.length === 0 ? (
        <VazioComAcao
          titulo="Nenhum pedido ainda"
          descricao="Busque um item no catálogo público e peça adesão."
          acao={
            <Link href="/catalogo" className="botao-atas">
              Buscar itens no catálogo
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {orgao.adesoes.map((adesao) => (
            <li key={adesao.id}>
              <Link href={`/adesoes/${adesao.id}`} className="painel block p-4 transition-colors hover:border-[var(--cor-borda-forte)]">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium" style={{ color: "var(--cor-texto)" }}>
                    {adesao.item.descricao}
                  </span>
                  <span className="eyebrow">{ROTULO_ESTAGIO[adesao.estagio]}</span>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
                  <Numero>
                    {adesao.quantidadeSolicitada} {adesao.item.unidade}
                  </Numero>{" "}
                  — Ata {adesao.item.ata.numero} ({adesao.item.ata.fornecedor.razaoSocial})
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
