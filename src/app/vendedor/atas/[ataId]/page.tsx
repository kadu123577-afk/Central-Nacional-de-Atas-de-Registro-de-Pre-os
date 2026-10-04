import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { COR_ESTAGIO_OPORTUNIDADE, ESTAGIOS_OPORTUNIDADE, ROTULO_ESTAGIO_OPORTUNIDADE } from "@/lib/oportunidades";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { logoutVendedor } from "../../actions";
import { NAV_VENDEDOR } from "../../nav";
import { CartaoOportunidade } from "./cartao-oportunidade";

export const dynamic = "force-dynamic";

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
    include: { entidadeAlvo: true },
    orderBy: { criadoEm: "asc" },
  });

  if (oportunidades.length === 0) {
    redirect("/vendedor");
  }

  const entidadeIds = oportunidades.map((o) => o.entidadeAlvoId);

  // Todos os contatos ativos (prefeito + secretários) — não só um
  // representante. É justamente o dado que deu mais trabalho levantar.
  const contatos = await prisma.pontoFocal.findMany({
    where: { entidadeAlvoId: { in: entidadeIds }, ativo: true },
    orderBy: { createdAt: "asc" },
  });
  const contatosPorEntidade = new Map<string, typeof contatos>();
  for (const c of contatos) {
    const lista = contatosPorEntidade.get(c.entidadeAlvoId) ?? [];
    lista.push(c);
    contatosPorEntidade.set(c.entidadeAlvoId, lista);
  }

  // Raio-X completo (todas as categorias já identificadas pro
  // município, não só a desta ata) — "as necessidades que esses
  // municípios podem ter", não só o sinal que trouxe ele pro Kanban.
  const historico = await prisma.historicoConsumoCategoria.findMany({
    where: { entidadeAlvoId: { in: entidadeIds } },
    orderBy: { ultimaContratacao: "desc" },
  });
  const necessidadesPorEntidade = new Map<string, typeof historico>();
  for (const h of historico) {
    const lista = necessidadesPorEntidade.get(h.entidadeAlvoId) ?? [];
    lista.push(h);
    necessidadesPorEntidade.set(h.entidadeAlvoId, lista);
  }

  const porEstagio = Object.fromEntries(
    ESTAGIOS_OPORTUNIDADE.map((e) => [e, oportunidades.filter((o) => o.estagio === e)]),
  ) as Record<string, typeof oportunidades>;

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Ata {ata.numero} — {ata.fornecedor.razaoSocial}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {ata.objeto}
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

      {(ata.fornecedor.contatoTecnicoNome ||
        ata.fornecedor.contatoTecnicoTelefone ||
        ata.fornecedor.contatoTecnicoEmail) && (
        <div
          className="painel flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs"
          style={{ color: "var(--cor-texto-2)" }}
        >
          <span className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
            Contato técnico do fornecedor
          </span>
          {ata.fornecedor.contatoTecnicoNome && <span>{ata.fornecedor.contatoTecnicoNome}</span>}
          {ata.fornecedor.contatoTecnicoTelefone && <span>{ata.fornecedor.contatoTecnicoTelefone}</span>}
          {ata.fornecedor.contatoTecnicoEmail && <span>{ata.fornecedor.contatoTecnicoEmail}</span>}
        </div>
      )}

      {oportunidades.length === 0 ? (
        <VazioComAcao
          titulo="Nenhum município com necessidade confirmada ainda"
          descricao="Nenhum dos municípios levantados mostrou ter contratado essa categoria antes. Veja a lista de oportunidades especulativas abaixo."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {ESTAGIOS_OPORTUNIDADE.map((estagio) => (
            <Secao
              key={estagio}
              titulo={`${ROTULO_ESTAGIO_OPORTUNIDADE[estagio]} (${porEstagio[estagio].length})`}
              acao={
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: COR_ESTAGIO_OPORTUNIDADE[estagio] }}
                />
              }
            >
              <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
                {porEstagio[estagio].map((o) => (
                  <CartaoOportunidade
                    key={o.id}
                    oportunidadeId={o.id}
                    nomeMunicipio={o.entidadeAlvo.nome}
                    uf={o.entidadeAlvo.uf}
                    estagioAtual={o.estagio}
                    corEstagio={COR_ESTAGIO_OPORTUNIDADE[estagio]}
                    observacoesAtuais={o.observacoes}
                    valorAderidoAtual={o.valorAderido ? o.valorAderido.toString() : null}
                    percentualComissaoAtual={o.percentualComissao ? o.percentualComissao.toString() : null}
                    prazoEm={o.prazoEm ? o.prazoEm.toISOString() : null}
                    percentualContrato={ata.contrato ? ata.contrato.percentualComissao.toString() : null}
                    contatos={(contatosPorEntidade.get(o.entidadeAlvoId) ?? []).map((c) => ({
                      cargo: c.cargo,
                      nomeContato: c.nomeContato,
                      telefone: c.telefone,
                      email: c.email,
                    }))}
                    necessidades={(necessidadesPorEntidade.get(o.entidadeAlvoId) ?? []).map((h) => ({
                      categoria: h.categoria,
                      ultimaContratacao: h.ultimaContratacao,
                    }))}
                  />
                ))}
              </ul>
            </Secao>
          ))}
        </div>
      )}

    </AppShell>
  );
}
