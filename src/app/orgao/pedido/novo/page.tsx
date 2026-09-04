import { redirect } from "next/navigation";
import { orgaoIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saldoAgregadoDisponivel, limitePorOrgao } from "@/lib/saldo";
import { ataDisponivelParaAdesao } from "@/lib/atas";
import { FormularioPedido } from "./formulario";
import { logoutOrgao } from "../../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Numero } from "@/components/ui/valores";

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

  if (!item || !ataDisponivelParaAdesao(item.ata)) {
    redirect("/catalogo");
  }

  const quantidadeConsumida = item.saldo?.quantidadeConsumida ?? 0;

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
      <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
        Pedir adesão
      </h1>

      <Secao titulo={item.descricao}>
        <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Ata {item.ata.numero} — {item.ata.fornecedor.razaoSocial}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <dt style={{ color: "var(--cor-texto-3)" }}>Limite por órgão (50%)</dt>
          <dd className="text-right font-medium" style={{ color: "var(--cor-texto)" }}>
            <Numero>
              {limitePorOrgao(item.quantidadeRegistrada)} {item.unidade}
            </Numero>
          </dd>
          <dt style={{ color: "var(--cor-texto-3)" }}>Saldo agregado disponível</dt>
          <dd className="text-right font-medium" style={{ color: "var(--cor-texto)" }}>
            <Numero>
              {saldoAgregadoDisponivel(item.quantidadeRegistrada, quantidadeConsumida)}{" "}
              {item.unidade}
            </Numero>
          </dd>
        </dl>
      </Secao>

      <FormularioPedido itemId={item.id} unidade={item.unidade} />
    </AppShell>
  );
}
