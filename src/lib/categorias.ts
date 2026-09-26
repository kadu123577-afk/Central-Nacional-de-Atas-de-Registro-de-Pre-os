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
  // Expandido em 2026-09-26 — mesmo vocabulário (mesmos slugs) do
  // classificador do raio-X de consumo (src/lib/classificador-objeto.ts),
  // pra uma ata cadastrada aqui poder ser cruzada com a necessidade real
  // de um município ("a gente tem uma ata de gráfica — qual município
  // precisa dela?"). Cor gerada ciclando a mesma paleta de reserva
  // (não é prático curar manualmente uma cor WCAG única pra cada uma das
  // ~30 categorias novas — o hash-fallback de corDaCategoria já cobre
  // isso com segurança, aqui só listamos pra aparecerem nos selects).
  { slug: "kit-escolar", rotulo: "Kit escolar", cor: "#85e0c9" },
  { slug: "uniforme", rotulo: "Uniforme/fardamento", cor: "#85dae0" },
  { slug: "grafica", rotulo: "Material gráfico", cor: "#85bce0" },
  { slug: "merenda-escolar", rotulo: "Merenda escolar", cor: "#859fe0" },
  { slug: "recuperacao-de-receitas", rotulo: "Recuperação de receitas", cor: "#8985e0" },
  { slug: "seguranca-digital", rotulo: "Segurança digital", cor: "#a685e0" },
  { slug: "videomonitoramento", rotulo: "Videomonitoramento", cor: "#c385e0" },
  { slug: "eventos", rotulo: "Eventos", cor: "#e085e0" },
  { slug: "festividades", rotulo: "Festividades", cor: "#85e0c9" },
  { slug: "ovos-de-pascoa", rotulo: "Ovos de Páscoa", cor: "#85dae0" },
  { slug: "curso-de-ingles", rotulo: "Curso de inglês", cor: "#85bce0" },
  { slug: "modulares", rotulo: "Construções modulares", cor: "#859fe0" },
  { slug: "dedetizacao", rotulo: "Controle de pragas/dedetização", cor: "#8985e0" },
  { slug: "manutencao-predial", rotulo: "Manutenção predial", cor: "#a685e0" },
  { slug: "mobiliario-escolar", rotulo: "Mobiliário escolar", cor: "#c385e0" },
  { slug: "mobiliario-corporativo", rotulo: "Mobiliário corporativo", cor: "#e085e0" },
  { slug: "mobiliario-urbano", rotulo: "Mobiliário urbano", cor: "#85e0c9" },
  { slug: "projetos", rotulo: "Projetos (arquitetura/engenharia)", cor: "#85dae0" },
  { slug: "educacao-midiatica", rotulo: "Educação midiática", cor: "#85bce0" },
  { slug: "gestao-tributaria", rotulo: "Gestão tributária", cor: "#859fe0" },
  { slug: "licenciamento-ambiental", rotulo: "Licenciamento ambiental", cor: "#8985e0" },
  { slug: "monitoramento-alunos", rotulo: "Monitoramento de alunos", cor: "#a685e0" },
  { slug: "parque-infantil", rotulo: "Parque infantil/piso emborrachado", cor: "#c385e0" },
  { slug: "reurb", rotulo: "REURB (regularização fundiária)", cor: "#e085e0" },
  { slug: "assessoria-juridica", rotulo: "Assessoria jurídica", cor: "#85e0c9" },
  { slug: "engenharia-consultiva", rotulo: "Consultoria de engenharia", cor: "#85dae0" },
  { slug: "nr1", rotulo: "NR-1 (segurança ocupacional)", cor: "#85bce0" },
  { slug: "ar-condicionado", rotulo: "Ar-condicionado", cor: "#859fe0" },
  { slug: "robotica", rotulo: "Robótica educacional", cor: "#8985e0" },
  { slug: "fotovoltaica", rotulo: "Energia fotovoltaica", cor: "#a685e0" },
  { slug: "cesta-alimentos", rotulo: "Cestas de alimentos", cor: "#c385e0" },
  { slug: "remocao-de-fios", rotulo: "Remoção de fiação irregular", cor: "#e085e0" },
  { slug: "apostilas", rotulo: "Apostilas/material didático", cor: "#85e0c9" },
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
