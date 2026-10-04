import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { rotuloDaCategoria } from "@/lib/categorias";
import { percentualDeFracao } from "@/lib/formato";
import { montarCartao } from "@/lib/kanban-view";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { logoutVendedor } from "../../actions";
import { NAV_VENDEDOR } from "../../nav";
import { KanbanAta } from "./kanban-ata";

export const dynamic = "force-dynamic";

/**
 * Kanban de uma ata (2026-10-01, redesenhado na fase 2 em 2026-10-04) —
 * "A Contatar → Em negociação → Aderiu/Recusou". Cada card é um município
 * liberado pro vendedor; o dossiê do município abre numa gaveta ao lado.
 * Os dados chegam aqui já montados (src/lib/kanban-view.ts).
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
  const oportunidades = await prisma.oportunidadeVenda.findMany({
    where: { ataId, vendedorId, expiradaEm: null },
    include: { entidadeAlvo: true, liquidacoes: true },
    orderBy: { criadoEm: "asc" },
  });
  if (oportunidades.length === 0) {
    redirect("/vendedor");
  }

  const entidadeIds = oportunidades.map((o) => o.entidadeAlvoId);

  // Todos os contatos ativos (prefeito + secretários) — é justamente o dado
  // que deu mais trabalho levantar.
  const contatos = await prisma.pontoFocal.findMany({
    where: { entidadeAlvoId: { in: entidadeIds }, ativo: true },
    orderBy: { createdAt: "asc" },
  });
  const interacoes = contatos.length
    ? await prisma.interacaoPontoFocal.findMany({
        where: { pontoFocalId: { in: contatos.map((c) => c.id) } },
        orderBy: { criadoEm: "desc" },
        take: 400,
      })
    : [];
  const contatoPorId = new Map(contatos.map((c) => [c.id, c]));

  // Raio-X completo (todas as categorias já identificadas pro município,
  // não só a desta ata).
  const historico = await prisma.historicoConsumoCategoria.findMany({
    where: { entidadeAlvoId: { in: entidadeIds } },
    orderBy: { ultimaContratacao: "desc" },
  });

  const percentualContrato = ata.contrato ? Number(ata.contrato.percentualComissao) : null;

  const cartoes = oportunidades.map((o) =>
    montarCartao(
      {
        id: o.id,
        entidadeAlvoId: o.entidadeAlvoId,
        nomeMunicipio: o.entidadeAlvo.nome,
        uf: o.entidadeAlvo.uf,
        estagio: o.estagio,
        observacoes: o.observacoes,
        prazoEm: o.prazoEm,
        proximoContatoEm: o.proximoContatoEm,
        valorAderido: o.valorAderido ? Number(o.valorAderido) : null,
        percentualComissao: o.percentualComissao ? Number(o.percentualComissao) : null,
        contatos: contatos
          .filter((c) => c.entidadeAlvoId === o.entidadeAlvoId)
          .map((c) => ({
            id: c.id,
            cargo: c.cargo,
            area: c.area,
            nomeContato: c.nomeContato,
            telefone: c.telefone,
            email: c.email,
            particularidades: c.particularidades,
            updatedAt: c.updatedAt,
          })),
        necessidades: historico
          .filter((h) => h.entidadeAlvoId === o.entidadeAlvoId)
          .map((h) => ({
            categoria: h.categoria,
            ultimaContratacao: h.ultimaContratacao,
            valor: Number(h.valorUltimaContratacao),
            quantidadeContratos: h.quantidadeContratosNaJanela,
            objeto: h.objetoUltimaContratacao,
          })),
        interacoes: interacoes
          .filter((i) => contatoPorId.get(i.pontoFocalId)?.entidadeAlvoId === o.entidadeAlvoId)
          .map((i) => {
            const contato = contatoPorId.get(i.pontoFocalId);
            return {
              id: i.id,
              criadoEm: i.criadoEm,
              resultado: i.resultado,
              observacao: i.observacao,
              contatoNome: contato?.nomeContato ?? "",
              contatoCargo: contato?.cargo ?? "",
            };
          }),
        liquidacoes: o.liquidacoes.map((l) => ({
          valorLiquidado: Number(l.valorLiquidado),
          statusCobranca: l.statusCobranca,
        })),
      },
      { categoriaAta: ata.categoria, percentualContrato },
    ),
  );

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Ata {ata.numero} — {ata.fornecedor.razaoSocial}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {ata.objeto}
            {ata.categoria ? ` · ${rotuloDaCategoria(ata.categoria)}` : ""}
            {percentualContrato != null ? ` · comissão pactuada ${percentualDeFracao(percentualContrato)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/vendedor/atas/${ataId}/solicitar`} className="botao-atas secundario">
            Pedir mais municípios
          </Link>
          <Link href="/vendedor" className="botao-atas link">
            ← Painel
          </Link>
        </div>
      </div>

      {temContatoTecnico && (
        <div
          className="painel flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs"
          style={{ color: "var(--cor-texto-2)" }}
        >
          <span className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
            Contato técnico do fornecedor
          </span>
          {tecnico.contatoTecnicoNome && <span>{tecnico.contatoTecnicoNome}</span>}
          {tecnico.contatoTecnicoTelefone && <span>{tecnico.contatoTecnicoTelefone}</span>}
          {tecnico.contatoTecnicoEmail && <span>{tecnico.contatoTecnicoEmail}</span>}
        </div>
      )}

      <KanbanAta cartoes={cartoes} categoriaAta={ata.categoria} />
    </AppShell>
  );
}
