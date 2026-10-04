/**
 * Vocabulário de liquidação e cobrança da comissão (2026-10-04) — mesmo
 * racional de categorias/estágios: texto fixo, não enum do Prisma.
 */
export const TIPOS_LIQUIDACAO = ["original", "aditivo", "renovacao"] as const;
export type TipoLiquidacao = (typeof TIPOS_LIQUIDACAO)[number];

export const ROTULO_TIPO_LIQUIDACAO: Record<TipoLiquidacao, string> = {
  original: "Fornecimento original",
  aditivo: "Aditivo (valor/quantidade)",
  renovacao: "Renovação/prorrogação",
};

export function tipoLiquidacaoValido(valor: string): valor is TipoLiquidacao {
  return (TIPOS_LIQUIDACAO as readonly string[]).includes(valor);
}

export const STATUS_COBRANCA = ["pendente", "cobrada", "recebida"] as const;
export type StatusCobranca = (typeof STATUS_COBRANCA)[number];

export const ROTULO_STATUS_COBRANCA: Record<StatusCobranca, string> = {
  pendente: "A cobrar",
  cobrada: "Cobrada",
  recebida: "Recebida",
};

export function statusCobrancaValido(valor: string): valor is StatusCobranca {
  return (STATUS_COBRANCA as readonly string[]).includes(valor);
}

export interface LiquidacaoParaResumo {
  valorLiquidado: number;
  statusCobranca: string;
}

export interface ResumoComissao {
  devida: number;
  recebida: number;
  faltaReceber: number;
}

/**
 * Comissão devida = soma do liquidado × percentual (de qualquer tipo —
 * original, aditivo ou renovação, todos com o mesmo percentual).
 * Recebida = só o que já foi marcado como "recebida".
 */
export function resumirComissao(liquidacoes: LiquidacaoParaResumo[], percentual: number): ResumoComissao {
  const devida = liquidacoes.reduce((soma, l) => soma + l.valorLiquidado * percentual, 0);
  const recebida = liquidacoes
    .filter((l) => l.statusCobranca === "recebida")
    .reduce((soma, l) => soma + l.valorLiquidado * percentual, 0);
  return { devida, recebida, faltaReceber: devida - recebida };
}
