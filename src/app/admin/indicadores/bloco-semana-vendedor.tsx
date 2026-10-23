import { Aviso } from "@/components/ui/aviso";
import { rotuloSemana, type ResumoSemanal } from "@/lib/indicadores-semanais";
import { FaixaIndicadores } from "./faixa-indicadores";

/**
 * Bloco compacto "Indicadores da semana" do painel do consultor: só os
 * números dele (o resumo chega já filtrado pelo id da sessão, e aqui só o
 * total desse resumo é mostrado). `resumo` nulo = a consulta falhou; o resto
 * do painel segue funcionando.
 */
export function BlocoIndicadoresSemana({
  resumo,
  fotoExata,
}: {
  resumo: ResumoSemanal | null;
  fotoExata: boolean;
}) {
  if (!resumo) {
    return <Aviso tom="atencao">Não foi possível carregar os indicadores da semana agora. Tente de novo em instantes.</Aviso>;
  }

  return (
    <section aria-labelledby="indicadores-da-semana" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="indicadores-da-semana"
          className="marca text-[17px]"
          style={{ color: "var(--cor-texto)", fontWeight: 800, letterSpacing: "-0.025em" }}
        >
          Indicadores da semana
        </h2>
        <span className="numero text-xs" style={{ color: "var(--cor-texto-3)" }}>
          {rotuloSemana(resumo.semana)} · segunda a domingo
        </span>
      </div>
      <FaixaIndicadores linha={resumo.total} fotoExata={fotoExata} />
      <p className="text-xs leading-relaxed" style={{ color: "var(--cor-texto-3)" }}>
        Só os seus números, comparados com a semana anterior; não há metas. O sistema não guarda o histórico de estágio
        nem quem registrou cada contato: avanços e adesões são contados pela data da última alteração do cartão, e
        mover um cartão no Kanban também conta como contato registrado. O número de municípios em negociação da semana
        anterior é um mínimo (≥), e por isso a variação dele aparece como “no máximo”.
      </p>
    </section>
  );
}
