/**
 * Vocabulário fixo de categorias, usado na navegação e no formulário de
 * cadastro. Não é um enum do Prisma — `Item.categoria` continua String no
 * schema, isso só trava as opções na tela, sem migração de dado existente.
 */
export const CATEGORIAS_ATAS = [
  { slug: "material-escritorio", rotulo: "Material de escritório" },
  { slug: "material-construcao", rotulo: "Material de construção" },
  { slug: "material-eletrico", rotulo: "Material elétrico" },
  { slug: "material-hospitalar", rotulo: "Material hospitalar" },
  { slug: "equipamento-ti", rotulo: "Equipamento de TI" },
  { slug: "veiculos", rotulo: "Veículos e frota" },
  { slug: "combustivel", rotulo: "Combustível" },
  { slug: "limpeza", rotulo: "Limpeza e conservação" },
] as const;

export type CategoriaAta = (typeof CATEGORIAS_ATAS)[number];
