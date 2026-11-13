/**
 * Roda uma vez quando o servidor sobe (convenção do Next). Em produção confere o ambiente: se
 * faltar o que o sistema precisa para funcionar (banco, segredo das sessões), a partida PARA com a
 * mensagem do que falta, em vez de subir quebrada. Avisos (rotinas, https, demonstração) só vão
 * para o log. Fora de produção não faz nada.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;

  const { descreverProblemas, verificarAmbiente } = await import("@/lib/ambiente");
  const problemas = verificarAmbiente(process.env);
  const erros = problemas.filter((p) => p.gravidade === "erro");

  if (problemas.length > 0) {
    const texto = descreverProblemas(problemas);
    if (erros.length > 0) {
      throw new Error(`Ambiente de produção incompleto. A Central de Atas não vai subir enquanto isto não for corrigido:\n${texto}`);
    }
    console.warn(`Central de Atas: atenção ao ambiente de produção:\n${texto}`);
  }
}
