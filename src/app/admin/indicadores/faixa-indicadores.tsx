import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { moedaCurta } from "@/lib/formato";
import {
  formatarInteiro,
  qualidadeDaComparacaoDeNegociacoes,
  type LinhaIndicadores,
  type QualidadeComparacao,
  type Variacao,
} from "@/lib/indicadores-semanais";
import { TextoVariacao } from "./texto-variacao";

/** "Semana anterior: 12 · +3 (+25%)" — a semana anterior do número principal da célula. */
function SemanaAnterior({
  anterior,
  variacao,
  formatar,
  qualidade,
}: {
  anterior: string;
  variacao: Variacao;
  formatar?: (n: number) => string;
  qualidade?: QualidadeComparacao;
}) {
  return (
    <span className="block">
      Semana anterior: <span className="numero">{anterior}</span> ·{" "}
      <TextoVariacao variacao={variacao} formatar={formatar} qualidade={qualidade} />
    </span>
  );
}

/** "Avançaram: 4 · anterior 2 · +2 (+100%)" — o segundo número dos indicadores compostos. */
function SegundoNumero({
  rotulo,
  atual,
  anterior,
  variacao,
  formatar,
}: {
  rotulo: string;
  atual: string;
  anterior: string;
  variacao: Variacao;
  formatar?: (n: number) => string;
}) {
  return (
    <span className="mt-1 block">
      {rotulo}: <span className="numero">{atual}</span> · anterior <span className="numero">{anterior}</span> ·{" "}
      <TextoVariacao variacao={variacao} formatar={formatar} />
    </span>
  );
}

/**
 * Os quatro indicadores da semana (contatos, negociações, adesões e
 * comissão) de uma linha de resumo: o total, na tela do gestor, ou o próprio
 * consultor, no painel dele. Cada número traz a semana anterior e a variação
 * em número e em %; os dois indicadores compostos trazem também o segundo
 * número (avançaram, valor aderido, recebida).
 *
 * `fotoExata`: só a semana em andamento tem número exato de negociações em
 * andamento; nas passadas é um mínimo (≥), porque não há histórico de estágio.
 * A semana anterior é sempre um mínimo.
 */
export function FaixaIndicadores({ linha, fotoExata }: { linha: LinhaIndicadores; fotoExata: boolean }) {
  const { atual, anterior, variacao } = linha;
  return (
    <FaixaNumeros
      itens={[
        {
          valor: formatarInteiro(atual.contatos),
          rotulo: "Contatos registrados",
          nota: <SemanaAnterior anterior={formatarInteiro(anterior.contatos)} variacao={variacao.contatos} />,
        },
        {
          valor: `${fotoExata ? "" : "≥ "}${formatarInteiro(atual.negociacoesAtivas)}`,
          rotulo: "Municípios em negociação",
          nota: (
            <>
              <SemanaAnterior
                anterior={`≥ ${formatarInteiro(anterior.negociacoesAtivas)}`}
                variacao={variacao.negociacoesAtivas}
                qualidade={qualidadeDaComparacaoDeNegociacoes(fotoExata)}
              />
              <SegundoNumero
                rotulo="Avançaram"
                atual={formatarInteiro(atual.avancaram)}
                anterior={formatarInteiro(anterior.avancaram)}
                variacao={variacao.avancaram}
              />
            </>
          ),
        },
        {
          valor: formatarInteiro(atual.adesoes),
          rotulo: "Adesões fechadas",
          nota: (
            <>
              <SemanaAnterior anterior={formatarInteiro(anterior.adesoes)} variacao={variacao.adesoes} />
              <SegundoNumero
                rotulo="Valor aderido"
                atual={moedaCurta(atual.valorAderido)}
                anterior={moedaCurta(anterior.valorAderido)}
                variacao={variacao.valorAderido}
                formatar={moedaCurta}
              />
            </>
          ),
        },
        {
          valor: moedaCurta(atual.comissaoLiquidada),
          rotulo: "Comissão sobre o liquidado",
          nota: (
            <>
              <SemanaAnterior
                anterior={moedaCurta(anterior.comissaoLiquidada)}
                variacao={variacao.comissaoLiquidada}
                formatar={moedaCurta}
              />
              <SegundoNumero
                rotulo="Recebida"
                atual={moedaCurta(atual.comissaoRecebida)}
                anterior={moedaCurta(anterior.comissaoRecebida)}
                variacao={variacao.comissaoRecebida}
                formatar={moedaCurta}
              />
            </>
          ),
        },
      ]}
    />
  );
}
