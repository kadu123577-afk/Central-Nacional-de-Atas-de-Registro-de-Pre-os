import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ROTULO_STATUS_DEMANDA,
  STATUS_DEMANDA,
  statusDemandaValido,
  type StatusDemanda,
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
          Órgãos que não acharam a ata que precisam, pelo formulário &quot;Não achei a ata&quot; do site. Procure uma
          ata compatível e responda pelo contato informado.
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
                  <Badge tom={d.status === "nova" ? "marca" : "neutro"}>
                    {ROTULO_STATUS_DEMANDA[d.status as StatusDemanda] ?? d.status}
                  </Badge>
                </div>
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
