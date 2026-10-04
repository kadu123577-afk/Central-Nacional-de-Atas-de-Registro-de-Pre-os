/**
 * Checklist de conformidade da ata (SCP cl. 8 e Projeto RNA §3–4,
 * 2026-10-04). Vocabulário fixo; cada item é um boolean em
 * ConformidadeAta. O item "limites" é informativo — o cálculo real dos
 * limites de 50% / 200% por item está em src/lib/saldo.ts.
 */
export const ITENS_CONFORMIDADE = [
  { campo: "fornecedorRegular", rotulo: "Fornecedor com situação fiscal, jurídica e cadastral regular" },
  { campo: "editalPermiteAdesao", rotulo: "Edital da licitação original prevê expressamente a adesão por não participantes" },
  { campo: "limitesRespeitados", rotulo: "Limites do art. 86 respeitados (50% por órgão aderente e 200% por item no total)" },
  { campo: "pesquisaPrecos", rotulo: "Vantajosidade comprovada por pesquisa de preços em bases oficiais (art. 23)" },
  { campo: "anuenciaGerenciador", rotulo: "Anuência prévia do órgão gerenciador" },
  { campo: "estimativaQuantidades", rotulo: "Edital fixou estimativa de quantidades (orientação do TCU)" },
] as const;

export type CampoConformidade = (typeof ITENS_CONFORMIDADE)[number]["campo"];

export type RespostasConformidade = Record<CampoConformidade, boolean>;

/** Rótulos dos itens que ficaram desmarcados — vira o alerta na tela. */
export function itensPendentes(respostas: RespostasConformidade): string[] {
  return ITENS_CONFORMIDADE.filter((i) => !respostas[i.campo]).map((i) => i.rotulo);
}

/** Alertas automáticos que não dependem do gestor marcar nada. */
export function alertasAutomaticos(ata: {
  dataVigenciaFim: Date;
  itensCount: number;
  categoria: string | null;
  documentosCount: number;
  agora?: Date;
}): string[] {
  const alertas: string[] = [];
  if (ata.dataVigenciaFim < (ata.agora ?? new Date())) {
    alertas.push("A vigência da ata já terminou.");
  }
  if (ata.itensCount === 0) alertas.push("A ata não tem itens cadastrados.");
  if (!ata.categoria) alertas.push("A ata não tem categoria definida.");
  if (ata.documentosCount === 0) alertas.push("Nenhum documento anexado (edital/ata digitalizada).");
  return alertas;
}
