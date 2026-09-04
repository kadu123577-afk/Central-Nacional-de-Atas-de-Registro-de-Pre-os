/**
 * Vocabulário fixo de categorias, usado na navegação e no formulário de
 * cadastro. Não é um enum do Prisma — `Item.categoria` continua String no
 * schema, isso só trava as opções na tela, sem migração de dado existente.
 */
interface Categoria {
  slug: string;
  rotulo: string;
  /** Versão curta pra caber na barra de navegação — se ausente, usa `rotulo`. */
  rotuloCurto?: string;
  /**
   * Cor de identidade da categoria — não é cor de severidade (essa
   * continua vindo só de src/lib/severidade.ts via Badge). É a mesma ideia
   * de "selo colorido por tema" pedida na revisão de telas de 2026-09-04:
   * tons frios (ciano→violeta→magenta), fora da faixa vermelho/laranja/
   * amarelo/verde reservada à escala de severidade e à marca, todos
   * conferidos com WCAG (mínimo 4.5:1 como texto sobre --cor-superficie).
   */
  cor: string;
}

export const CATEGORIAS_ATAS: readonly Categoria[] = [
  { slug: "material-escritorio", rotulo: "Material de escritório", rotuloCurto: "Escritório", cor: "#85e0c9" },
  { slug: "material-construcao", rotulo: "Material de construção", rotuloCurto: "Construção", cor: "#85dae0" },
  { slug: "material-eletrico", rotulo: "Material elétrico", rotuloCurto: "Elétrico", cor: "#85bce0" },
  { slug: "material-hospitalar", rotulo: "Material hospitalar", rotuloCurto: "Hospitalar", cor: "#859fe0" },
  { slug: "equipamento-ti", rotulo: "Equipamento de TI", rotuloCurto: "Equip. de TI", cor: "#8985e0" },
  { slug: "veiculos", rotulo: "Veículos e frota", rotuloCurto: "Veículos", cor: "#a685e0" },
  { slug: "combustivel", rotulo: "Combustível", rotuloCurto: "Combustível", cor: "#c385e0" },
  { slug: "limpeza", rotulo: "Limpeza e conservação", rotuloCurto: "Limpeza", cor: "#e085e0" },
];

export type CategoriaAta = (typeof CATEGORIAS_ATAS)[number];

/** Paleta de reserva, na mesma família de tons, pra quando uma categoria
 * nova (fora da lista fixa acima) precisar de uma cor — escolhida de
 * forma determinística (mesmo texto sempre cai na mesma cor), sem
 * precisar editar este arquivo toda vez que um tema novo aparecer. */
const CORES_RESERVA = ["#85e0c9", "#85dae0", "#85bce0", "#859fe0", "#8985e0", "#a685e0", "#c385e0", "#e085e0"];

/** Cor de identidade pra um rótulo ou slug de categoria — usa a cor fixa
 * quando é uma das 8 conhecidas, senão cai numa cor determinística da
 * paleta de reserva (mesmo hash sempre escolhe a mesma cor). */
export function corDaCategoria(rotuloOuSlug: string): string {
  const conhecida = CATEGORIAS_ATAS.find(
    (c) => c.rotulo === rotuloOuSlug || c.slug === rotuloOuSlug,
  );
  if (conhecida) return conhecida.cor;

  let hash = 0;
  for (let i = 0; i < rotuloOuSlug.length; i++) {
    hash = (hash * 31 + rotuloOuSlug.charCodeAt(i)) | 0;
  }
  return CORES_RESERVA[Math.abs(hash) % CORES_RESERVA.length];
}
