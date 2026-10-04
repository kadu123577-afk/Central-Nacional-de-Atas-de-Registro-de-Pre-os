import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decidirPedidosNegociacao, logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { ROTULO_ESTAGIO_OPORTUNIDADE, estagioOportunidadeValido } from "@/lib/oportunidades";

export const dynamic = "force-dynamic";

/**
 * Fila de negociações (2026-10-04) — o vendedor pede municípios numa ata
 * aprovada; o gestor decide. Dois vendedores na mesma ata só em municípios
 * diferentes: se o município pedido já está com outro vendedor, aprovar
 * nega o pedido automaticamente.
 */
export default async function NegociacoesPage() {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  await expirarOportunidadesVencidas();

  const [pendentes, ativas] = await Promise.all([
    prisma.pedidoNegociacao.findMany({
      where: { status: "pendente" },
      include: { ata: { include: { fornecedor: true } }, vendedor: true, entidadeAlvo: true },
      orderBy: { criadoEm: "asc" },
    }),
    prisma.oportunidadeVenda.findMany({
      where: { expiradaEm: null },
      include: { ata: { include: { fornecedor: true } }, vendedor: true, entidadeAlvo: true },
      orderBy: { atualizadoEm: "desc" },
    }),
  ]);

  // Pedidos agrupados por ata e depois por vendedor.
  const porAta = new Map<string, { ata: (typeof pendentes)[number]["ata"]; porVendedor: Map<string, typeof pendentes> }>();
  for (const p of pendentes) {
    const grupo = porAta.get(p.ataId) ?? { ata: p.ata, porVendedor: new Map() };
    const lista = grupo.porVendedor.get(p.vendedorId) ?? [];
    lista.push(p);
    grupo.porVendedor.set(p.vendedorId, lista);
    porAta.set(p.ataId, grupo);
  }

  const ativasPorAta = new Map<string, typeof ativas>();
  for (const o of ativas) {
    const lista = ativasPorAta.get(o.ataId) ?? [];
    lista.push(o);
    ativasPorAta.set(o.ataId, lista);
  }

  const idsAtivosPorAta = (ataId: string) =>
    new Map((ativasPorAta.get(ataId) ?? []).map((o) => [o.entidadeAlvoId, o.vendedor.nome]));

  return (
    <AppShell
      area="Administração"
      itens={NAV_ADMIN}
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
        Negociações
      </h1>

      <Secao titulo={`Pedidos aguardando liberação (${pendentes.length})`}>
        {porAta.size === 0 ? (
          <VazioComAcao
            titulo="Nenhum pedido pendente"
            descricao="Quando um vendedor pedir municípios numa ata, o pedido aparece aqui."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {[...porAta.entries()].map(([ataId, { ata, porVendedor }]) => {
              const outros = idsAtivosPorAta(ataId);
              return (
                <li key={ataId} className="painel p-4">
                  <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                    Ata {ata.numero} — {ata.fornecedor.razaoSocial}
                  </p>
                  <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {ata.objeto}
                  </p>
                  {(ativasPorAta.get(ataId)?.length ?? 0) > 0 && (
                    <p className="mt-1 text-xs" style={{ color: "var(--cor-atencao)" }}>
                      Já em negociação nesta ata: {ativasPorAta.get(ataId)!.length} município(s) com{" "}
                      {new Set(ativasPorAta.get(ataId)!.map((o) => o.vendedor.nome)).size} vendedor(es).
                    </p>
                  )}

                  {[...porVendedor.entries()].map(([vendedorId, pedidos]) => (
                    <form
                      key={vendedorId}
                      action={decidirPedidosNegociacao}
                      className="mt-3 flex flex-col gap-2 border-t pt-3"
                      style={{ borderColor: "var(--cor-borda)" }}
                    >
                      <input type="hidden" name="ataId" value={ataId} />
                      <input type="hidden" name="vendedorId" value={vendedorId} />
                      <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                        Vendedor: <span style={{ color: "var(--cor-texto)" }}>{pedidos[0].vendedor.nome}</span>
                      </p>
                      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {pedidos.map((p) => {
                          const comOutro = outros.get(p.entidadeAlvoId);
                          return (
                            <li key={p.id}>
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
                                  {p.entidadeAlvo.uf ? `/${p.entidadeAlvo.uf}` : ""}
                                  {comOutro && (
                                    <span style={{ color: "var(--cor-critico)" }}> — já com {comOutro}</span>
                                  )}
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
                      <div className="flex gap-2">
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

      <Secao titulo={`Em negociação agora (${ativas.length})`}>
        {ativas.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--cor-texto-3)" }}>
            Nenhum município em negociação.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {ativas.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span style={{ color: "var(--cor-texto)" }}>
                  Ata {o.ata.numero} · {o.entidadeAlvo.nome}
                  {o.entidadeAlvo.uf ? `/${o.entidadeAlvo.uf}` : ""} · {o.vendedor.nome}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tom="neutro">
                    {estagioOportunidadeValido(o.estagio) ? ROTULO_ESTAGIO_OPORTUNIDADE[o.estagio] : o.estagio}
                  </Badge>
                  {o.prazoEm && (
                    <span className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      prazo {o.prazoEm.toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
