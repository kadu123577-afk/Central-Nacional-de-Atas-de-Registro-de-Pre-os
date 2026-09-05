/**
 * Vocabulário fixo do tipo de entidade alvo (prospecção comercial,
 * 2026-09-05) — mesmo racional de src/lib/categorias.ts (trava as opções
 * na tela, sem ser enum do Prisma). É a separação "ministerial, secretaria,
 * municipal, governamental, estadual, federal" pedida nas notas de voz —
 * distinta da esfera (art. 86), que só existe pra municipal/estadual/
 * distrital/federal.
 */
export const TIPOS_ENTIDADE_ALVO = [
  "municipal",
  "estadual",
  "federal",
  "ministerio",
  "secretaria",
] as const;

export type TipoEntidadeAlvo = (typeof TIPOS_ENTIDADE_ALVO)[number];

export const ROTULO_TIPO_ENTIDADE: Record<string, string> = {
  municipal: "Prefeitura",
  estadual: "Governo estadual",
  federal: "Governo federal",
  ministerio: "Ministério",
  secretaria: "Secretaria",
};

export function tipoEntidadeAlvoValido(valor: string): valor is TipoEntidadeAlvo {
  return (TIPOS_ENTIDADE_ALVO as readonly string[]).includes(valor);
}
