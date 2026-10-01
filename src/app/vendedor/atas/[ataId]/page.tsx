import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { ESTAGIOS_OPORTUNIDADE, ROTULO_ESTAGIO_OPORTUNIDADE } from "@/lib/oportunidades";
import { buscarMunicipiosCompativeis } from "@/lib/match-ata-municipio";
import { adicionarOportunidadeManual, logoutVendedor } from "../../actions";
import { CartaoOportunidade } from "./cartao-oportunidade";

export const dynamic = "force-dynamic";

const NAV_VENDEDOR = [{ rotulo: "Painel", href: "/vendedor" }];

/**
 * Kanban de uma ata reivindicada (2026-10-01) — "A Contatar → Em
 * negociação → Aderiu/Recusou", pedido explícito do usuário. Cada coluna
 * é um estágio de `OportunidadeVenda`; cada card é um município.
 */
export default async function KanbanAtaPage({ params }: { params: Promise<{ ataId: string }> }) {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) {
    redirect("/vendedor/login");
  }

  const { ataId } = await params;
  const ata = await prisma.ata.findUnique({
    where: { id: ataId },
    include: { fornecedor: true },
  });
  if (!ata) notFound();
  if (ata.vendedorId !== vendedorId) {
    redirect("/vendedor");
  }

  const oportunidades = await prisma.oportunidadeVenda.findMany({
    where: { ataId },
    include: { entidadeAlvo: true },
    orderBy: { criadoEm: "asc" },
  });

  const entidadeIds = oportunidades.map((o) => o.entidadeAlvoId);
  const contatos = await prisma.pontoFocal.findMany({
    where: { entidadeAlvoId: { in: entidadeIds }, ativo: true },
    orderBy: { createdAt: "asc" },
  });
  const contatoPorEntidade = new Map<string, (typeof contatos)[number]>();
  for (const c of contatos) {
    if (!contatoPorEntidade.has(c.entidadeAlvoId)) contatoPorEntidade.set(c.entidadeAlvoId, c);
  }

  const historicoPorEntidade = new Map<string, Date>();
  if (ata.categoria) {
    const historico = await prisma.historicoConsumoCategoria.findMany({
      where: { entidadeAlvoId: { in: entidadeIds }, categoria: ata.categoria },
    });
    for (const h of historico) historicoPorEntidade.set(h.entidadeAlvoId, h.ultimaContratacao);
  }

  const porEstagio = Object.fromEntries(
    ESTAGIOS_OPORTUNIDADE.map((e) => [e, oportunidades.filter((o) => o.estagio === e)]),
  ) as Record<string, typeof oportunidades>;

  // Lista especulativa (ver buscarMunicipiosCompativeis) menos quem já
  // está no Kanban — pra oferecer "adicionar" só de quem falta.
  const idsNoKanban = new Set(entidadeIds);
  const especulativos = ata.categoria
    ? (await buscarMunicipiosCompativeis(ata.categoria)).nuncaContrataram.filter((m) => !idsNoKanban.has(m.id))
    : [];

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
            Ata {ata.numero} — {ata.fornecedor.razaoSocial}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {ata.objeto}
          </p>
        </div>
        <Link href="/vendedor" className="botao-atas link">
          ← Painel
        </Link>
      </div>

      {oportunidades.length === 0 ? (
        <VazioComAcao
          titulo="Nenhum município com necessidade confirmada ainda"
          descricao="Nenhum dos municípios levantados mostrou ter contratado essa categoria antes. Veja a lista de oportunidades especulativas abaixo."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {ESTAGIOS_OPORTUNIDADE.map((estagio) => (
            <Secao key={estagio} titulo={`${ROTULO_ESTAGIO_OPORTUNIDADE[estagio]} (${porEstagio[estagio].length})`}>
              <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
                {porEstagio[estagio].map((o) => (
                  <CartaoOportunidade
                    key={o.id}
                    oportunidadeId={o.id}
                    nomeMunicipio={o.entidadeAlvo.nome}
                    uf={o.entidadeAlvo.uf}
                    estagioAtual={o.estagio}
                    observacoesAtuais={o.observacoes}
                    contatoPrincipal={contatoPorEntidade.get(o.entidadeAlvoId) ?? null}
                    sinalDeNecessidade={
                      historicoPorEntidade.has(o.entidadeAlvoId)
                        ? `Última contratação dessa categoria: ${historicoPorEntidade
                            .get(o.entidadeAlvoId)!
                            .toLocaleDateString("pt-BR")}`
                        : null
                    }
                  />
                ))}
              </ul>
            </Secao>
          ))}
        </div>
      )}

      {especulativos.length > 0 && (
        <Secao titulo={`Possíveis oportunidades (${especulativos.length}) — ainda não confirmadas`}>
          <p className="mb-3 text-xs" style={{ color: "var(--cor-texto-3)" }}>
            Raio-X rodou e não achou contratação dessa categoria — pode ser necessidade nova, ou o
            classificador não ter pego o contrato certo. Adicione ao Kanban só se quiser perseguir.
          </p>
          <ul className="flex flex-wrap gap-2">
            {especulativos.map((m) => (
              <li key={m.id}>
                <form action={adicionarOportunidadeManual.bind(null, ataId, m.id)}>
                  <button
                    type="submit"
                    className="eyebrow inline-flex items-center gap-1 rounded-full border px-2.5 py-1"
                    style={{ borderColor: "var(--cor-borda-forte)", color: "var(--cor-texto-2)" }}
                  >
                    + {m.nome}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </AppShell>
  );
}
