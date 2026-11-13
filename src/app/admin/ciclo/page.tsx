import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { ETAPAS_DO_CICLO, situacaoDoPrazo, textoDoPrazo, type EtapaDoCiclo } from "@/lib/ciclo-ata";
import { carregarAtasEmAndamento } from "@/lib/ciclo-ata-db";
import { carregarFeriadosExtras } from "@/lib/feriados-db";
import { exigirPermissaoDe, permissoesDoAdmin } from "@/lib/permissoes-db";
import { temPermissao } from "@/lib/permissoes";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Badge, type Tom } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";

export const dynamic = "force-dynamic";

const dataBr = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const TOM_DO_PRAZO: Record<"ok" | "hoje" | "atrasado", Tom> = { ok: "neutro", hoje: "atencao", atrasado: "critico" };

/**
 * Ciclo da ata (2026-11-14, passo 5 do plano do workflow): as atividades 1 a 7, da captação até
 * a ata liberada para a equipe de vendas. Cada ata aparece na etapa em que está esperando, com o
 * prazo em dias úteis. As etapas que a pessoa pode resolver vêm primeiro ("Na sua vez").
 */
export default async function CicloDasAtasPage() {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "visao.geral");
  const permissoes = (await permissoesDoAdmin(adminId)) ?? [];

  const [atas, feriados] = await Promise.all([carregarAtasEmAndamento(), carregarFeriadosExtras()]);
  const agora = new Date();

  const porEtapa = new Map<number, typeof atas>();
  for (const ata of atas) {
    if (ata.situacao.etapaAtual === null) continue; // rejeitada: fora do ciclo
    const lista = porEtapa.get(ata.situacao.etapaAtual) ?? [];
    lista.push(ata);
    porEtapa.set(ata.situacao.etapaAtual, lista);
  }

  const etapasComAtas = ETAPAS_DO_CICLO.filter((e) => (porEtapa.get(e.numero)?.length ?? 0) > 0);
  const naSuaVez = etapasComAtas.filter((e) => temPermissao(permissoes, e.permissao));
  const dosOutros = etapasComAtas.filter((e) => !temPermissao(permissoes, e.permissao));
  const totalNaSuaVez = naSuaVez.reduce((s, e) => s + (porEtapa.get(e.numero)?.length ?? 0), 0);

  function BlocoDaEtapa({ etapa, podeAgir }: { etapa: EtapaDoCiclo; podeAgir: boolean }) {
    const lista = porEtapa.get(etapa.numero) ?? [];
    return (
      <Secao
        key={etapa.numero}
        titulo={`${etapa.numero}. ${etapa.titulo} (${lista.length})`}
        descricao={`${etapa.papel} · prazo de ${etapa.prazoDiasUteis} dia(s) útil(eis) · ${etapa.acao}`}
        destaque={podeAgir}
      >
        <div className="moldura-tabela">
          <table className="tabela-atas min-w-[680px]">
            <thead>
              <tr>
                <th>Ata</th>
                <th>Fornecedor</th>
                <th>Esperando desde</th>
                <th>Prazo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => {
                const atual = a.situacao.etapas.find((e) => e.atual);
                const prazo = atual?.desde ? situacaoDoPrazo(etapa, atual.desde, agora, feriados) : null;
                return (
                  <tr key={a.id}>
                    <td className="align-top">
                      <span className="codigo">{a.numero}</span>
                      <span className="block max-w-[360px] truncate text-xs" style={{ color: "var(--cor-texto-3)" }} title={a.objeto}>
                        {a.objeto}
                      </span>
                    </td>
                    <td className="align-top">{a.fornecedor}</td>
                    <td className="align-top">{atual?.desde ? dataBr(atual.desde) : "—"}</td>
                    <td className="align-top">
                      {prazo && <Badge tom={TOM_DO_PRAZO[prazo.tom]}>{textoDoPrazo(prazo)}</Badge>}
                    </td>
                    <td className="align-top text-right whitespace-nowrap">
                      <Link href={`/admin/atas/${a.id}/ciclo`} className="botao-atas link">
                        Ver ciclo
                      </Link>
                      {podeAgir && (
                        <Link href={etapa.caminho(a.id)} className="botao-atas ml-2">
                          Abrir
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Secao>
    );
  }

  return (
    <AppShell
      area="Administrativo"
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
      <CabecalhoPagina
        rotulo="Captação e aprovação"
        titulo="Ciclo da"
        destaque="ata"
        descricao={
          atas.length === 0
            ? "Nenhuma ata esperando etapa."
            : `${atas.length} ata(s) em andamento · ${totalNaSuaVez} esperando uma etapa sua. Prazos em dias úteis, contados da etapa anterior (aproximado).`
        }
        voltar={{ href: "/admin", rotulo: "Minhas tarefas" }}
        acoes={
          temPermissao(permissoes, "atas.captar") ? (
            <Link href="/admin/atas/nova" className="botao-atas">
              Cadastrar ata
            </Link>
          ) : undefined
        }
      />

      {naSuaVez.length > 0 && <h2 className="eyebrow">Na sua vez</h2>}
      {naSuaVez.map((e) => (
        <BlocoDaEtapa key={e.numero} etapa={e} podeAgir />
      ))}

      {dosOutros.length > 0 && <h2 className="eyebrow">Com outras pessoas</h2>}
      {dosOutros.map((e) => (
        <BlocoDaEtapa key={e.numero} etapa={e} podeAgir={false} />
      ))}

      {etapasComAtas.length === 0 && (
        <Secao titulo="Tudo liberado">
          <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Nenhuma ata está esperando etapa. Quando uma ata nova for cadastrada, ela aparece aqui.
          </p>
        </Secao>
      )}
    </AppShell>
  );
}
