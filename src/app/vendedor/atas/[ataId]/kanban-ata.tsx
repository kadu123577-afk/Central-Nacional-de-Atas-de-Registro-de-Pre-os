"use client";

import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { moedaCurta } from "@/lib/formato";
import { totalDaColuna, type CartaoView } from "@/lib/kanban-view";
import {
  COR_ESTAGIO_OPORTUNIDADE,
  ESTAGIOS_OPORTUNIDADE,
  ROTULO_ESTAGIO_OPORTUNIDADE,
  type EstagioOportunidade,
} from "@/lib/oportunidades";
import { Cartao } from "./cartao";
import { Gaveta } from "./gaveta";

type Filtro = "todos" | "acao" | "sinal" | "sem_contato";
type Visao = "quadro" | "lista";

const ABERTOS = ["a_contatar", "em_negociacao"];
const MS_DIA = 24 * 60 * 60 * 1000;

function ordenarPorPrazo(a: CartaoView, b: CartaoView): number {
  const pa = a.prazoEm ? new Date(a.prazoEm).getTime() : Number.POSITIVE_INFINITY;
  const pb = b.prazoEm ? new Date(b.prazoEm).getTime() : Number.POSITIVE_INFINITY;
  return pa - pb;
}

/**
 * Kanban do vendedor (fase 2 de design, 2026-10-04): indicadores no topo,
 * filtros por situação, quadro por estágio (ou lista) e a gaveta do
 * município. Todo o estado é de tela; os dados vêm prontos do servidor.
 */
export function KanbanAta({ cartoes, categoriaAta }: { cartoes: CartaoView[]; categoriaAta: string | null }) {
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [visao, setVisao] = useState<Visao>("quadro");
  const [busca, setBusca] = useState("");
  const [agora] = useState(() => new Date());

  const fechar = useCallback(() => setSelecionadoId(null), []);

  const abertos = cartoes.filter((c) => ABERTOS.includes(c.estagio));
  const precisaAcaoHoje = (c: CartaoView) =>
    ABERTOS.includes(c.estagio) &&
    (c.urgencia.nivel === "critico" ||
      (c.proximoContatoEm != null && new Date(c.proximoContatoEm).getTime() <= agora.getTime() + MS_DIA));

  const contagens = {
    todos: cartoes.length,
    acao: cartoes.filter(precisaAcaoHoje).length,
    sinal: cartoes.filter((c) => c.sinais.length > 0).length,
    sem_contato: abertos.filter((c) => c.semCanal).length,
  };

  const termoBusca = busca.trim().toLowerCase();
  const filtrados = cartoes.filter((c) => {
    if (termoBusca && !`${c.nomeMunicipio} ${c.uf ?? ""}`.toLowerCase().includes(termoBusca)) return false;
    if (filtro === "acao") return precisaAcaoHoje(c);
    if (filtro === "sinal") return c.sinais.length > 0;
    if (filtro === "sem_contato") return ABERTOS.includes(c.estagio) && c.semCanal;
    return true;
  });

  const aderidos = cartoes.filter((c) => c.estagio === "aderiu");
  const totalAderido = aderidos.reduce((s, c) => s + (c.valorAderido ?? 0), 0);
  const comissaoDevida = aderidos.reduce((s, c) => s + c.comissaoDevida, 0);
  const potencial = abertos.reduce((s, c) => s + (c.valorEstimado ?? 0), 0);
  const emNegociacao = cartoes.filter((c) => c.estagio === "em_negociacao");
  const vencendo = abertos.filter((c) => c.urgencia.nivel === "critico").length;

  const selecionado = cartoes.find((c) => c.id === selecionadoId) ?? null;

  return (
    <>
      <div className="kb-kpis">
        <Indicador rotulo="Aderido" valor={moedaCurta(totalAderido)} tom="marca" nota={`${aderidos.length} município(s) · comissão devida ${moedaCurta(comissaoDevida)}`} />
        <Indicador rotulo="Em negociação" valor={String(emNegociacao.length)} nota={`~${moedaCurta(potencial)} em potencial estimado`} />
        <Indicador rotulo="Prazos vencendo" valor={String(vencendo)} tom={vencendo > 0 ? "critico" : "neutro"} nota="expiram em até 3 dias" />
        <Indicador rotulo="Sem decisor com contato" valor={String(contagens.sem_contato)} tom={contagens.sem_contato > 0 ? "atencao" : "neutro"} nota={`de ${abertos.length} município(s) em aberto`} />
      </div>

      <div className="kb-barra">
        <Chip ativo={filtro === "todos"} aoClicar={() => setFiltro("todos")} rotulo="Todos" n={contagens.todos} />
        <Chip ativo={filtro === "acao"} aoClicar={() => setFiltro("acao")} rotulo="Precisam de ação hoje" n={contagens.acao} />
        <Chip ativo={filtro === "sinal"} aoClicar={() => setFiltro("sinal")} rotulo="Com sinal de compra" n={contagens.sinal} />
        <Chip ativo={filtro === "sem_contato"} aoClicar={() => setFiltro("sem_contato")} rotulo="Sem contato" n={contagens.sem_contato} />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar município…"
          className="campo-atas"
          style={{ width: 200, padding: "5px 10px", fontSize: 12.5 }}
          aria-label="Buscar município"
        />
        <div className="kb-seg" role="group" aria-label="Visão">
          <button type="button" aria-pressed={visao === "quadro"} onClick={() => setVisao("quadro")}>
            Kanban
          </button>
          <button type="button" aria-pressed={visao === "lista"} onClick={() => setVisao("lista")}>
            Lista
          </button>
        </div>
      </div>

      {visao === "quadro" ? (
        <div className="kb-quadro">
          {ESTAGIOS_OPORTUNIDADE.map((estagio) => {
            const daColuna = filtrados.filter((c) => c.estagio === estagio).sort(ordenarPorPrazo);
            const total = totalDaColuna(daColuna, estagio);
            return (
              <section key={estagio}>
                <div className="kb-col-topo">
                  <div className="kb-col-titulo">
                    <i className="kb-ponto" style={{ background: COR_ESTAGIO_OPORTUNIDADE[estagio as EstagioOportunidade] }} />
                    {ROTULO_ESTAGIO_OPORTUNIDADE[estagio as EstagioOportunidade]}
                    <span className="kb-contagem numero">{daColuna.length}</span>
                  </div>
                  <span className="kb-col-total numero">
                    {total != null ? `${ABERTOS.includes(estagio) ? "~" : ""}${moedaCurta(total)}` : "—"}
                  </span>
                </div>
                <ul className="kb-lista-cartoes">
                  {daColuna.length === 0 ? (
                    <li className="kb-coluna-vazia">Nenhum município aqui</li>
                  ) : (
                    daColuna.map((c) => (
                      <Cartao key={c.id} cartao={c} selecionado={c.id === selecionadoId} aoAbrir={() => setSelecionadoId(c.id)} />
                    ))
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="painel kb-tabela-wrap">
          <table className="tabela-atas">
            <thead>
              <tr>
                <th>Município</th>
                <th>Estágio</th>
                <th>Decisor</th>
                <th>Prazo</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {[...filtrados].sort(ordenarPorPrazo).map((c) => (
                <tr key={c.id} className="kb-linha-clicavel" onClick={() => setSelecionadoId(c.id)}>
                  <td>
                    {c.nomeMunicipio}
                    {c.uf ? ` / ${c.uf}` : ""}
                  </td>
                  <td>{ROTULO_ESTAGIO_OPORTUNIDADE[c.estagio as EstagioOportunidade] ?? c.estagio}</td>
                  <td>{c.principal ? `${c.principal.cargo} — ${c.principal.nomeContato}` : "—"}</td>
                  <td>
                    {ABERTOS.includes(c.estagio) ? (
                      <Badge tom={c.urgencia.nivel === "critico" ? "critico" : c.urgencia.nivel === "atencao" ? "atencao" : "neutro"}>
                        {c.urgencia.rotulo}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="numero">
                    {c.estagio === "aderiu"
                      ? moedaCurta(c.valorAderido ?? 0)
                      : c.valorEstimado != null
                        ? `~${moedaCurta(c.valorEstimado)}`
                        : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length === 0 && (
            <p className="kb-coluna-vazia" style={{ margin: 12 }}>
              Nenhum município com este filtro.
            </p>
          )}
        </div>
      )}

      {selecionado && <Gaveta key={selecionado.id} cartao={selecionado} categoriaAta={categoriaAta} fechar={fechar} />}
    </>
  );
}

function Indicador({
  rotulo,
  valor,
  nota,
  tom = "neutro",
}: {
  rotulo: string;
  valor: string;
  nota: string;
  tom?: "neutro" | "marca" | "atencao" | "critico";
}) {
  const cor = {
    neutro: "var(--cor-texto)",
    marca: "var(--cor-marca-clara)",
    atencao: "var(--cor-atencao)",
    critico: "var(--cor-critico)",
  }[tom];
  return (
    <div className="kb-kpi">
      <p className="eyebrow">{rotulo}</p>
      <p className="kb-kpi-valor numero" style={{ color: cor }}>
        {valor}
      </p>
      <p className="kb-kpi-nota">{nota}</p>
    </div>
  );
}

function Chip({ rotulo, n, ativo, aoClicar }: { rotulo: string; n: number; ativo: boolean; aoClicar: () => void }) {
  return (
    <button type="button" className="kb-chip" aria-pressed={ativo} onClick={aoClicar}>
      {rotulo}
      <b className="numero">{n}</b>
    </button>
  );
}
