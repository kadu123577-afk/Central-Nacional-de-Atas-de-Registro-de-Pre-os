/**
 * Categorias da vitrine pública. O designer trabalha com 12 grupos (cada um
 * com um símbolo); o sistema tem cerca de 50 categorias finas
 * (src/lib/categorias.ts). Este arquivo liga uma coisa à outra.
 *
 * Duas adições em relação ao pacote do designer, para nenhuma ata ficar
 * invisível: "servicos" (consultorias e serviços técnicos) e "outros" (atas
 * sem categoria, como as importadas do PNCP ainda não classificadas).
 */

export interface GrupoCategoria {
  id: string;
  nome: string;
}

export const GRUPOS: readonly GrupoCategoria[] = [
  { id: "saude", nome: "Medicamentos e insumos de saúde" },
  { id: "alimentos", nome: "Alimentação escolar" },
  { id: "informatica", nome: "Informática e tecnologia" },
  { id: "escritorio", nome: "Material de escritório" },
  { id: "mobiliario", nome: "Mobiliário" },
  { id: "limpeza", nome: "Limpeza e higiene" },
  { id: "veiculos", nome: "Veículos e máquinas" },
  { id: "iluminacao", nome: "Iluminação e energia" },
  { id: "obras", nome: "Manutenção predial e obras" },
  { id: "uniformes", nome: "Uniformes, EPI e kits escolares" },
  { id: "pneus", nome: "Pneus e peças automotivas" },
  { id: "eventos", nome: "Estruturas para eventos" },
  { id: "servicos", nome: "Serviços especializados" },
  { id: "outros", nome: "Outros objetos" },
];

/** slug do sistema (Ata.categoria) → id do grupo. */
const GRUPO_POR_SLUG: Record<string, string> = {
  "material-hospitalar": "saude",
  "merenda-escolar": "alimentos",
  "cesta-alimentos": "alimentos",
  "ovos-de-pascoa": "alimentos",
  "equipamento-ti": "informatica",
  "seguranca-digital": "informatica",
  videomonitoramento: "informatica",
  "monitoramento-alunos": "informatica",
  robotica: "informatica",
  "material-escritorio": "escritorio",
  grafica: "escritorio",
  apostilas: "escritorio",
  "mobiliario-escolar": "mobiliario",
  "mobiliario-corporativo": "mobiliario",
  "mobiliario-urbano": "mobiliario",
  limpeza: "limpeza",
  dedetizacao: "limpeza",
  veiculos: "veiculos",
  combustivel: "veiculos",
  "material-eletrico": "iluminacao",
  fotovoltaica: "iluminacao",
  "remocao-de-fios": "iluminacao",
  "material-construcao": "obras",
  "manutencao-predial": "obras",
  modulares: "obras",
  "parque-infantil": "obras",
  "ar-condicionado": "obras",
  uniforme: "uniformes",
  "kit-escolar": "uniformes",
  eventos: "eventos",
  festividades: "eventos",
  "recuperacao-de-receitas": "servicos",
  "curso-de-ingles": "servicos",
  projetos: "servicos",
  "educacao-midiatica": "servicos",
  "gestao-tributaria": "servicos",
  "licenciamento-ambiental": "servicos",
  reurb: "servicos",
  "assessoria-juridica": "servicos",
  "engenharia-consultiva": "servicos",
  nr1: "servicos",
};

export function grupoDaCategoria(slug: string | null | undefined): string {
  if (!slug) return "outros";
  return GRUPO_POR_SLUG[slug] ?? "outros";
}

export function nomeDoGrupo(id: string): string {
  return GRUPOS.find((g) => g.id === id)?.nome ?? "Outros objetos";
}

export function grupoValido(id: string): boolean {
  return GRUPOS.some((g) => g.id === id);
}

/** Slugs do sistema que pertencem a um grupo (vazio para "outros"). */
export function slugsDoGrupo(id: string): string[] {
  return Object.entries(GRUPO_POR_SLUG)
    .filter(([, g]) => g === id)
    .map(([slug]) => slug);
}

/** Todos os slugs que têm grupo definido (para achar o "resto" do grupo "outros"). */
export const TODOS_OS_SLUGS_MAPEADOS: string[] = Object.keys(GRUPO_POR_SLUG);
