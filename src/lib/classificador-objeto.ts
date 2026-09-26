/**
 * Classifica o texto livre de `objetoContrato` (PNCP) numa categoria de
 * consumo municipal — usado no raio-X de consumo (2026-09-25) pra
 * responder "quando foi a última vez que esse município contratou X?".
 *
 * Vocabulário expandido em 2026-09-26 a partir da lista real de
 * licitações da própria operação (pasta do Drive "LICITAÇÕES", ~51
 * processos numerados) + categorias adicionais citadas pelo usuário —
 * é a taxonomia de negócio de verdade, não um vocabulário genérico
 * inventado. Categorias que eram nome de pasta/processo interno, não um
 * tipo de item comprável, ficaram de fora de propósito (não viram
 * categoria de consumo):
 *   - "030 Dispensa - Aprova", "040 Dispensa Conex",
 *     "049 Dispensa NucleoGov" — nome de plataforma de dispensa
 *     eletrônica usada internamente, não uma categoria de compra.
 *   - "037 Sicap" — sistema de prestação de contas, não item comprável.
 *   - "038 Boxes" — ambíguo (poderia ser box sanitário, estrutura de
 *     feira/mercado, ou outra coisa) — não incluído até confirmar o que
 *     é, pra não arriscar classificar errado.
 *
 * Não tenta ser perfeito: é um classificador heurístico, não um NLP de
 * verdade. Objeto que não bate com nenhuma palavra-chave conhecida
 * retorna `null` — melhor não classificar do que classificar errado
 * (isso alimenta uma decisão comercial de verdade, não é cosmético).
 *
 * Só frases de 2+ palavras ou termos técnicos inequívocos — nada de
 * palavra solta que também apareça como adjetivo comum em descrição de
 * item (ex.: "coloração uniforme" de fruta, "trio elétrico" de som,
 * "Secretaria de Saúde" citada só como unidade beneficiária). Cada falso
 * positivo observado ao vivo (2026-09-25, teste contra Batatais/SP)
 * virou uma keyword removida ou uma frase mais específica.
 */
const PALAVRAS_CHAVE_POR_CATEGORIA: Record<string, string[]> = {
  // Já existiam (Sprint do raio-X original)
  "material-escritorio": ["material de escritório", "material de expediente", "papelaria escolar", "papel sulfite"],
  "material-construcao": ["material de construção", "construção civil", "pavimentação asfáltica", "cimento", "argamassa"],
  "material-eletrico": ["material elétrico", "iluminação pública", "luminária", "lâmpada led"],
  "material-hospitalar": [
    "material hospitalar",
    "equipamento hospitalar",
    "mobiliário hospitalar",
    "material médico",
    "medicamento",
    "insumo hospitalar",
    "insumo médico",
    "kit estéril",
    "material estéril",
    "correlato hospitalar",
  ],
  "equipamento-ti": ["equipamento de informática", "equipamento de ti", "licenciamento de software", "computador", "notebook"],
  veiculos: [
    "locação de veículo",
    "locação de veículos",
    "veículo automotor",
    "frota municipal",
    "veículo elétrico",
    "carro elétrico",
    "aquisição de veículo",
  ],
  combustivel: ["combustível", "gasolina comum", "óleo diesel", "etanol combustível"],
  limpeza: ["material de limpeza", "limpeza e conservação", "higienização de caixa"],
  "kit-escolar": ["kit escolar", "material escolar", "uniforme escolar", "fardamento escolar"],
  uniforme: ["uniforme escolar", "uniforme profissional", "fardamento"],
  grafica: ["material gráfico", "serviço gráfico", "impressão gráfica", "impressões de"],
  "merenda-escolar": ["merenda escolar", "alimentação escolar", "gênero alimentício"],

  // Novas — direto da lista real de processos da operação (2026-09-26)
  "recuperacao-de-receitas": ["recuperação de receitas municipais", "recuperação de crédito tributário", "recuperação de créditos"],
  "seguranca-digital": ["segurança digital", "segurança da informação", "cibersegurança", "firewall corporativo"],
  videomonitoramento: ["videomonitoramento", "vídeo monitoramento", "circuito fechado de televisão", "câmeras de segurança"],
  eventos: ["organização de evento", "produção de evento", "cerimonial e recepção", "sonorização de evento"],
  festividades: ["decoração natalina", "festa junina", "festividades natalinas", "réveillon", "carnaval municipal"],
  "ovos-de-pascoa": ["ovo de páscoa", "ovos de páscoa", "chocolate de páscoa"],
  "curso-de-ingles": ["curso de inglês", "ensino de língua estrangeira", "aula de idioma"],
  modulares: ["sala modular", "container modular", "unidade escolar modular", "estrutura modular"],
  dedetizacao: ["dedetização", "controle de pragas", "desratização", "descupinização", "controle de vetores"],
  "manutencao-predial": ["manutenção predial", "manutenção de prédio público", "manutenção de próprios públicos"],
  "mobiliario-escolar": ["mobiliário escolar", "carteira escolar", "mesa e cadeira escolar"],
  "mobiliario-corporativo": ["mobiliário corporativo", "mobiliário de escritório", "estação de trabalho corporativa"],
  "mobiliario-urbano": ["mobiliário urbano", "banco de praça", "lixeira pública"],
  projetos: ["projeto arquitetônico", "projeto de engenharia", "elaboração de projeto básico", "projeto executivo"],
  "educacao-midiatica": ["plataforma de streaming educacional", "licenciamento de conteúdo audiovisual educacional", "educação midiática"],
  "gestao-tributaria": ["gestão tributária", "modernização tributária", "sistema de arrecadação municipal"],
  "licenciamento-ambiental": ["licenciamento ambiental", "estudo de impacto ambiental", "licença ambiental"],
  "monitoramento-alunos": ["monitoramento de alunos", "controle de frequência escolar", "monitoramento estudantil"],
  "parque-infantil": ["piso emborrachado", "parque infantil", "playground", "parque infantil inclusivo"],
  reurb: ["regularização fundiária urbana", "reurb"],
  "assessoria-juridica": ["assessoria jurídica", "consultoria jurídica especializada"],
  "engenharia-consultiva": ["assessoria técnica de engenharia", "consultoria em engenharia"],
  nr1: ["gerenciamento de riscos ocupacionais", "programa de gerenciamento de riscos", " nr-1", " nr1 "],
  "ar-condicionado": ["ar condicionado", "climatização de ambiente"],
  robotica: ["robótica educacional", "kit de robótica"],
  fotovoltaica: ["sistema fotovoltaico", "energia solar fotovoltaica", "usina solar", "placa solar"],
  "cesta-alimentos": ["cesta de alimentos", "cesta básica", "kit de alimentos"],
  "remocao-de-fios": ["remoção de fiação irregular", "remoção de cabeamento", "fiação aérea irregular"],
  apostilas: ["apostila", "material didático apostilado", "sistema de apostilamento"],
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
  "recuperacao-de-receitas": "Recuperação de receitas",
  "seguranca-digital": "Segurança digital",
  videomonitoramento: "Videomonitoramento",
  eventos: "Eventos",
  festividades: "Festividades",
  "ovos-de-pascoa": "Ovos de Páscoa",
  "curso-de-ingles": "Curso de inglês",
  modulares: "Construções modulares",
  dedetizacao: "Controle de pragas/dedetização",
  "manutencao-predial": "Manutenção predial",
  "mobiliario-escolar": "Mobiliário escolar",
  "mobiliario-corporativo": "Mobiliário corporativo",
  "mobiliario-urbano": "Mobiliário urbano",
  projetos: "Projetos (arquitetura/engenharia)",
  "educacao-midiatica": "Educação midiática",
  "gestao-tributaria": "Gestão tributária",
  "licenciamento-ambiental": "Licenciamento ambiental",
  "monitoramento-alunos": "Monitoramento de alunos",
  "parque-infantil": "Parque infantil/piso emborrachado",
  reurb: "REURB (regularização fundiária)",
  "assessoria-juridica": "Assessoria jurídica",
  "engenharia-consultiva": "Consultoria de engenharia",
  nr1: "NR-1 (segurança ocupacional)",
  "ar-condicionado": "Ar-condicionado",
  robotica: "Robótica educacional",
  fotovoltaica: "Energia fotovoltaica",
  "cesta-alimentos": "Cestas de alimentos",
  "remocao-de-fios": "Remoção de fiação irregular",
  apostilas: "Apostilas/material didático",
};
