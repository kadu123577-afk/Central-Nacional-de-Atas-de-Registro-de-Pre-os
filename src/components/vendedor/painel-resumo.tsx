import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Secao } from "@/components/ui/secao";
import { moedaCurta } from "@/lib/formato";
import { ROTULO_ESTAGIO_OPORTUNIDADE, COR_ESTAGIO_OPORTUNIDADE, type EstagioOportunidade } from "@/lib/oportunidades";
import type { PainelVendedor } from "@/lib/painel-vendedor";

/** Faixa de indicadores do vendedor — a faixa de números do site. */
export function KpisVendedor({ kpis }: { kpis: PainelVendedor["kpis"] }) {
  return (
    <FaixaNumeros
      itens={[
        {
          valor: moedaCurta(kpis.aderido),
          rotulo: "Aderido",
          nota: `${kpis.aderidos} município(s) · comissão devida ${moedaCurta(kpis.comissaoDevida)}`,
          tom: "marca",
        },
        {
          valor: kpis.emNegociacao,
          rotulo: "Em negociação",
          nota: `~${moedaCurta(kpis.potencial)} em potencial estimado`,
        },
        {
          valor: kpis.vencendo,
          rotulo: "Prazos vencendo",
          nota: "expiram em até 3 dias",
          tom: kpis.vencendo > 0 ? "critico" : undefined,
        },
        {
          valor: kpis.semContato,
          rotulo: "Sem decisor com contato",
          nota: `de ${kpis.abertos} município(s) em aberto`,
          tom: kpis.semContato > 0 ? "atencao" : undefined,
        },
      ]}
    />
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
        <ul className="lista-linhas">
          {tarefas.map((t) => (
            <li key={t.oportunidadeId} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/vendedor/atas/${t.ataId}`}
                  className="inline-flex items-center gap-2 text-[13.5px] font-bold transition-colors hover:text-[var(--cor-marca-clara)]"
                  style={{ color: "var(--cor-texto)", letterSpacing: "-0.01em" }}
                >
                  {t.municipio}
                  {t.uf && <span className="selo-uf">{t.uf}</span>}
                </Link>
                <p className="mt-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  Ata <span className="codigo">{t.ataNumero}</span> · {t.motivo}
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
    <Secao
      titulo="Funil por valor"
      descricao={<>&quot;~&quot; = estimativa pelo histórico de consumo do município, não o valor real da ata.</>}
    >
      <ul className="flex flex-col gap-4">
        {funil.map((f) => (
          <li key={f.estagio}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13.5px]">
              <span className="flex items-center gap-2 font-semibold" style={{ color: "var(--cor-texto)" }}>
                <i className="kb-ponto" style={{ background: COR_ESTAGIO_OPORTUNIDADE[f.estagio as EstagioOportunidade] }} />
                {ROTULO_ESTAGIO_OPORTUNIDADE[f.estagio as EstagioOportunidade]}
                <span className="numero text-xs font-normal" style={{ color: "var(--cor-texto-3)" }}>
                  {f.quantidade}
                </span>
              </span>
              <span className="numero font-bold" style={{ color: "var(--cor-texto)" }}>
                {f.estagio === "recusado" ? "—" : `${f.estimado ? "~" : ""}${moedaCurta(f.valor)}`}
              </span>
            </div>
            <div className="barra-saldo">
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
    </Secao>
  );
}
