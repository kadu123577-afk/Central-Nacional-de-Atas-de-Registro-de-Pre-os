import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { rotuloDaCategoria } from "@/lib/categorias";
import { percentualDeFracao } from "@/lib/formato";
import { carregarCartoes } from "@/lib/kanban-db";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { logoutVendedor } from "../../actions";
import { NAV_VENDEDOR } from "../../nav";
import { KanbanAta } from "@/components/kanban/kanban-ata";

export const dynamic = "force-dynamic";

/**
 * Kanban de uma ata (2026-10-01, redesenhado na fase 2 em 2026-10-04) —
 * "A Contatar → Em negociação → Aderiu/Recusou". Cada card é um município
 * liberado pro vendedor; o dossiê do município abre numa gaveta ao lado.
 * Os dados chegam aqui já montados (src/lib/kanban-db.ts → kanban-view.ts).
 */
export default async function KanbanAtaPage({ params }: { params: Promise<{ ataId: string }> }) {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) {
    redirect("/vendedor/login");
  }

  const { ataId } = await params;
  await expirarOportunidadesVencidas();
  const ata = await prisma.ata.findUnique({
    where: { id: ataId },
    include: { fornecedor: true, contrato: true },
  });
  if (!ata) notFound();

  // Só enxerga os municípios liberados pra ele (sigilo entre vendedores);
  // sem nenhum município ativo nesta ata, volta pro painel.
  const { cartoes } = await carregarCartoes({ ataId, vendedorId, expiradaEm: null });
  if (cartoes.length === 0) {
    redirect("/vendedor");
  }

  const percentualContrato = ata.contrato ? Number(ata.contrato.percentualComissao) : null;
  const tecnico = ata.fornecedor;
  const temContatoTecnico = tecnico.contatoTecnicoNome || tecnico.contatoTecnicoTelefone || tecnico.contatoTecnicoEmail;

  return (
    <AppShell
      area="Vendedor"
      itens={NAV_VENDEDOR}
      larguraMaxima="max-w-7xl"
      rodape={
        <form action={logoutVendedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Kanban da ata"
        voltar={{ href: "/vendedor", rotulo: "Painel" }}
        titulo={`Ata ${ata.numero} — ${ata.fornecedor.razaoSocial}`}
        descricao={
          <>
            {ata.objeto}
            {ata.categoria ? ` · ${rotuloDaCategoria(ata.categoria)}` : ""}
            {percentualContrato != null ? (
              <>
                {" · comissão pactuada "}
                <b className="numero font-semibold" style={{ color: "var(--cor-texto)" }}>
                  {percentualDeFracao(percentualContrato)}
                </b>
              </>
            ) : (
              ""
            )}
          </>
        }
        acoes={
          <Link href={`/vendedor/atas/${ataId}/solicitar`} className="botao-atas secundario">
            Pedir mais municípios
          </Link>
        }
      />

      {temContatoTecnico && (
        <div
          className="painel flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-3.5 text-[13px]"
          style={{ color: "var(--cor-texto-2)" }}
        >
          <span className="eyebrow">Contato técnico do fornecedor</span>
          {tecnico.contatoTecnicoNome && (
            <span className="font-semibold" style={{ color: "var(--cor-texto)" }}>
              {tecnico.contatoTecnicoNome}
            </span>
          )}
          {tecnico.contatoTecnicoTelefone && <span className="numero">{tecnico.contatoTecnicoTelefone}</span>}
          {tecnico.contatoTecnicoEmail && <span>{tecnico.contatoTecnicoEmail}</span>}
        </div>
      )}

      <KanbanAta cartoes={cartoes} />
    </AppShell>
  );
}
