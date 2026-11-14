import Link from "next/link";
import { redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { KpisVendedor, TarefasHoje } from "@/components/vendedor/painel-resumo";
import { carregarPainelVendedor } from "@/lib/painel-vendedor-db";
import { corDaCategoria, rotuloDaCategoria } from "@/lib/categorias";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { ESTAGIOS_COM_PRAZO } from "@/lib/negociacao";
import { situacaoDoVencimento, textoDoPrazo } from "@/lib/ciclo-ata";
import { carregarFeriadosExtras } from "@/lib/feriados-db";
import { diaDaReserva, reservaDaAta } from "@/lib/reserva-ata";
import { logoutVendedor } from "./actions";
import { NAV_VENDEDOR } from "./nav";

export const dynamic = "force-dynamic";

const DIAS_MOSTRAR_NEGADOS = 10;

/** Categoria da ata como na tabela do site: ponto na cor do tema + rótulo. */
function CategoriaDaAta({ categoria }: { categoria: string | null }) {
  if (!categoria) return <span style={{ color: "var(--cor-texto-3)" }}>—</span>;
  return (
    <span className="inline-flex items-start gap-2 text-[12.5px]">
      <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full" style={{ background: corDaCategoria(categoria) }} />
      {rotuloDaCategoria(categoria)}
    </span>
  );
}

/**
 * Painel de fluxo do vendedor (2026-10-01, revisto em 14/11/2026) — as atas em que já tenho
 * municípios liberados (levam pro Kanban, com o meu prazo), as atas disponíveis e as atas
 * reservadas. Qualquer consultor pode pedir qualquer ata disponível; enquanto um consultor negocia
 * nela, a ata fica suspensa para os outros (reservada até o prazo dele) e volta a ficar disponível
 * quando a negociação termina ou o prazo vence sem avanço.
 */
export default async function PainelVendedorPage() {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) {
    redirect("/vendedor/login");
  }

  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId } });
  if (!vendedor) {
    redirect("/vendedor/login");
  }

  await expirarOportunidadesVencidas();

  const limiteNegados = new Date();
  limiteNegados.setDate(limiteNegados.getDate() - DIAS_MOSTRAR_NEGADOS);

  const [painel, minhasAtas, disponiveis, pedidosPendentes, pedidosNegados, feriados] = await Promise.all([
    carregarPainelVendedor(vendedorId),
    prisma.ata.findMany({
      where: { oportunidades: { some: { vendedorId, expiradaEm: null } } },
      include: {
        fornecedor: true,
        orgaoGerenciador: true,
        oportunidades: { where: { vendedorId, expiradaEm: null } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Portão: só ata liberada (conformidade concluída) E com contrato de intermediação.
    prisma.ata.findMany({
      where: {
        status: "APROVADA",
        contrato: { isNot: null },
        oportunidades: { none: { vendedorId, expiradaEm: null } },
      },
      include: {
        fornecedor: true,
        orgaoGerenciador: true,
        // Como a ata exclui as minhas, todas estas oportunidades são de outros consultores.
        oportunidades: {
          where: { expiradaEm: null },
          select: { vendedorId: true, estagio: true, expiradaEm: true, prazoEm: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pedidoNegociacao.findMany({
      where: { vendedorId, status: "pendente" },
      include: { ata: true, entidadeAlvo: true },
      orderBy: { criadoEm: "desc" },
    }),
    prisma.pedidoNegociacao.findMany({
      where: { vendedorId, status: "negado", decididoEm: { gte: limiteNegados } },
      include: { ata: true, entidadeAlvo: true },
      orderBy: { decididoEm: "desc" },
    }),
    carregarFeriadosExtras(),
  ]);

  // Atas reservadas por outro consultor ficam fora dos pedidos, com a data em que podem voltar.
  const agora = new Date();
  const analisadas = disponiveis.map((ata) => ({ ata, reserva: reservaDaAta(ata.oportunidades, vendedorId, agora) }));
  const livres = analisadas.filter((a) => a.reserva === null).map((a) => a.ata);
  const reservadas = analisadas.flatMap((a) => (a.reserva ? [{ ata: a.ata, reserva: a.reserva }] : []));

  /** O prazo que mais cedo vence entre os municípios que tenho na ata (o que eu seguro por mais tempo é o último). */
  function prazoDaMinhaAta(oportunidades: { estagio: string; prazoEm: Date | null }[]) {
    const prazos = oportunidades
      .filter((o) => (ESTAGIOS_COM_PRAZO as readonly string[]).includes(o.estagio) && o.prazoEm)
      .map((o) => o.prazoEm as Date);
    if (prazos.length === 0) return null;
    const vencimento = new Date(Math.min(...prazos.map((p) => p.getTime())));
    return { vencimento, situacao: situacaoDoVencimento(vencimento, agora, feriados) };
  }

  return (
    <AppShell
      area={`Vendedor — ${vendedor.nome}`}
      itens={NAV_VENDEDOR}
      larguraMaxima="max-w-6xl"
      rodape={
        <form action={logoutVendedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Atas"
        titulo="Painel"
        destaque="do vendedor"
        descricao="As atas em que você já tem municípios liberados, com o seu prazo, e as atas disponíveis para pedir municípios."
      />

      <KpisVendedor kpis={painel.kpis} />
      {painel.tarefas.length > 0 && <TarefasHoje tarefas={painel.tarefas} />}

      <Secao
        titulo={`Minhas atas ${minhasAtas.length > 0 ? `(${minhasAtas.length})` : ""}`}
        descricao="Atas em que você já tem municípios liberados. Enquanto você negocia, ninguém mais pega a ata; o prazo é renovado a cada movimento no Kanban e, sem avanço, a ata volta a ficar disponível."
        destaque
      >
        {minhasAtas.length === 0 ? (
          <VazioComAcao
            titulo="Você ainda não tem municípios liberados"
            descricao="Escolha uma ata disponível abaixo e peça os municípios em que quer negociar. O administrador libera."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[700px]">
              <thead>
                <tr>
                  <th className="w-[1%]">Nº</th>
                  <th>Objeto da ata</th>
                  <th className="w-[170px]">Categoria</th>
                  <th className="w-[170px]">Adesões</th>
                  <th className="w-[190px]">Meu prazo</th>
                  <th className="w-[1%]" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {minhasAtas.map((ata) => {
                  const total = ata.oportunidades.length;
                  const aderiu = ata.oportunidades.filter((o) => o.estagio === "aderiu").length;
                  const prazo = prazoDaMinhaAta(ata.oportunidades);
                  return (
                    <tr key={ata.id}>
                      <td className="codigo whitespace-nowrap text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        Nº {ata.numero}
                      </td>
                      <td>
                        <Link
                          href={`/vendedor/atas/${ata.id}`}
                          className="titulo-linha block hover:text-[var(--cor-marca-clara)]"
                        >
                          {ata.objeto}
                        </Link>
                        <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                          {ata.fornecedor.razaoSocial}
                        </span>
                      </td>
                      <td>
                        <CategoriaDaAta categoria={ata.categoria} />
                      </td>
                      <td>
                        <Badge tom="marca">
                          {aderiu}/{total} aderiram
                        </Badge>
                        <div className="barra-saldo mt-2">
                          <div style={{ width: total > 0 ? `${(aderiu / total) * 100}%` : "0%" }} />
                        </div>
                      </td>
                      <td>
                        {prazo ? (
                          <>
                            <Badge tom={prazo.situacao.tom === "atrasado" ? "critico" : prazo.situacao.tom === "hoje" ? "alerta" : "neutro"}>
                              até {diaDaReserva(prazo.vencimento)}
                            </Badge>
                            <span className="mt-1 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                              {textoDoPrazo(prazo.situacao)}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                            sem prazo (negociação encerrada)
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <Link href={`/vendedor/atas/${ata.id}`} className="botao-atas link">
                          Abrir Kanban →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {(pedidosPendentes.length > 0 || pedidosNegados.length > 0) && (
        <Secao titulo="Meus pedidos de negociação">
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[560px]">
              <thead>
                <tr>
                  <th className="w-[1%]">Ata</th>
                  <th>Município</th>
                  <th className="w-[1%]">Situação</th>
                </tr>
              </thead>
              <tbody>
                {pedidosPendentes.map((p) => (
                  <tr key={p.id}>
                    <td className="codigo whitespace-nowrap text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      Ata {p.ata.numero}
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <span className="titulo-linha">{p.entidadeAlvo.nome}</span>
                        {p.entidadeAlvo.uf && <span className="selo-uf">{p.entidadeAlvo.uf}</span>}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      <Badge tom="neutro">Aguardando liberação</Badge>
                    </td>
                  </tr>
                ))}
                {pedidosNegados.map((p) => (
                  <tr key={p.id}>
                    <td className="codigo whitespace-nowrap text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      Ata {p.ata.numero}
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <span className="titulo-linha">{p.entidadeAlvo.nome}</span>
                        {p.entidadeAlvo.uf && <span className="selo-uf">{p.entidadeAlvo.uf}</span>}
                      </span>
                      {p.motivo && (
                        <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                          {p.motivo}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <Badge tom="critico">Negado</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      <Secao
        titulo={`Atas disponíveis ${livres.length > 0 ? `(${livres.length})` : ""}`}
        descricao="Atas com contrato de intermediação e conformidade concluída. Peça os municípios em que quer negociar; o administrador libera."
      >
        {livres.length === 0 ? (
          <VazioComAcao
            titulo="Nenhuma ata disponível no momento"
            descricao="Só aparecem atas com contrato de intermediação cadastrado e conformidade concluída."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[880px]">
              <thead>
                <tr>
                  <th className="w-[1%]">Nº</th>
                  <th>Objeto da ata</th>
                  <th className="w-[220px]">Órgão gerenciador</th>
                  <th className="w-[160px]">Categoria</th>
                  <th className="w-[1%]" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {livres.map((ata) => (
                  <tr key={ata.id}>
                    <td className="codigo whitespace-nowrap text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      Nº {ata.numero}
                    </td>
                    <td>
                      <span className="titulo-linha block">{ata.objeto}</span>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {ata.fornecedor.razaoSocial}
                      </span>
                    </td>
                    <td>
                      <span className="block text-[13px]" style={{ color: "var(--cor-texto)" }}>
                        {ata.orgaoGerenciador.nome}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {ata.orgaoGerenciador.municipio}
                        <span className="selo-uf">{ata.orgaoGerenciador.uf}</span>
                      </span>
                    </td>
                    <td>
                      <CategoriaDaAta categoria={ata.categoria} />
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <Link href={`/vendedor/atas/${ata.id}/solicitar`} className="botao-atas">
                          Pedir municípios
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {reservadas.length > 0 && (
        <Secao
          titulo={`Reservadas por outro consultor (${reservadas.length})`}
          descricao="Ficam suspensas enquanto outro consultor negocia nelas. Voltam a ficar disponíveis quando a negociação termina ou o prazo vence sem avanço."
        >
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[700px]">
              <thead>
                <tr>
                  <th className="w-[1%]">Nº</th>
                  <th>Objeto da ata</th>
                  <th className="w-[170px]">Categoria</th>
                  <th className="w-[200px]">Pode voltar a ficar disponível</th>
                </tr>
              </thead>
              <tbody>
                {reservadas.map(({ ata, reserva }) => (
                  <tr key={ata.id}>
                    <td className="codigo whitespace-nowrap text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      Nº {ata.numero}
                    </td>
                    <td>
                      <span className="titulo-linha block">{ata.objeto}</span>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {ata.fornecedor.razaoSocial}
                      </span>
                    </td>
                    <td>
                      <CategoriaDaAta categoria={ata.categoria} />
                    </td>
                    <td>
                      <Badge tom="atencao">{`a partir de ${diaDaReserva(reserva.ate)}`}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}
    </AppShell>
  );
}
