import { redirect } from "next/navigation";
import { orgaoIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saldoAgregadoDisponivel, limitePorOrgao } from "@/lib/saldo";
import { ataDisponivelParaAdesao } from "@/lib/atas";
import { percentualSaldoItem } from "@/lib/vitrine";
import { FormularioPedido } from "./formulario";
import { logoutOrgao } from "../../actions";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
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
  const saldo = percentualSaldoItem(item);

  return (
    <AppShell
      area="Órgão comprador"
      itens={[
        { rotulo: "Meus pedidos", href: "/orgao" },
        { rotulo: "Catálogo", href: "/catalogo" },
        { rotulo: "Perfil", href: "/orgao/perfil" },
      ]}
      rodape={
        <form action={logoutOrgao}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Painel do órgão"
        titulo="Pedir adesão"
        voltar={{ href: `/catalogo/${item.ata.id}`, rotulo: "Voltar à ata" }}
      />

      <section className="painel painel-destaque p-6">
        <p className="codigo" style={{ color: "var(--cor-texto-3)", fontSize: 11.5 }}>
          Ata Nº {item.ata.numero}
        </p>
        <h2
          className="marca mt-1.5 text-[19px] leading-snug"
          style={{ color: "var(--cor-texto)", fontWeight: 800, letterSpacing: "-0.025em" }}
        >
          {item.descricao}
        </h2>
        <p className="mt-1 text-[13.5px]" style={{ color: "var(--cor-texto-3)" }}>
          {item.ata.fornecedor.razaoSocial}
        </p>

        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[10px] px-4 py-3" style={{ background: "var(--cor-superficie-2)" }}>
            <dt className="text-[12.5px]" style={{ color: "var(--cor-texto-3)" }}>
              Limite por órgão (50%)
            </dt>
            <dd className="mt-1 text-[20px] font-extrabold tracking-tight" style={{ color: "var(--cor-texto)" }}>
              <Numero>
                {limitePorOrgao(item.quantidadeRegistrada)} {item.unidade}
              </Numero>
            </dd>
          </div>
          <div className="rounded-[10px] px-4 py-3" style={{ background: "var(--cor-superficie-2)" }}>
            <dt className="text-[12.5px]" style={{ color: "var(--cor-texto-3)" }}>
              Saldo agregado disponível
            </dt>
            <dd className="mt-1 text-[20px] font-extrabold tracking-tight" style={{ color: "var(--cor-marca-clara)" }}>
              <Numero>
                {saldoAgregadoDisponivel(item.quantidadeRegistrada, quantidadeConsumida)}{" "}
                {item.unidade}
              </Numero>
            </dd>
            {saldo !== null && (
              <div className="mt-2 flex items-center gap-2">
                <div className="barra-saldo flex-1">
                  <div style={{ width: `${saldo}%` }} />
                </div>
                <span className="numero text-[11.5px] font-bold" style={{ color: "var(--cor-texto)" }}>
                  {saldo}%
                </span>
              </div>
            )}
          </div>
        </dl>
      </section>

      <FormularioPedido itemId={item.id} unidade={item.unidade} />
    </AppShell>
  );
}
