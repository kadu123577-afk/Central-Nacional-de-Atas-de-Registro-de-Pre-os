import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decidirPedidosNegociacao, logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { rotuloDaCategoria } from "@/lib/categorias";
import { escolherDecisorPrincipal } from "@/lib/decisores";
import { percentualDeFracao } from "@/lib/formato";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { ROTULO_ESTAGIO_OPORTUNIDADE, estagioOportunidadeValido } from "@/lib/oportunidades";
import { calcularUrgencia } from "@/lib/urgencia";

export const dynamic = "force-dynamic";

/** Teto da lista "em negociação agora" (a base antiga tem mais de mil). */
const LIMITE_ATIVAS = 100;
const ESTAGIOS_ABERTOS = ["a_contatar", "em_negociacao"];

/**
 * Fila de negociações (2026-10-04, redesenhada na fase 2 em 2026-10-05) — o
 * vendedor pede municípios numa ata aprovada; o gestor decide. Cada pedido
 * mostra o que ajuda a decidir: se o município já contratou a categoria da
 * ata e se há decisor com telefone ou e-mail. Dois vendedores na mesma ata só
 * em municípios diferentes: se o município pedido já está com outro vendedor,
 * aprovar nega o pedido automaticamente.
 */
export default async function NegociacoesPage() {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  await expirarOportunidadesVencidas();

  const abertas = { expiradaEm: null, estagio: { in: ESTAGIOS_ABERTOS } };
  const limiteCritico = new Date();
  limiteCritico.setDate(limiteCritico.getDate() + 3);

  const [pendentes, ativas, totalAtivas, vendedoresAbertos, vencendo] = await Promise.all([
    prisma.pedidoNegociacao.findMany({
      where: { status: "pendente" },
      include: {
        ata: { include: { fornecedor: true, contrato: true } },
        vendedor: true,
        entidadeAlvo: true,
      },
      orderBy: { criadoEm: "asc" },
    }),
    prisma.oportunidadeVenda.findMany({
      where: abertas,
      include: { ata: true, vendedor: true, entidadeAlvo: true },
      orderBy: [{ prazoEm: { sort: "asc", nulls: "last" } }, { atualizadoEm: "desc" }],
      take: LIMITE_ATIVAS,
    }),
    prisma.oportunidadeVenda.count({ where: abertas }),
    prisma.oportunidadeVenda.groupBy({ by: ["vendedorId"], where: abertas }),
    prisma.oportunidadeVenda.count({ where: { ...abertas, prazoEm: { lte: limiteCritico } } }),
  ]);

  // Municípios já ocupados (qualquer estágio: quem aderiu também bloqueia) nas atas
  // com pedido pendente — consulta própria pra não depender do teto da lista abaixo.
  const ataIdsPedidos = [...new Set(pendentes.map((p) => p.ataId))];
  const ocupadas = ataIdsPedidos.length
    ? await prisma.oportunidadeVenda.findMany({
        where: { expiradaEm: null, ataId: { in: ataIdsPedidos } },
        select: { ataId: true, entidadeAlvoId: true, vendedorId: true, vendedor: { select: { nome: true } } },
      })
    : [];

  // Contexto pra decidir: o município já contratou a categoria da ata? Tem
  // decisor com canal? (consultas em lote só pros municípios pedidos)
  const entidadesPedidas = [...new Set(pendentes.map((p) => p.entidadeAlvoId))];
  const categoriasPedidas = [...new Set(pendentes.map((p) => p.ata.categoria).filter((c): c is string => !!c))];
  const [historico, contatos] = entidadesPedidas.length
    ? await Promise.all([
        categoriasPedidas.length
          ? prisma.historicoConsumoCategoria.findMany({
              where: { entidadeAlvoId: { in: entidadesPedidas }, categoria: { in: categoriasPedidas } },
              select: { entidadeAlvoId: true, categoria: true },
            })
          : Promise.resolve([]),
        prisma.pontoFocal.findMany({
          where: { entidadeAlvoId: { in: entidadesPedidas }, ativo: true, contatoErradoEm: null },
          select: { entidadeAlvoId: true, cargo: true, telefone: true, email: true },
        }),
      ])
    : [[], []];
  const jaContratou = new Set(historico.map((h) => `${h.entidadeAlvoId}|${h.categoria}`));
  const contatosPorEntidade = new Map<string, typeof contatos>();
  for (const c of contatos) {
    const lista = contatosPorEntidade.get(c.entidadeAlvoId) ?? [];
    lista.push(c);
    contatosPorEntidade.set(c.entidadeAlvoId, lista);
  }

  // Pedidos agrupados por ata e depois por vendedor.
  const porAta = new Map<string, { ata: (typeof pendentes)[number]["ata"]; porVendedor: Map<string, typeof pendentes> }>();
  for (const p of pendentes) {
    const grupo = porAta.get(p.ataId) ?? { ata: p.ata, porVendedor: new Map() };
    const lista = grupo.porVendedor.get(p.vendedorId) ?? [];
    lista.push(p);
    grupo.porVendedor.set(p.vendedorId, lista);
    porAta.set(p.ataId, grupo);
  }

  const ocupadasPorAta = new Map<string, typeof ocupadas>();
  for (const o of ocupadas) {
    const lista = ocupadasPorAta.get(o.ataId) ?? [];
    lista.push(o);
    ocupadasPorAta.set(o.ataId, lista);
  }
  const comQuemEstaMunicipio = (ataId: string) =>
    new Map((ocupadasPorAta.get(ataId) ?? []).map((o) => [o.entidadeAlvoId, o.vendedor.nome]));

  return (
    <AppShell
      area="Administração"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-6xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <div>
        <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
          Negociações
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Libere ou negue os municípios que os vendedores pediram. Cada município liberado tem 10 dias para avançar.
        </p>
      </div>

      <div className="kb-kpis">
        <div className="kb-kpi">
          <p className="eyebrow">Pedidos aguardando</p>
          <p className="kb-kpi-valor numero" style={{ color: pendentes.length > 0 ? "var(--cor-atencao)" : undefined }}>
            {pendentes.length}
          </p>
          <p className="kb-kpi-nota">em {porAta.size} ata(s)</p>
        </div>
        <div className="kb-kpi">
          <p className="eyebrow">Municípios em aberto</p>
          <p className="kb-kpi-valor numero">{totalAtivas}</p>
          <p className="kb-kpi-nota">com {vendedoresAbertos.length} vendedor(es)</p>
        </div>
        <div className="kb-kpi">
          <p className="eyebrow">Prazos vencendo</p>
          <p className="kb-kpi-valor numero" style={{ color: vencendo > 0 ? "var(--cor-critico)" : undefined }}>
            {vencendo}
          </p>
          <p className="kb-kpi-nota">expiram em até 3 dias</p>
        </div>
      </div>

      <Secao titulo={`Pedidos aguardando liberação (${pendentes.length})`}>
        {porAta.size === 0 ? (
          <VazioComAcao
            titulo="Nenhum pedido pendente"
            descricao="Quando um vendedor pedir municípios numa ata, o pedido aparece aqui."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {[...porAta.entries()].map(([ataId, { ata, porVendedor }]) => {
              const ocupados = comQuemEstaMunicipio(ataId);
              const jaAtivos = ocupadasPorAta.get(ataId) ?? [];
              return (
                <li key={ataId} className="painel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                        Ata {ata.numero} — {ata.fornecedor.razaoSocial}
                      </p>
                      <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {ata.objeto}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {ata.categoria && <Badge tom="neutro">{rotuloDaCategoria(ata.categoria)}</Badge>}
                      {ata.contrato && (
                        <Badge tom="marca">Comissão {percentualDeFracao(Number(ata.contrato.percentualComissao))}</Badge>
                      )}
                      {jaAtivos.length > 0 && (
                        <Badge tom="atencao">
                          {jaAtivos.length} município(s) já com {new Set(jaAtivos.map((o) => o.vendedorId)).size} vendedor(es)
                        </Badge>
                      )}
                    </div>
                  </div>

                  {[...porVendedor.entries()].map(([vendedorId, pedidos]) => (
                    <form
                      key={vendedorId}
                      action={decidirPedidosNegociacao}
                      className="mt-3 flex flex-col gap-3 border-t pt-3"
                      style={{ borderColor: "var(--cor-borda)" }}
                    >
                      <input type="hidden" name="ataId" value={ataId} />
                      <input type="hidden" name="vendedorId" value={vendedorId} />
                      <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                        Vendedor: <span style={{ color: "var(--cor-texto)" }}>{pedidos[0].vendedor.nome}</span>{" "}
                        <span style={{ color: "var(--cor-texto-3)" }}>— {pedidos.length} município(s)</span>
                      </p>
                      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {pedidos.map((p) => {
                          const comOutro = ocupados.get(p.entidadeAlvoId);
                          const casa = Boolean(ata.categoria && jaContratou.has(`${p.entidadeAlvoId}|${ata.categoria}`));
                          const { semCanal } = escolherDecisorPrincipal(
                            contatosPorEntidade.get(p.entidadeAlvoId) ?? [],
                            ata.categoria,
                          );
                          return (
                            <li
                              key={p.id}
                              className="rounded-[var(--raio)] border p-2"
                              style={{ borderColor: comOutro ? "var(--cor-critico)" : "var(--cor-borda)" }}
                            >
                              <label className="flex items-start gap-2 text-sm" style={{ color: "var(--cor-texto)" }}>
                                <input
                                  type="checkbox"
                                  name="pedidoId"
                                  value={p.id}
                                  defaultChecked={!comOutro}
                                  className="mt-1"
                                />
                                <span>
                                  {p.entidadeAlvo.nome}
                                  {p.entidadeAlvo.uf ? ` / ${p.entidadeAlvo.uf}` : ""}
                                  <span className="mt-1 flex flex-wrap gap-1.5">
                                    {comOutro && <Badge tom="critico">já com {comOutro}</Badge>}
                                    <Badge tom={casa ? "marca" : "neutro"}>
                                      {casa ? "Já contratou a categoria" : "Sem histórico da categoria"}
                                    </Badge>
                                    {semCanal && <Badge tom="atencao">Sem decisor com contato</Badge>}
                                  </span>
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      <input
                        name="motivo"
                        placeholder="Motivo (opcional, aparece pro vendedor se negar)"
                        className="campo-atas"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" name="decisao" value="aprovar" className="botao-atas">
                          Liberar selecionados
                        </button>
                        <button type="submit" name="decisao" value="negar" className="botao-atas critico">
                          Negar selecionados
                        </button>
                      </div>
                    </form>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      <Secao
        titulo={`Em aberto agora (${totalAtivas})`}
        acao={
          <Link href="/admin/pipeline" className="botao-atas secundario">
            Abrir pipeline
          </Link>
        }
      >
        {ativas.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--cor-texto-3)" }}>
            Nenhum município em negociação.
          </p>
        ) : (
          <div className="overflow-x-auto">
            {totalAtivas > ativas.length && (
              <p className="mb-2 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                Mostrando os {ativas.length} com prazo mais curto de {totalAtivas}.
              </p>
            )}
            <table className="tabela-atas">
              <thead>
                <tr>
                  <th>Município</th>
                  <th>Ata</th>
                  <th>Vendedor</th>
                  <th>Estágio</th>
                  <th>Prazo</th>
                </tr>
              </thead>
              <tbody>
                {ativas.map((o) => {
                  const aberto = ["a_contatar", "em_negociacao"].includes(o.estagio);
                  const urgencia = calcularUrgencia(o.prazoEm);
                  return (
                    <tr key={o.id}>
                      <td>
                        {o.entidadeAlvo.nome}
                        {o.entidadeAlvo.uf ? ` / ${o.entidadeAlvo.uf}` : ""}
                      </td>
                      <td>{o.ata.numero}</td>
                      <td>{o.vendedor.nome}</td>
                      <td>
                        {estagioOportunidadeValido(o.estagio) ? ROTULO_ESTAGIO_OPORTUNIDADE[o.estagio] : o.estagio}
                      </td>
                      <td>
                        {aberto ? (
                          <Badge
                            tom={urgencia.nivel === "critico" ? "critico" : urgencia.nivel === "atencao" ? "atencao" : "neutro"}
                          >
                            {urgencia.rotulo}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </AppShell>
  );
}
