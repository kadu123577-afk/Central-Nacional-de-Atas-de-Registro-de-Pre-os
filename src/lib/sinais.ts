/**
 * Sinais de compra de um município (fase 2 de design, etapa 4, 2026-10-05) —
 * o "por que agora" do card. Vocabulário fixo (texto no banco, não enum),
 * como categorias e estágios. O peso decide qual sinal vira a linha do card
 * quando há vários: o que está aberto agora vale mais que contexto.
 */
export const TIPOS_SINAL = [
  "licitacao_aberta",
  "contrato_vencendo",
  "pca",
  "troca_gestao",
  "convenio",
  "orcamento",
  "noticia",
  "outro",
] as const;

export type TipoSinal = (typeof TIPOS_SINAL)[number];

export const ROTULO_TIPO_SINAL: Record<TipoSinal, string> = {
  licitacao_aberta: "Licitação aberta",
  contrato_vencendo: "Contrato a vencer",
  pca: "Plano de contratações (PCA)",
  troca_gestao: "Troca de gestão",
  convenio: "Convênio / emenda",
  orcamento: "Orçamento",
  noticia: "Notícia",
  outro: "Outro",
};

const PESO: Record<TipoSinal, number> = {
  licitacao_aberta: 100,
  contrato_vencendo: 90,
  pca: 80,
  troca_gestao: 70,
  convenio: 60,
  orcamento: 50,
  noticia: 40,
  outro: 10,
};

/** Cor do ponto do sinal: urgente (aberto/vencendo), atenção, neutro. */
export const TOM_TIPO_SINAL: Record<TipoSinal, "critico" | "atencao" | "neutro"> = {
  licitacao_aberta: "critico",
  contrato_vencendo: "critico",
  pca: "atencao",
  troca_gestao: "atencao",
  convenio: "atencao",
  orcamento: "neutro",
  noticia: "neutro",
  outro: "neutro",
};

export function tipoSinalValido(valor: string): valor is TipoSinal {
  return (TIPOS_SINAL as readonly string[]).includes(valor);
}

export interface SinalView {
  id: string;
  tipo: string;
  titulo: string;
  detalhe: string | null;
  fonte: string;
  fonteUrl: string | null;
  categoria: string | null;
  valorEstimado: number | null;
  dataSinal: string;
  expiraEm: string | null;
}

function peso(tipo: string): number {
  return tipoSinalValido(tipo) ? PESO[tipo] : 0;
}

/**
 * Sinais que valem agora pra uma ata: não expirados e da categoria dela (ou
 * sem categoria). Mais relevante primeiro (peso do tipo, depois mais recente).
 */
export function sinaisRelevantes(sinais: SinalView[], categoriaAta: string | null, agora: Date = new Date()): SinalView[] {
  return sinais
    .filter((s) => (!s.expiraEm || new Date(s.expiraEm).getTime() >= agora.getTime()))
    .filter((s) => !s.categoria || s.categoria === categoriaAta)
    .sort((a, b) => peso(b.tipo) - peso(a.tipo) || b.dataSinal.localeCompare(a.dataSinal));
}
