import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { ETAPAS_DO_CICLO, situacaoDoPrazo, textoDoPrazo } from "@/lib/ciclo-ata";
import { carregarAtaNoCiclo, carregarHistoriaDaAta } from "@/lib/ciclo-ata-db";
import { carregarFeriadosExtras } from "@/lib/feriados-db";
import { exigirPermissaoDe, permissoesDoAdmin } from "@/lib/permissoes-db";
import { temPermissao } from "@/lib/permissoes";
import { logoutAdmin } from "../../../actions";
import { NAV_ADMIN } from "../../../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Badge, type Tom } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";

export const dynamic = "force-dynamic";

const PERMISSOES_DO_CICLO = ["atas.captar", "atas.contrato", "atas.conformidade", "atas.aprovar", "atas.publicar"] as const;
const dataBr = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const dataHoraBr = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const TOM_DO_PRAZO: Record<"ok" | "hoje" | "atrasado", Tom> = { ok: "neutro", hoje: "atencao", atrasado: "critico" };

/**
 * Linha do tempo de uma ata no ciclo (2026-11-14): as 7 etapas com quem faz, o prazo em dias
 * úteis e a tela onde cada uma se resolve, mais o histórico do que o sistema registrou.
 */
export default async function CicloDaAtaPage({ params }: { params: Promise<{ ataId: string }> }) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, [...PERMISSOES_DO_CICLO]);
  const permissoes = (await permissoesDoAdmin(adminId)) ?? [];

  const { ataId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(ataId)) notFound();
  const [ata, historia, feriados] = await Promise.all([
    carregarAtaNoCiclo(ataId),
    carregarHistoriaDaAta(ataId),
    carregarFeriadosExtras(),
  ]);
  if (!ata) notFound();
  const agora = new Date();
  const { situacao } = ata;

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-4xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Ciclo da ata"
        titulo={`Ata ${ata.numero}`}
        descricao={`${ata.objeto} · ${ata.fornecedor}`}
        voltar={{ href: "/admin/ciclo", rotulo: "Ciclo das atas" }}
        acoes={
          <Badge tom={situacao.rejeitada ? "critico" : situacao.concluida ? "marca" : "neutro"}>
            {situacao.rejeitada ? "Rejeitada" : situacao.concluida ? "Liberada para a equipe de vendas" : "Em andamento"}
          </Badge>
        }
      />

      <Secao titulo="Etapas" descricao="A etapa atual é a primeira ainda não cumprida. O sistema descobre sozinho pelo que já foi cadastrado.">
        <ol className="lista-linhas">
          {ETAPAS_DO_CICLO.map((etapa) => {
            const s = situacao.etapas.find((e) => e.numero === etapa.numero)!;
            const prazo = s.atual && s.desde ? situacaoDoPrazo(etapa, s.desde, agora, feriados) : null;
            const podeAgir = s.atual && temPermissao(permissoes, etapa.permissao);
            return (
              <li key={etapa.numero} className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <i
                    aria-hidden="true"
                    className="kb-ponto mt-1.5"
                    style={{ background: s.feita ? "var(--cor-marca)" : s.atual ? "var(--cor-atencao)" : "var(--cor-borda-forte)" }}
                  />
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold tracking-[-0.01em]" style={{ color: s.feita || s.atual ? "var(--cor-texto)" : "var(--cor-texto-3)" }}>
                      {etapa.numero}. {etapa.titulo}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      {etapa.papel} · prazo de {etapa.prazoDiasUteis} dia(s) útil(eis)
                      {s.feita && " · feita"}
                      {s.atual && s.desde && ` · esperando desde ${dataBr(s.desde)}`}
                      {!s.feita && !s.atual && " · só abre depois da etapa anterior"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {prazo && <Badge tom={TOM_DO_PRAZO[prazo.tom]}>{textoDoPrazo(prazo)}</Badge>}
                  {podeAgir && (
                    <Link href={etapa.caminho(ata.id)} className="botao-atas">
                      {etapa.acao}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Secao>

      <Secao titulo="Histórico" descricao="O que o sistema registrou desta ata. Nem toda ação grava a ata como alvo, então é um retrato do que existe.">
        {historia.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Nenhum evento registrado.
          </p>
        ) : (
          <ul className="lista-linhas">
            {historia.map((e, i) => (
              <li key={`${e.em.toISOString()}-${i}`} className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-[13.5px]">{e.texto}</span>
                <span className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  {dataHoraBr(e.em)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
