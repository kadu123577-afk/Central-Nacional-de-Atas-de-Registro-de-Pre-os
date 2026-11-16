/**
 * Tipo do vendedor (2026-10-01, pedido explícito): "consultor de vendas
 * empresarial interno" e "consultor de vendas empresarial externo" —
 * vocabulário fixo (não enum do Prisma), mesmo racional de
 * src/lib/categorias.ts e src/lib/oportunidades.ts.
 *
 * Em 16/11/2026 Carlos decidiu: NÃO HAVERÁ consultores externos, só internos. Por isso o tipo
 * "externo" saiu do vocabulário (a coluna continua, e todos os consultores são "interno"). Quem
 * vê a ata inteira (órgão, fornecedor, número) é só o consultor interno; se um dia houver consultor de
 * fora, a visão dele precisa ser restringida antes (ver NOTAS-ALTERACOES.md, "O título público").
 */
export const TIPOS_VENDEDOR = ["interno"] as const;

export type TipoVendedor = (typeof TIPOS_VENDEDOR)[number];

export const ROTULO_TIPO_VENDEDOR: Record<TipoVendedor, string> = {
  interno: "Consultor de vendas interno",
};

export function tipoVendedorValido(valor: string): valor is TipoVendedor {
  return (TIPOS_VENDEDOR as readonly string[]).includes(valor);
}
