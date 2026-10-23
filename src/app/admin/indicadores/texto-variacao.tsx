import { textoVariacaoComQualidade, type QualidadeComparacao, type Variacao } from "@/lib/indicadores-semanais";

/**
 * "+3 (+25%)" na cor da marca quando subiu e em cinza quando ficou igual ou
 * caiu. Cair não é tratado como problema: não há metas, só a comparação com a
 * semana anterior. Quando um dos números é um mínimo (≥), a variação sai sem
 * destaque e dita como "no máximo" ou "não comparável", para não parecer
 * uma alta ou queda confirmada.
 */
export function TextoVariacao({
  variacao,
  formatar,
  qualidade = "exata",
}: {
  variacao: Variacao;
  /** Como escrever o valor absoluto da diferença (padrão: número inteiro; use moedaCurta para reais). */
  formatar?: (n: number) => string;
  qualidade?: QualidadeComparacao;
}) {
  const subiu = qualidade === "exata" && variacao.diferenca > 0;
  return (
    <span
      className="numero"
      style={{ color: subiu ? "var(--cor-marca-clara)" : "var(--cor-texto-3)", fontWeight: subiu ? 600 : undefined }}
    >
      {textoVariacaoComQualidade(variacao, qualidade, formatar)}
    </span>
  );
}
