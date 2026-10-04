import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { buscarMunicipiosCompativeis } from "@/lib/match-ata-municipio";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { logoutVendedor } from "../../../actions";
import { NAV_VENDEDOR } from "../../../nav";
import { FormularioSolicitar, type MunicipioOpcao } from "./formulario";

export const dynamic = "force-dynamic";

/**
 * Pedido de negociação (2026-10-04) — o vendedor escolhe os municípios em
 * que quer negociar a ata; o administrador libera (ou nega) cada pedido.
 * Município já em negociação por outro vendedor aparece desabilitado, sem
 * revelar quem é.
 */
export default async function SolicitarMunicipiosPage({ params }: { params: Promise<{ ataId: string }> }) {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  const { ataId } = await params;
  await expirarOportunidadesVencidas();

  const ata = await prisma.ata.findUnique({
    where: { id: ataId },
    include: { fornecedor: true, contrato: true },
  });
  if (!ata) notFound();
  if (ata.status !== "APROVADA" || !ata.contrato) redirect("/vendedor");

  const [ocupadas, meusPendentes, compativeis] = await Promise.all([
    prisma.oportunidadeVenda.findMany({
      where: { ataId, expiradaEm: null },
      select: { entidadeAlvoId: true },
    }),
    prisma.pedidoNegociacao.findMany({
      where: { ataId, vendedorId, status: "pendente" },
      select: { entidadeAlvoId: true },
    }),
    ata.categoria
      ? buscarMunicipiosCompativeis(ata.categoria)
      : Promise.resolve({ jaContrataram: [], nuncaContrataram: [] }),
  ]);
  const idsOcupados = new Set(ocupadas.map((o) => o.entidadeAlvoId));
  const idsAguardando = new Set(meusPendentes.map((p) => p.entidadeAlvoId));

  function situacao(id: string): MunicipioOpcao["situacao"] {
    if (idsOcupados.has(id)) return "em_negociacao";
    if (idsAguardando.has(id)) return "aguardando";
    return "livre";
  }

  const fortes: MunicipioOpcao[] = compativeis.jaContrataram.map((m) => ({
    id: m.id,
    nome: m.nome,
    uf: m.uf,
    situacao: situacao(m.id),
    detalhe: `última contratação ${m.ultimaContratacao.toLocaleDateString("pt-BR")}`,
  }));
  const especulativos: MunicipioOpcao[] = compativeis.nuncaContrataram.map((m) => ({
    id: m.id,
    nome: m.nome,
    uf: m.uf,
    situacao: situacao(m.id),
  }));

  return (
    <AppShell
      area="Vendedor"
      itens={NAV_VENDEDOR}
      rodape={
        <form action={logoutVendedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Pedir municípios — Ata {ata.numero}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {ata.fornecedor.razaoSocial} · {ata.objeto}
          </p>
        </div>
        <Link href="/vendedor" className="botao-atas link">
          ← Painel
        </Link>
      </div>

      <Secao titulo="Municípios">
        <p className="mb-4 text-xs" style={{ color: "var(--cor-texto-3)" }}>
          O administrador analisa cada pedido e libera os municípios. Depois de liberado, você tem 10 dias para avançar a
          negociação — cada movimento no Kanban renova o prazo; sem avanço, o município volta a ficar livre.
        </p>
        {!ata.categoria ? (
          <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Esta ata ainda não tem categoria definida, então não há municípios sugeridos. Fale com o administrador.
          </p>
        ) : (
          <FormularioSolicitar ataId={ata.id} fortes={fortes} especulativos={especulativos} />
        )}
      </Secao>
    </AppShell>
  );
}
