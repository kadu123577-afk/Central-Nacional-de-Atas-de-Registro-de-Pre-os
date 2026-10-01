/**
 * Tipo do vendedor (2026-10-01, pedido explícito): "consultor de vendas
 * empresarial interno" e "consultor de vendas empresarial externo" —
 * vocabulário fixo (não enum do Prisma), mesmo racional de
 * src/lib/categorias.ts e src/lib/oportunidades.ts.
 */
export const TIPOS_VENDEDOR = ["interno", "externo"] as const;

export type TipoVendedor = (typeof TIPOS_VENDEDOR)[number];

export const ROTULO_TIPO_VENDEDOR: Record<TipoVendedor, string> = {
  interno: "Consultor de vendas empresarial interno",
  externo: "Consultor de vendas empresarial externo",
};

export function tipoVendedorValido(valor: string): valor is TipoVendedor {
  return (TIPOS_VENDEDOR as readonly string[]).includes(valor);
}
