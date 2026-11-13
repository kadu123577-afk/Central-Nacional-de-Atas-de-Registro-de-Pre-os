import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { ETAPAS_DA_ADESAO, caminhoDaEtapaDaAdesao, situacaoDoPrazoDaAdesao } from "@/lib/ciclo-adesao";
import { carregarQuadroDaAdesao, type LinhaDoQuadroDaAdesao } from "@/lib/ciclo-adesao-db";
import { textoDoPrazo } from "@/lib/ciclo-ata";
import { exigirPermissaoDe, permissoesDoAdmin } from "@/lib/permissoes-db";
import { temAlguma, temPermissao } from "@/lib/permissoes";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Badge, type Tom } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Secao } from "@/components/ui/secao";

export const dynamic = "force-dynamic";

const PERMISSOES_DO_CICLO_DA_ADESAO = [
  "municipios.liberar",
  "adesao.instruir",
  "adesao.declarar",
  "adesao.registrar",
  "adesao.acompanhar",
  "comissao.cobrar",
] as const;
const PERMISSOES_DA_TELA_DE_ADESOES = ["adesao.instruir", "adesao.declarar", "adesao.registrar"] as const;

/** Quantas linhas cada etapa mostra (a de "a contatar" é enorme e mostra menos). */
const LINHAS_POR_ETAPA = 25;
const LINHAS_DA_ETAPA_10 = 15;

const dataBr = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const TOM_DO_PRAZO: Record<"ok" | "hoje" | "atrasado", Tom> = { ok: "neutro", hoje: "atencao", atrasado: "critico" };

/**
 * Ciclo da adesão (2026-11-14): as atividades 8 a 17 do workflow, do pedido do município até o
 * pós-venda. Cada município aparece na etapa em que espera, com o prazo em dias úteis. As etapas
 * que a pessoa pode resolver vêm primeiro ("Na sua vez"); as de vendas, do órgão e do fornecedor
 * ela só acompanha.
 */
export default async function CicloDaAdesaoPage() {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, [...PERMISSOES_DO_CICLO_DA_ADESAO]);
  const permissoes = (await permissoesDoAdmin(adminId)) ?? [];
  const veTelaDeAdesoes = temAlguma(permissoes, PERMISSOES_DA_TELA_DE_ADESOES);

  const { linhas, totais, feriados } = await carregarQuadroDaAdesao();
  const agora = new Date();

  const porEtapa = new Map<number, LinhaDoQuadroDaAdesao[]>();
  for (const l of linhas) {
    const lista = porEtapa.get(l.etapa) ?? [];
    lista.push(l);
    porEtapa.set(l.etapa, lista);
  }

  // A etapa 8 (pedir o município) não espera: o que espera depois do pedido é a liberação (9).
  const etapas = ETAPAS_DA_ADESAO.filter((e) => e.numero >= 9);
  const comMunicipios = etapas.filter((e) => (totais[e.numero] ?? 0) > 0);
  const podeAgir = (permissao: string | null) => permissao !== null && temPermissao(permissoes, permissao as never);
  const naSuaVez = comMunicipios.filter((e) => podeAgir(e.permissao));
  const dosOutros = comMunicipios.filter((e) => !podeAgir(e.permissao));
  const totalNaSuaVez = naSuaVez.reduce((s, e) => s + (totais[e.numero] ?? 0), 0);

  const atrasadas = linhas.filter((l) => {
    const p = situacaoDoPrazoDaAdesao(l.vencimento, agora, feriados);
    return p?.tom === "atrasado";
  }).length;

  function Bloco({ numero, agir }: { numero: number; agir: boolean }) {
    const etapa = ETAPAS_DA_ADESAO.find((e) => e.numero === numero)!;
    const todas = porEtapa.get(numero) ?? [];
    const limite = numero === 10 ? LINHAS_DA_ETAPA_10 : LINHAS_POR_ETAPA;
    // As mais atrasadas (vencimento mais antigo) primeiro; sem vencimento no fim.
    const lista = [...todas]
      .sort((a, b) => (a.vencimento?.getTime() ?? Infinity) - (b.vencimento?.getTime() ?? Infinity))
      .slice(0, limite);
    const total = totais[numero] ?? todas.length;
    return (
      <Secao
        titulo={`${etapa.numero}. ${etapa.titulo} (${total})`}
        descricao={`${etapa.papel} · ${etapa.prazoDiasUteis === null ? "contínuo, sem prazo" : `prazo de ${etapa.prazoDiasUteis} dia(s) útil(eis)`}`}
        destaque={agir}
      >
        <div className="moldura-tabela">
          <table className="tabela-atas min-w-[720px]">
            <thead>
              <tr>
                <th>Município</th>
                <th>Ata</th>
                <th>Consultor</th>
                <th>Esperando desde</th>
                <th>Prazo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => {
                const prazo = situacaoDoPrazoDaAdesao(l.vencimento, agora, feriados);
                return (
                  <tr key={l.chave}>
                    <td className="align-top">
                      <span className="titulo-linha">{l.municipio}</span>
                      {l.uf && (
                        <span className="block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                          {l.uf}
                        </span>
                      )}
                    </td>
                    <td className="codigo align-top">{l.ataNumero}</td>
                    <td className="align-top">{l.consultor}</td>
                    <td className="align-top">{l.desde ? dataBr(l.desde) : "—"}</td>
                    <td className="align-top">
                      {prazo ? (
                        <Badge tom={TOM_DO_PRAZO[prazo.tom]}>{textoDoPrazo(prazo)}</Badge>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                          {etapa.prazoDiasUteis === null ? "contínuo" : "—"}
                        </span>
                      )}
                    </td>
                    <td className="align-top text-right whitespace-nowrap">
                      {l.oportunidadeId && veTelaDeAdesoes && (
                        <Link href={`/admin/adesoes/${l.oportunidadeId}`} className="botao-atas link">
                          Ver município
                        </Link>
                      )}
                      {agir && (
                        <Link href={caminhoDaEtapaDaAdesao(etapa.numero, l.oportunidadeId)} className="botao-atas ml-2">
                          {etapa.acao}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {total > lista.length && (
            <p className="px-3 py-2 text-xs" style={{ color: "var(--cor-texto-3)" }}>
              Mostrando {lista.length} de {total}, os de prazo mais curto primeiro.
            </p>
          )}
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
        rotulo="Venda, adesão e entrega"
        titulo="Ciclo da"
        destaque="adesão"
        descricao={`Do pedido do município ao pós-venda. ${totalNaSuaVez} esperando uma etapa sua · ${atrasadas} com prazo vencido. Prazos em dias úteis, contados da etapa anterior (aproximado).`}
        voltar={{ href: "/admin", rotulo: "Minhas tarefas" }}
      />

      <FaixaNumeros
        itens={etapas.map((e) => ({
          valor: totais[e.numero] ?? 0,
          rotulo: `${e.numero}. ${e.titulo}`,
          tom: podeAgir(e.permissao) && (totais[e.numero] ?? 0) > 0 ? "atencao" : undefined,
        }))}
      />

      {naSuaVez.length > 0 && <h2 className="eyebrow">Na sua vez</h2>}
      {naSuaVez.map((e) => (
        <Bloco key={e.numero} numero={e.numero} agir />
      ))}

      {dosOutros.length > 0 && <h2 className="eyebrow">Com outras pessoas</h2>}
      {dosOutros.map((e) => (
        <Bloco key={e.numero} numero={e.numero} agir={false} />
      ))}

      {comMunicipios.length === 0 && (
        <Secao titulo="Nenhum município em andamento">
          <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Quando um consultor pedir um município, ele aparece aqui.
          </p>
        </Secao>
      )}
    </AppShell>
  );
}
