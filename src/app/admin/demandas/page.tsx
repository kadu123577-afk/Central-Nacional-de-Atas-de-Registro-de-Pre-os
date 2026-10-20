import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ROTULO_STATUS_DEMANDA,
  ROTULO_TIPO_DEMANDA,
  STATUS_DEMANDA,
  statusDemandaValido,
  type StatusDemanda,
  type TipoDemanda,
} from "@/lib/demandas";
import { atualizarDemanda, logoutAdmin } from "../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

function linkDoContato(contato: string): string {
  return contato.includes("@") ? `mailto:${contato}` : `tel:${contato.replace(/[^\d+]/g, "")}`;
}

export default async function DemandasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const { status } = await searchParams;
  const filtro: StatusDemanda | null = status && statusDemandaValido(status) ? status : null;

  const [demandas, contagens] = await Promise.all([
    prisma.demandaSemAta.findMany({
      where: filtro ? { status: filtro } : { status: { in: ["nova", "em_busca"] } },
      orderBy: { criadoEm: "desc" },
      take: 200,
    }),
    prisma.demandaSemAta.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const total = (s: string) => contagens.find((c) => c.status === s)?._count._all ?? 0;

  // Pedidos de adesão apontam para uma ata: só aqui, na área da equipe, aparece quem é o
  // fornecedor e o órgão gerenciador dela (o órgão que pediu não os vê).
  const idsDeAta = [...new Set(demandas.map((d) => d.ataId).filter((id): id is string => Boolean(id)))];
  const atas = idsDeAta.length
    ? await prisma.ata.findMany({
        where: { id: { in: idsDeAta } },
        select: {
          id: true,
          numero: true,
          objeto: true,
          fornecedor: { select: { razaoSocial: true } },
          orgaoGerenciador: { select: { nome: true, uf: true } },
        },
      })
    : [];
  const ataPorId = new Map(atas.map((a) => [a.id, a]));

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
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
          Demandas do site
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          Dois tipos de demanda vindas do site: <strong>pedido de adesão</strong> (órgão logado que quer aderir
          a uma ata; ele não vê os itens, então a equipe confere itens e saldo e monta o pedido) e <strong>não achei a ata</strong> (órgão que
          procura uma ata que não está no catálogo). Responda pelo contato informado.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filtrar por andamento">
        <Link href="/admin/demandas" className="botao-atas link" aria-current={!filtro ? "page" : undefined}>
          Em aberto ({total("nova") + total("em_busca")})
        </Link>
        {STATUS_DEMANDA.map((s) => (
          <Link
            key={s}
            href={`/admin/demandas?status=${s}`}
            className="botao-atas link"
            aria-current={filtro === s ? "page" : undefined}
          >
            {ROTULO_STATUS_DEMANDA[s]} ({total(s)})
          </Link>
        ))}
      </nav>

      <Secao titulo={`${filtro ? ROTULO_STATUS_DEMANDA[filtro] : "Em aberto"} (${demandas.length})`}>
        {demandas.length === 0 ? (
          <div className="mt-3">
            <VazioComAcao
              titulo="Nenhuma demanda aqui"
              descricao="Quando um órgão enviar o formulário do site, a demanda aparece nesta lista."
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {demandas.map((d) => (
              <li key={d.id} className="painel p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium" style={{ color: "var(--cor-texto)" }}>
                    {d.objeto}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge tom={d.tipo === "pedido_adesao" ? "marca" : "neutro"}>
                      {ROTULO_TIPO_DEMANDA[d.tipo as TipoDemanda] ?? d.tipo}
                    </Badge>
                    <Badge tom={d.status === "nova" ? "marca" : "neutro"}>
                      {ROTULO_STATUS_DEMANDA[d.status as StatusDemanda] ?? d.status}
                    </Badge>
                  </div>
                </div>
                {d.ataId && ataPorId.get(d.ataId) ? (
                  <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
                    Ata{" "}
                    <Link href={`/catalogo/${d.ataId}`} className="underline">
                      {ataPorId.get(d.ataId)!.numero}
                    </Link>{" "}
                    — {ataPorId.get(d.ataId)!.fornecedor.razaoSocial} · gerenciador:{" "}
                    {ataPorId.get(d.ataId)!.orgaoGerenciador.nome} ({ataPorId.get(d.ataId)!.orgaoGerenciador.uf})
                  </p>
                ) : null}
                <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
                  {d.orgao} · {d.nome}
                  {d.cargo ? ` (${d.cargo})` : ""} ·{" "}
                  <a href={linkDoContato(d.contato)} className="underline">
                    {d.contato}
                  </a>
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  {d.criadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  {d.uf ? ` · UF ${d.uf}` : ""}
                  {d.quantidade ? ` · Qtd: ${d.quantidade}` : ""}
                  {d.prazo ? ` · ${d.prazo}` : ""}
                </p>
                {d.observacoes ? (
                  <p className="mt-2 whitespace-pre-line text-sm" style={{ color: "var(--cor-texto-2)" }}>
                    {d.observacoes}
                  </p>
                ) : null}
                <form action={atualizarDemanda} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="demandaId" value={d.id} />
                  <label className="text-xs">
                    <span className="mb-1 block" style={{ color: "var(--cor-texto-3)" }}>
                      Andamento
                    </span>
                    <select name="status" defaultValue={d.status} className="campo-atas">
                      {STATUS_DEMANDA.map((s) => (
                        <option key={s} value={s}>
                          {ROTULO_STATUS_DEMANDA[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-48 flex-1 text-xs">
                    <span className="mb-1 block" style={{ color: "var(--cor-texto-3)" }}>
                      Nota interna
                    </span>
                    <input
                      name="notaInterna"
                      defaultValue={d.notaInterna ?? ""}
                      maxLength={2000}
                      className="campo-atas"
                      placeholder="Ex.: ata de GO tem saldo, enviei por e-mail"
                    />
                  </label>
                  <button type="submit" className="botao-atas secundario">
                    Salvar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
