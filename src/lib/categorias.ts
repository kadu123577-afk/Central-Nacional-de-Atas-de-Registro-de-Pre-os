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
   * conferidos com WCAG (mínimo 4.5:1 como texto sobre --cor-superficie
   * clara do tema do site — out/2026).
   */
  cor: string;
}

export const CATEGORIAS_ATAS: readonly Categoria[] = [
  { slug: "material-escritorio", rotulo: "Material de escritório", rotuloCurto: "Escritório", cor: "#0f766e" },
  { slug: "material-construcao", rotulo: "Material de construção", rotuloCurto: "Construção", cor: "#0e7490" },
  { slug: "material-eletrico", rotulo: "Material elétrico", rotuloCurto: "Elétrico", cor: "#1d5fa0" },
  { slug: "material-hospitalar", rotulo: "Material hospitalar", rotuloCurto: "Hospitalar", cor: "#3b4fc4" },
  { slug: "equipamento-ti", rotulo: "Equipamento de TI", rotuloCurto: "Equip. de TI", cor: "#5b3fc9" },
  { slug: "veiculos", rotulo: "Veículos e frota", rotuloCurto: "Veículos", cor: "#7432c2" },
  { slug: "combustivel", rotulo: "Combustível", rotuloCurto: "Combustível", cor: "#8f2aa8" },
  { slug: "limpeza", rotulo: "Limpeza e conservação", rotuloCurto: "Limpeza", cor: "#a3238f" },
  // Expandido em 2026-09-26 — mesmo vocabulário (mesmos slugs) do
  // classificador do raio-X de consumo (src/lib/classificador-objeto.ts),
  // pra uma ata cadastrada aqui poder ser cruzada com a necessidade real
  // de um município ("a gente tem uma ata de gráfica — qual município
  // precisa dela?"). Cor gerada ciclando a mesma paleta de reserva
  // (não é prático curar manualmente uma cor WCAG única pra cada uma das
  // ~30 categorias novas — o hash-fallback de corDaCategoria já cobre
  // isso com segurança, aqui só listamos pra aparecerem nos selects).
  { slug: "kit-escolar", rotulo: "Kit escolar", cor: "#0f766e" },
  { slug: "uniforme", rotulo: "Uniforme/fardamento", cor: "#0e7490" },
  { slug: "grafica", rotulo: "Material gráfico", cor: "#1d5fa0" },
  { slug: "merenda-escolar", rotulo: "Merenda escolar", cor: "#3b4fc4" },
  { slug: "recuperacao-de-receitas", rotulo: "Recuperação de receitas", cor: "#5b3fc9" },
  { slug: "seguranca-digital", rotulo: "Segurança digital", cor: "#7432c2" },
  { slug: "videomonitoramento", rotulo: "Videomonitoramento", cor: "#8f2aa8" },
  { slug: "eventos", rotulo: "Eventos", cor: "#a3238f" },
  { slug: "festividades", rotulo: "Festividades", cor: "#0f766e" },
  { slug: "ovos-de-pascoa", rotulo: "Ovos de Páscoa", cor: "#0e7490" },
  { slug: "curso-de-ingles", rotulo: "Curso de inglês", cor: "#1d5fa0" },
  { slug: "modulares", rotulo: "Construções modulares", cor: "#3b4fc4" },
  { slug: "dedetizacao", rotulo: "Controle de pragas/dedetização", cor: "#5b3fc9" },
  { slug: "manutencao-predial", rotulo: "Manutenção predial", cor: "#7432c2" },
  { slug: "mobiliario-escolar", rotulo: "Mobiliário escolar", cor: "#8f2aa8" },
  { slug: "mobiliario-corporativo", rotulo: "Mobiliário corporativo", cor: "#a3238f" },
  { slug: "mobiliario-urbano", rotulo: "Mobiliário urbano", cor: "#0f766e" },
  { slug: "projetos", rotulo: "Projetos (arquitetura/engenharia)", cor: "#0e7490" },
  { slug: "educacao-midiatica", rotulo: "Educação midiática", cor: "#1d5fa0" },
  { slug: "gestao-tributaria", rotulo: "Gestão tributária", cor: "#3b4fc4" },
  { slug: "licenciamento-ambiental", rotulo: "Licenciamento ambiental", cor: "#5b3fc9" },
  { slug: "monitoramento-alunos", rotulo: "Monitoramento de alunos", cor: "#7432c2" },
  { slug: "parque-infantil", rotulo: "Parque infantil/piso emborrachado", cor: "#8f2aa8" },
  { slug: "reurb", rotulo: "REURB (regularização fundiária)", cor: "#a3238f" },
  { slug: "assessoria-juridica", rotulo: "Assessoria jurídica", cor: "#0f766e" },
  { slug: "engenharia-consultiva", rotulo: "Consultoria de engenharia", cor: "#0e7490" },
  { slug: "nr1", rotulo: "NR-1 (segurança ocupacional)", cor: "#1d5fa0" },
  { slug: "ar-condicionado", rotulo: "Ar-condicionado", cor: "#3b4fc4" },
  { slug: "robotica", rotulo: "Robótica educacional", cor: "#5b3fc9" },
  { slug: "fotovoltaica", rotulo: "Energia fotovoltaica", cor: "#7432c2" },
  { slug: "cesta-alimentos", rotulo: "Cestas de alimentos", cor: "#8f2aa8" },
  { slug: "remocao-de-fios", rotulo: "Remoção de fiação irregular", cor: "#a3238f" },
  { slug: "apostilas", rotulo: "Apostilas/material didático", cor: "#0f766e" },
];

export type CategoriaAta = (typeof CATEGORIAS_ATAS)[number];

/** Paleta de reserva, na mesma família de tons, pra quando uma categoria
 * nova (fora da lista fixa acima) precisar de uma cor — escolhida de
 * forma determinística (mesmo texto sempre cai na mesma cor), sem
 * precisar editar este arquivo toda vez que um tema novo aparecer. */
const CORES_RESERVA = ["#0f766e", "#0e7490", "#1d5fa0", "#3b4fc4", "#5b3fc9", "#7432c2", "#8f2aa8", "#a3238f"];

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

/**
 * `Ata.categoria` guarda o slug ("material-construcao"), não o rótulo
 * legível ("Material de construção") — achado real (2026-10-01): várias
 * telas públicas (catálogo, detalhe da ata) mostravam o slug cru pro
 * usuário final. Esta função resolve de volta pro rótulo; se não achar
 * (categoria desconhecida), devolve o valor original em vez de quebrar.
 */
export function rotuloDaCategoria(rotuloOuSlug: string): string {
  const conhecida = CATEGORIAS_ATAS.find(
    (c) => c.rotulo === rotuloOuSlug || c.slug === rotuloOuSlug,
  );
  return conhecida?.rotulo ?? rotuloOuSlug;
}

/**
 * O inverso — texto digitado livremente numa busca (rótulo, ou o
 * próprio slug) vira o slug exato, se bater com uma categoria
 * conhecida. Usado pra filtro de banco, já que `Ata.categoria` só tem o
 * slug — sem isso, buscar "material de construção" no catálogo público
 * não encontrava nada salvo como "material-construcao".
 */
export function resolverSlugCategoria(texto: string): string | null {
  const alvo = texto.trim().toLowerCase();
  const conhecida = CATEGORIAS_ATAS.find(
    (c) => c.rotulo.toLowerCase() === alvo || c.slug.toLowerCase() === alvo || c.rotuloCurto?.toLowerCase() === alvo,
  );
  return conhecida?.slug ?? null;
}
