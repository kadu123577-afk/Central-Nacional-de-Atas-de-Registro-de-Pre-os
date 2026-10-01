/**
 * Vocabulário fixo do estágio de uma oportunidade de venda (ata x
 * município) — mesmo racional de src/lib/categorias.ts e
 * src/lib/pontos-focais.ts (trava as opções na tela, não é enum do
 * Prisma, pra não exigir migração se a lista mudar). Kanban pedido pelo
 * usuário (2026-10-01): "A Contatar → Em negociação → Aderiu/Recusou".
 */
export const ESTAGIOS_OPORTUNIDADE = [
  "a_contatar",
  "em_negociacao",
  "aderiu",
  "recusado",
] as const;

export type EstagioOportunidade = (typeof ESTAGIOS_OPORTUNIDADE)[number];

export const ROTULO_ESTAGIO_OPORTUNIDADE: Record<EstagioOportunidade, string> = {
  a_contatar: "A contatar",
  em_negociacao: "Em negociação",
  aderiu: "Aderiu",
  recusado: "Recusou",
};

export function estagioOportunidadeValido(valor: string): valor is EstagioOportunidade {
  return (ESTAGIOS_OPORTUNIDADE as readonly string[]).includes(valor);
}

/** Cor de cada estágio no Kanban — leitura visual instantânea (verde =
 * ganhou, vermelho = perdeu) sem precisar ler o texto do card. */
export const COR_ESTAGIO_OPORTUNIDADE: Record<EstagioOportunidade, string> = {
  a_contatar: "var(--cor-texto-3)",
  em_negociacao: "var(--cor-atencao)",
  aderiu: "var(--cor-marca-clara)",
  recusado: "var(--cor-critico)",
};

/**
 * Cada mudança de estágio também vira uma InteracaoPontoFocal (histórico
 * já existente por contato) — assim o painel de contatos e o Kanban
 * contam a mesma história, sem duas fontes de verdade desencontradas.
 */
export const RESULTADO_INTERACAO_POR_ESTAGIO: Record<EstagioOportunidade, string> = {
  a_contatar: "Oferecida",
  em_negociacao: "Em conversa",
  aderiu: "Converteu",
  recusado: "Recusou",
};
