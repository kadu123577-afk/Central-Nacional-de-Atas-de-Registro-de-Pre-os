import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Secao } from "@/components/ui/secao";
import { moedaCurta } from "@/lib/formato";
import { ROTULO_ESTAGIO_OPORTUNIDADE, COR_ESTAGIO_OPORTUNIDADE, type EstagioOportunidade } from "@/lib/oportunidades";
import type { PainelVendedor } from "@/lib/painel-vendedor";

/** Faixa de indicadores do vendedor (mesma linguagem do Kanban). */
export function KpisVendedor({ kpis }: { kpis: PainelVendedor["kpis"] }) {
  return (
    <div className="kb-kpis">
      <div className="kb-kpi">
        <p className="eyebrow">Aderido</p>
        <p className="kb-kpi-valor numero" style={{ color: "var(--cor-marca-clara)" }}>
          {moedaCurta(kpis.aderido)}
        </p>
        <p className="kb-kpi-nota">
          {kpis.aderidos} município(s) · comissão devida {moedaCurta(kpis.comissaoDevida)}
        </p>
      </div>
      <div className="kb-kpi">
        <p className="eyebrow">Em negociação</p>
        <p className="kb-kpi-valor numero">{kpis.emNegociacao}</p>
        <p className="kb-kpi-nota">~{moedaCurta(kpis.potencial)} em potencial estimado</p>
      </div>
      <div className="kb-kpi">
        <p className="eyebrow">Prazos vencendo</p>
        <p className="kb-kpi-valor numero" style={{ color: kpis.vencendo > 0 ? "var(--cor-critico)" : undefined }}>
          {kpis.vencendo}
        </p>
        <p className="kb-kpi-nota">expiram em até 3 dias</p>
      </div>
      <div className="kb-kpi">
        <p className="eyebrow">Sem decisor com contato</p>
        <p className="kb-kpi-valor numero" style={{ color: kpis.semContato > 0 ? "var(--cor-atencao)" : undefined }}>
          {kpis.semContato}
        </p>
        <p className="kb-kpi-nota">de {kpis.abertos} município(s) em aberto</p>
      </div>
    </div>
  );
}

/** "O que fazer hoje" — municípios que precisam de ação, mais urgentes primeiro. */
export function TarefasHoje({ tarefas }: { tarefas: PainelVendedor["tarefas"] }) {
  return (
    <Secao titulo={`O que fazer hoje ${tarefas.length > 0 ? `(${tarefas.length})` : ""}`}>
      {tarefas.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--cor-texto-3)" }}>
          Nada urgente: sem prazos vencendo, retornos atrasados nem municípios sem contato.
        </p>
      ) : (
        <ul className="flex flex-col">
          {tarefas.map((t) => (
            <li
              key={t.oportunidadeId}
              className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0"
              style={{ borderColor: "var(--cor-borda)" }}
            >
              <div>
                <Link href={`/vendedor/atas/${t.ataId}`} className="text-sm font-medium underline" style={{ color: "var(--cor-texto)" }}>
                  {t.municipio}
                  {t.uf ? ` / ${t.uf}` : ""}
                </Link>
                <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  Ata {t.ataNumero} · {t.motivo}
                </p>
              </div>
              <Badge tom={t.nivel === "critico" ? "critico" : "atencao"}>{t.nivel === "critico" ? "Urgente" : "Atenção"}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

/** Funil por valor: barra proporcional ao valor (aderido nas finais, estimado nas abertas). */
export function FunilVendedor({ funil }: { funil: PainelVendedor["funil"] }) {
  const maximo = Math.max(1, ...funil.map((f) => f.valor));
  return (
    <Secao titulo="Funil por valor">
      <ul className="flex flex-col gap-3">
        {funil.map((f) => (
          <li key={f.estagio}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="flex items-center gap-2" style={{ color: "var(--cor-texto)" }}>
                <i className="kb-ponto" style={{ background: COR_ESTAGIO_OPORTUNIDADE[f.estagio as EstagioOportunidade] }} />
                {ROTULO_ESTAGIO_OPORTUNIDADE[f.estagio as EstagioOportunidade]}
                <span className="numero" style={{ color: "var(--cor-texto-3)" }}>
                  {f.quantidade}
                </span>
              </span>
              <span className="numero" style={{ color: "var(--cor-texto-2)" }}>
                {f.estagio === "recusado" ? "—" : `${f.estimado ? "~" : ""}${moedaCurta(f.valor)}`}
              </span>
            </div>
            <div className="kb-progresso" style={{ marginTop: 0 }}>
              <div
                style={{
                  width: `${(f.valor / maximo) * 100}%`,
                  background: COR_ESTAGIO_OPORTUNIDADE[f.estagio as EstagioOportunidade],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs" style={{ color: "var(--cor-texto-3)" }}>
        &quot;~&quot; = estimativa pelo histórico de consumo do município, não o valor real da ata.
      </p>
    </Secao>
  );
}
