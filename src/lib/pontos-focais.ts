/**
 * Vocabulário fixo do resultado de uma interação com um ponto focal —
 * mesmo racional de src/lib/categorias.ts (trava as opções na tela, sem
 * ser enum do Prisma, pra não exigir migração se a lista mudar).
 */
export const RESULTADOS_INTERACAO = [
  "Oferecida",
  "Em conversa",
  "Converteu",
  "Recusou",
  "Sem resposta",
] as const;

export type ResultadoInteracao = (typeof RESULTADOS_INTERACAO)[number];

export function resultadoInteracaoValido(valor: string): valor is ResultadoInteracao {
  return (RESULTADOS_INTERACAO as readonly string[]).includes(valor);
}
