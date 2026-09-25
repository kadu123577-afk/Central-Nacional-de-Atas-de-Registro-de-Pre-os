/**
 * Classifica o texto livre de `objetoContrato` (PNCP) numa categoria do
 * vocabulário fixo de `src/lib/categorias.ts`, por palavra-chave —
 * usado no raio-X de consumo (2026-09-25) pra responder "quando foi a
 * última vez que esse município contratou X?".
 *
 * Não tenta ser perfeito: é um classificador heurístico, não um NLP de
 * verdade. Objeto que não bate com nenhuma palavra-chave conhecida
 * retorna `null` — melhor não classificar do que classificar errado
 * (isso alimenta uma decisão comercial de verdade, não é cosmético).
 */
/**
 * Só frases de 2+ palavras ou termos técnicos inequívocos — nada de
 * palavra solta que também apareça como adjetivo comum em descrição de
 * item (ex.: "coloração uniforme" de fruta, "trio elétrico" de som,
 * "Secretaria de Saúde" citada só como unidade beneficiária). Cada falso
 * positivo observado ao vivo (2026-09-25, teste contra Batatais/SP)
 * virou uma keyword removida ou uma frase mais específica.
 */
const PALAVRAS_CHAVE_POR_CATEGORIA: Record<string, string[]> = {
  "material-escritorio": ["material de escritório", "material de expediente", "papelaria escolar", "papel sulfite"],
  "material-construcao": ["material de construção", "construção civil", "pavimentação asfáltica", "cimento", "argamassa"],
  "material-eletrico": ["material elétrico", "iluminação pública", "luminária", "lâmpada led"],
  "material-hospitalar": [
    "material hospitalar",
    "equipamento hospitalar",
    "material médico",
    "medicamento",
    "insumo hospitalar",
    "insumo médico",
  ],
  "equipamento-ti": ["equipamento de informática", "equipamento de ti", "licenciamento de software", "computador", "notebook"],
  veiculos: ["locação de veículo", "locação de veículos", "veículo automotor", "frota municipal"],
  combustivel: ["combustível", "gasolina comum", "óleo diesel", "etanol combustível"],
  limpeza: ["material de limpeza", "limpeza e conservação", "higienização de caixa"],
  // Categorias fora do vocabulário fixo de Ata.categoria, mas citadas
  // explicitamente pelo usuário — mantidas como categorias próprias do
  // raio-X (não precisam existir em CATEGORIAS_ATAS pra isso).
  "kit-escolar": ["kit escolar", "material escolar", "uniforme escolar", "fardamento escolar"],
  uniforme: ["uniforme escolar", "uniforme profissional", "fardamento"],
  grafica: ["material gráfico", "serviço gráfico", "impressão gráfica", "impressões de"],
  "merenda-escolar": ["merenda escolar", "alimentação escolar", "gênero alimentício"],
};

export function classificarObjeto(objeto: string): string | null {
  const texto = objeto.toLowerCase();
  for (const [categoria, palavras] of Object.entries(PALAVRAS_CHAVE_POR_CATEGORIA)) {
    if (palavras.some((p) => texto.includes(p))) {
      return categoria;
    }
  }
  return null;
}

export const ROTULO_CATEGORIA_CONSUMO: Record<string, string> = {
  "material-escritorio": "Material de escritório",
  "material-construcao": "Material de construção",
  "material-eletrico": "Material elétrico",
  "material-hospitalar": "Material/equipamento hospitalar",
  "equipamento-ti": "Equipamento de TI",
  veiculos: "Veículos e frota",
  combustivel: "Combustível",
  limpeza: "Limpeza e conservação",
  "kit-escolar": "Kit escolar",
  uniforme: "Uniforme/fardamento",
  grafica: "Material gráfico",
  "merenda-escolar": "Merenda escolar",
};
