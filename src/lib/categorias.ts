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
}

export const CATEGORIAS_ATAS: readonly Categoria[] = [
  { slug: "material-escritorio", rotulo: "Material de escritório", rotuloCurto: "Escritório" },
  { slug: "material-construcao", rotulo: "Material de construção", rotuloCurto: "Construção" },
  { slug: "material-eletrico", rotulo: "Material elétrico", rotuloCurto: "Elétrico" },
  { slug: "material-hospitalar", rotulo: "Material hospitalar", rotuloCurto: "Hospitalar" },
  { slug: "equipamento-ti", rotulo: "Equipamento de TI", rotuloCurto: "Equip. de TI" },
  { slug: "veiculos", rotulo: "Veículos e frota", rotuloCurto: "Veículos" },
  { slug: "combustivel", rotulo: "Combustível", rotuloCurto: "Combustível" },
  { slug: "limpeza", rotulo: "Limpeza e conservação", rotuloCurto: "Limpeza" },
];

export type CategoriaAta = (typeof CATEGORIAS_ATAS)[number];
