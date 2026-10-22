/**
 * Kit de minutas da adesão — Projeto RNA, etapa 3 (2026-10-21).
 *
 * A plataforma intermedia adesões a atas de registro de preços (Lei
 * 14.133/2021, art. 86), mas quem decide é o órgão aderente, o órgão
 * gerenciador e o fornecedor. Estes modelos só ajudam o órgão aderente a
 * começar os papéis: tudo que a plataforma não sabe vira um marcador visível
 * `[PREENCHER: ...]`, e nada aqui afirma que o órgão está regular, que a
 * adesão dispensa alguma etapa ou que haverá resultado.
 *
 * Funções puras — sem banco, sem rede, sem relógio: quem chama passa os dados
 * da oportunidade e a data de hoje. A página (src/app/minutas) só lê o banco e
 * mostra o que sai daqui. Só entram referências legais que já constam no
 * checklist de src/lib/instrucao-adesao.ts: Lei 14.133/2021, arts. 86, 23, 53
 * e 94.
 */

import { rotuloDaCategoria } from "./categorias";
import {
  TEXTO_DECLARACAO,
  VERSAO_DECLARACAO,
  condicaoParaAderiu,
  normalizarJustificativa,
  normalizarMapa,
  resumirInstrucao,
  textoDeclaracao,
} from "./instrucao-adesao";
import { TEXTO_AVISO_VANTAJOSIDADE, type ResumoAta } from "./vantajosidade";

export const FUSO_MINUTAS = "America/Sao_Paulo";

/** Primeira linha de TODA minuta (é sempre `paragrafos[0]`). */
export const AVISO_MINUTA =
  "Modelo para adaptação. A instrução do processo e a decisão de aderir são do órgão aderente; revise com o assessoramento jurídico do órgão.";

export const CHAVES_MINUTAS = [
  "formalizacao-demanda",
  "justificativa-vantagem",
  "oficio-gerenciador",
  "oficio-fornecedor",
  "declaracao-conformidade",
] as const;

export type ChaveMinuta = (typeof CHAVES_MINUTAS)[number];

export type Minuta = {
  chave: ChaveMinuta;
  titulo: string;
  /** O primeiro é sempre AVISO_MINUTA. Quebra de linha dentro do texto (\n) vale como linha nova. */
  paragrafos: string[];
};

/** A declaração interna de conformidade que já foi registrada (InstrucaoAdesao). */
export type DeclaracaoRegistrada = {
  /** InstrucaoAdesao.declaracaoEm. Sem data válida, a declaração conta como não registrada. */
  em?: Date | string | null;
  /** InstrucaoAdesao.declaracaoPorTipo: "admin" ou "vendedor". */
  porTipo?: string | null;
  /** Nome de quem registrou (a página busca pelo declaracaoPorId). */
  porNome?: string | null;
  /** InstrucaoAdesao.declaracaoExcecao. */
  excecao?: string | null;
  /** InstrucaoAdesao.declaracaoVersao. */
  versao?: number | null;
};

/**
 * Comparativo AUXILIAR de preços da ata (src/lib/vantajosidade-db.ts), só o que
 * a minuta de justificativa da vantagem usa: o resumo e quando os preços foram
 * consultados. A conclusão sobre a vantagem é sempre do órgão aderente.
 */
export type ComparativoDaMinuta = {
  resumo: Pick<
    ResumoAta,
    "itensTotal" | "itensComReferencia" | "compativeis" | "acima" | "abaixo" | "semReferencia" | "pesoAcima"
  >;
  /** Primeira e última consulta entre os itens comparados (ReferenciaPreco.consultadoEm). */
  consultadoEm?: { maisAntiga?: Date | string | null; maisRecente?: Date | string | null } | null;
};

export type DadosMinutas = {
  /** Data de hoje (a página passa new Date()); o fuso de exibição é America/Sao_Paulo. */
  hoje: Date;
  /** EntidadeAlvo da oportunidade. */
  orgaoAderente: { nome?: string | null; uf?: string | null };
  ata: {
    numero?: string | null;
    objeto?: string | null;
    /** Slug ou rótulo da categoria (Ata.categoria). */
    categoria?: string | null;
    /** Ata.dataVigenciaFim: dia guardado à meia-noite UTC. */
    vigenciaFim?: Date | string | null;
  };
  orgaoGerenciador: { nome?: string | null; uf?: string | null };
  fornecedor: { razaoSocial?: string | null };
  /** InstrucaoAdesao.itens, do jeito que veio do banco (lido com normalizarMapa). */
  itens?: unknown;
  /** Presente quando a oportunidade já tem InstrucaoAdesao com declaração. */
  declaracao?: DeclaracaoRegistrada | null;
  /**
   * Comparativo auxiliar de preços da ata. Quando há ao menos um item comparado,
   * a justificativa da vantagem ganha um parágrafo de referência auxiliar; sem
   * ele, o texto é o de sempre.
   */
  comparativo?: ComparativoDaMinuta | null;
};

// ---------------------------------------------------------------------------
// Marcadores e formatação
// ---------------------------------------------------------------------------

/** O que a plataforma não sabe: aparece destacado e impresso entre colchetes. */
export function marcador(descricao: string): string {
  return `[PREENCHER: ${descricao}]`;
}

const MARCADOR_SITUACAO_NAO_REGISTRADA = "[AINDA NÃO REGISTRADA NA PLATAFORMA]";

const REGEX_MARCADOR = /\[(?:PREENCHER:|AINDA NÃO)[^\]\n]*\]/g;

export type TrechoMinuta = { texto: string; marcador: boolean };

/**
 * Parte um parágrafo em trechos, separando os marcadores `[PREENCHER: ...]`
 * (e o `[AINDA NÃO REGISTRADA ...]`) do resto, para a tela destacá-los.
 * Juntar os `texto` de volta devolve o parágrafo original.
 */
export function dividirMarcadores(texto: string): TrechoMinuta[] {
  const trechos: TrechoMinuta[] = [];
  let fim = 0;
  for (const achado of texto.matchAll(REGEX_MARCADOR)) {
    const inicio = achado.index ?? 0;
    if (inicio > fim) trechos.push({ texto: texto.slice(fim, inicio), marcador: false });
    trechos.push({ texto: achado[0], marcador: true });
    fim = inicio + achado[0].length;
  }
  if (fim < texto.length) trechos.push({ texto: texto.slice(fim), marcador: false });
  return trechos;
}

/**
 * Os modelos escrevem os blocos numerados como "1. Objeto\n<texto>". Separa a
 * primeira linha quando ela é só um subtítulo (número, ponto e título curto
 * sem ponto final), para a tela pôr em destaque. Os itens numerados dos
 * ofícios ("1. O órgão tem interesse...") são frases e ficam inteiros.
 */
export function separarSubtitulo(paragrafo: string): { subtitulo: string | null; corpo: string } {
  const quebra = paragrafo.indexOf("\n");
  if (quebra === -1) return { subtitulo: null, corpo: paragrafo };
  const primeira = paragrafo.slice(0, quebra);
  if (/^\d+\. [^\n]{1,70}$/.test(primeira) && !/[.;:,]$/.test(primeira)) {
    return { subtitulo: primeira, corpo: paragrafo.slice(quebra + 1) };
  }
  return { subtitulo: null, corpo: paragrafo };
}

/** Texto em uma linha só, sem espaços nas pontas; qualquer coisa que não seja texto vira "". */
function limpo(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
}

function ou(valor: unknown, descricao: string): string {
  return limpo(valor) || marcador(descricao);
}

/** "Município de X (GO)"; sem UF, o marcador ocupa o lugar dela. */
function comUf(nome: unknown, uf: unknown, descricaoNome: string, descricaoUf: string): string {
  const sigla = limpo(uf);
  const ufFinal = sigla ? (sigla.length === 2 ? sigla.toUpperCase() : sigla) : marcador(descricaoUf);
  return `${ou(nome, descricaoNome)} (${ufFinal})`;
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * "21 de outubro de 2026", no fuso de São Paulo (o servidor pode estar em UTC:
 * às 22h de 21/10 em São Paulo já é 22/10 em UTC). Dia 1 sai "1º". Data
 * inválida vira marcador.
 */
export function dataPorExtenso(data: Date): string {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) return marcador("data");
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO_MINUTAS,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(data);
  const numero = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  const dia = numero("day");
  const mes = numero("month");
  const ano = numero("year");
  if (!dia || !mes || !ano) return marcador("data");
  return `${dia === 1 ? "1º" : dia} de ${MESES[mes - 1]} de ${ano}`;
}

/**
 * Vigência da ata em dd/mm/aaaa. O banco guarda só o dia, à meia-noite UTC,
 * então o dia é lido em UTC (no fuso de São Paulo recuaria um dia).
 */
export function formatarVigencia(valor: Date | string | null | undefined): string {
  const data = valor instanceof Date ? valor : typeof valor === "string" && valor.trim() ? new Date(valor) : null;
  if (!data || Number.isNaN(data.getTime())) return marcador("vigência da ata");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${data.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// Dados comuns a todas as minutas
// ---------------------------------------------------------------------------

type Contexto = {
  data: string;
  /** "Município de X (GO)". */
  aderente: string;
  /** Só o nome, sem UF. */
  aderenteNome: string;
  ata: string;
  objeto: string;
  categoria: string;
  vigencia: string;
  /** "Prefeitura Y (UF)". */
  gerenciador: string;
  fornecedor: string;
};

function montarContexto(dados: DadosMinutas): Contexto {
  const categoria = limpo(dados.ata?.categoria);
  return {
    data: dataPorExtenso(dados.hoje),
    aderente: comUf(dados.orgaoAderente?.nome, dados.orgaoAderente?.uf, "nome do órgão aderente", "UF do órgão aderente"),
    aderenteNome: ou(dados.orgaoAderente?.nome, "nome do órgão aderente"),
    ata: ou(dados.ata?.numero, "número da ata"),
    objeto: ou(dados.ata?.objeto, "objeto da ata"),
    categoria: categoria ? rotuloDaCategoria(categoria) : marcador("categoria da ata"),
    vigencia: formatarVigencia(dados.ata?.vigenciaFim),
    gerenciador: comUf(
      dados.orgaoGerenciador?.nome,
      dados.orgaoGerenciador?.uf,
      "nome do órgão gerenciador",
      "UF do órgão gerenciador",
    ),
    fornecedor: ou(dados.fornecedor?.razaoSocial, "razão social do fornecedor"),
  };
}

function linhas(...partes: string[]): string {
  return partes.join("\n");
}

function localEData(c: Contexto): string {
  return `${marcador("local")}, ${c.data}.`;
}

function assinatura(c: Contexto): string {
  return linhas("______________________________", marcador("nome e cargo de quem assina"), c.aderente);
}

function dadosDaAta(c: Contexto): string {
  return linhas(
    `Ata de registro de preços nº ${c.ata}`,
    `Objeto da ata: ${c.objeto}`,
    `Categoria da ata: ${c.categoria}`,
    `Órgão gerenciador: ${c.gerenciador}`,
    `Fornecedor registrado: ${c.fornecedor}`,
    `Vigência da ata até: ${c.vigencia}`,
  );
}

const LIMITES_ART_86 = "limites do art. 86 (50% por órgão aderente e 200% no total por item)";

// ---------------------------------------------------------------------------
// As cinco minutas
// ---------------------------------------------------------------------------

function formalizacaoDaDemanda(c: Contexto): Minuta {
  return {
    chave: "formalizacao-demanda",
    titulo: "Formalização da demanda (modelo)",
    paragrafos: [
      AVISO_MINUTA,
      `Órgão aderente: ${c.aderente}`,
      linhas(
        "1. Objeto",
        `Contratação, por adesão à ata de registro de preços abaixo, nos termos do art. 86 da Lei 14.133/2021, de: ${marcador("itens da ata que o órgão pretende contratar, com a descrição de cada um")}`,
      ),
      dadosDaAta(c),
      linhas(
        "2. Justificativa da necessidade",
        marcador("descreva a necessidade do órgão que a contratação vai atender, quem a pediu e por que ela surgiu agora"),
      ),
      linhas(
        "3. Quantidade estimada",
        marcador("quantidade estimada de cada item, com a unidade de medida e a forma como o número foi calculado"),
        `A quantidade será conferida, item por item, com os ${LIMITES_ART_86}.`,
      ),
      linhas(
        "4. Responsável pela demanda",
        `Nome: ${marcador("nome do responsável")}`,
        `Cargo e setor: ${marcador("cargo e setor")}`,
      ),
      localEData(c),
      assinatura(c),
    ],
  };
}

function contadorValido(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : 0;
}

function dataValida(valor: Date | string | null | undefined): Date | null {
  const data = valor instanceof Date ? valor : typeof valor === "string" && valor.trim() ? new Date(valor) : null;
  return data && !Number.isNaN(data.getTime()) ? data : null;
}

/** "em 22 de outubro de 2026" ou "entre 1º de outubro de 2026 e 22 de outubro de 2026" (fuso de São Paulo). */
function quandoForamConsultados(consultadoEm: ComparativoDaMinuta["consultadoEm"]): string {
  const antiga = dataValida(consultadoEm?.maisAntiga);
  const recente = dataValida(consultadoEm?.maisRecente);
  const primeira = antiga ?? recente;
  const ultima = recente ?? antiga;
  if (!primeira || !ultima) return `em ${marcador("data da consulta")}`;
  const de = dataPorExtenso(primeira);
  const ate = dataPorExtenso(ultima);
  return de === ate ? `em ${de}` : `entre ${de} e ${ate}`;
}

/**
 * Parágrafo de referência AUXILIAR na justificativa da vantagem: o resumo do
 * comparativo da plataforma, a data da consulta e o aviso-padrão. Não afirma
 * que o preço é vantajoso nem que algo foi comprovado: a conclusão é do órgão
 * aderente e fica como marcador. Sem nenhum item comparado, não há parágrafo.
 */
function paragrafoReferenciaAuxiliar(comparativo: ComparativoDaMinuta | null | undefined): string | null {
  const resumo = comparativo?.resumo;
  if (!resumo) return null;
  const comparados = contadorValido(resumo.itensComReferencia);
  if (comparados === 0) return null;
  const total = Math.max(contadorValido(resumo.itensTotal), comparados);
  const acima = contadorValido(resumo.acima);
  const abaixo = contadorValido(resumo.abaixo);
  const pesoAcima = resumo.pesoAcima;

  const partes: string[] = [
    `Referência auxiliar da plataforma: ${comparados} de ${total} ${total === 1 ? "item" : "itens"} da ata ${comparados === 1 ? "foi comparado" : "foram comparados"} com preços de contratações públicas consultados no Compras.gov.br ${quandoForamConsultados(comparativo?.consultadoEm)}.`,
    `Compatíveis com os preços consultados: ${contadorValido(resumo.compativeis)}. Acima dos preços consultados: ${acima}. Abaixo dos preços consultados: ${abaixo}. Sem comparação (sem código do catálogo, poucos preços consultados ou unidade diferente): ${contadorValido(resumo.semReferencia)}.`,
  ];
  if (acima > 0 && typeof pesoAcima === "number" && Number.isFinite(pesoAcima) && pesoAcima >= 0) {
    const percentual = pesoAcima.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    partes.push(
      `Os itens acima dos preços consultados somam ${percentual}% do valor dos itens comparados (preço registrado multiplicado pela quantidade registrada).`,
    );
  }
  if (abaixo > 0) {
    partes.push("Preço abaixo dos preços consultados também merece conferência: pode indicar item ou unidade diferente do pesquisado.");
  }
  partes.push(TEXTO_AVISO_VANTAJOSIDADE);
  partes.push(
    `Avaliação do órgão sobre esta referência: ${marcador(
      "avaliação do órgão sobre a comparação acima e sobre a pesquisa de preços do próprio órgão, com a justificativa para os itens acima ou abaixo dos preços consultados, se houver",
    )}`,
  );
  return linhas(...partes);
}

function justificativaDaVantagem(c: Contexto, comparativo?: ComparativoDaMinuta | null): Minuta {
  const referenciaAuxiliar = paragrafoReferenciaAuxiliar(comparativo);
  return {
    chave: "justificativa-vantagem",
    titulo: "Justificativa da vantagem da adesão (modelo)",
    paragrafos: [
      AVISO_MINUTA,
      `Órgão aderente: ${c.aderente}`,
      linhas("1. Ata de referência", "Adesão pretendida nos termos do art. 86 da Lei 14.133/2021, à ata a seguir.", dadosDaAta(c)),
      linhas(
        "2. Comparação com a pesquisa de preços (art. 23)",
        "A pesquisa de preços do órgão aderente, feita conforme o art. 23, é comparada abaixo com os preços registrados na ata, item por item.",
        marcador(
          "para cada item, o preço registrado na ata, os preços pesquisados, as fontes e as datas da pesquisa e a diferença encontrada",
        ),
      ),
      ...(referenciaAuxiliar ? [referenciaAuxiliar] : []),
      linhas(
        "3. Vantagem da adesão",
        marcador(
          "explique por que aderir à ata é mais vantajoso para o órgão do que fazer uma contratação própria, com base na comparação acima e na necessidade descrita na formalização da demanda",
        ),
      ),
      linhas("4. Conclusão", marcador("conclusão do órgão sobre a vantagem da adesão")),
      linhas(
        "5. Encaminhamento",
        "Esta justificativa será juntada ao processo e encaminhada ao assessoramento jurídico do órgão, para o parecer de que trata o art. 53, e à autoridade competente, para decisão.",
      ),
      localEData(c),
      assinatura(c),
    ],
  };
}

function oficioAoGerenciador(c: Contexto): Minuta {
  return {
    chave: "oficio-gerenciador",
    titulo: "Ofício ao órgão gerenciador — pedido de anuência",
    paragrafos: [
      AVISO_MINUTA,
      `Ofício nº ${marcador("número e ano do ofício")}`,
      localEData(c),
      linhas(`Destinatário: ${c.gerenciador}`, `A/C: ${marcador("nome e cargo da autoridade ou do setor responsável pela ata")}`),
      `Assunto: pedido de anuência para adesão à ata de registro de preços nº ${c.ata}.`,
      `Senhor(a) ${marcador("cargo da autoridade")},`,
      linhas(
        `1. O órgão aderente, ${c.aderente}, tem interesse em aderir à ata de registro de preços nº ${c.ata}, gerenciada por esse órgão, nos termos do art. 86 da Lei 14.133/2021.`,
        `Dados da ata considerados pelo órgão aderente: objeto: ${c.objeto}; categoria: ${c.categoria}; fornecedor registrado: ${c.fornecedor}; vigência até: ${c.vigencia}.`,
      ),
      `2. A adesão atenderá à necessidade descrita na formalização da demanda do órgão aderente: ${marcador("resumo da necessidade, dos itens e das quantidades pretendidas")}.`,
      `3. Solicitamos a anuência desse órgão gerenciador à adesão. Solicitamos também que informe o saldo de cada item na ata e confirme a vigência e os demais dados acima, para que o órgão aderente confira os ${LIMITES_ART_86}.`,
      "4. A decisão sobre a anuência cabe a esse órgão gerenciador. A adesão só será formalizada pelo órgão aderente depois da anuência e das demais etapas da instrução do processo.",
      "Atenciosamente,",
      assinatura(c),
    ],
  };
}

function oficioAoFornecedor(c: Contexto): Minuta {
  return {
    chave: "oficio-fornecedor",
    titulo: "Ofício ao fornecedor — pedido de aceite",
    paragrafos: [
      AVISO_MINUTA,
      `Ofício nº ${marcador("número e ano do ofício")}`,
      localEData(c),
      linhas(`À empresa ${c.fornecedor}`, `A/C: ${marcador("nome e cargo do responsável da empresa pela ata")}`),
      `Assunto: pedido de aceite para fornecimento ao órgão aderente ${c.aderenteNome} por adesão à ata de registro de preços nº ${c.ata}.`,
      "Prezados senhores,",
      linhas(
        `1. O órgão aderente, ${c.aderente}, tem interesse em aderir à ata de registro de preços nº ${c.ata}, gerenciada pelo órgão ${c.gerenciador}, da qual essa empresa é fornecedora registrada, nos termos do art. 86 da Lei 14.133/2021.`,
        `Objeto da ata: ${c.objeto}; vigência até: ${c.vigencia}.`,
      ),
      `2. Itens e quantidades pretendidos: ${marcador("itens e quantidades que o órgão pretende contratar, conforme a formalização da demanda")}.`,
      "3. Solicitamos o aceite dessa empresa para fornecer ao órgão aderente nas condições da ata, sem prejuízo dos compromissos já assumidos na ata, perante o órgão gerenciador e os demais órgãos que a utilizam.",
      `4. O aceite é uma decisão da empresa. Prazo para resposta: ${marcador("prazo, se o órgão quiser indicar um")}. Informamos que a adesão ainda depende da anuência do órgão gerenciador e das demais etapas da instrução do processo pelo órgão aderente.`,
      "5. Se a adesão for formalizada, a contratação será divulgada no Portal Nacional de Contratações Públicas (PNCP), conforme o art. 94.",
      "Atenciosamente,",
      assinatura(c),
    ],
  };
}

function perfilDeQuemRegistrou(tipo: unknown): string {
  if (tipo === "admin") return "administrador";
  if (tipo === "vendedor") return "vendedor";
  return "";
}

/**
 * Parágrafos do texto que ficou registrado. A tabela InstrucaoAdesao não guarda
 * o texto nem a lista de itens pendentes da época do registro, só a
 * justificativa de exceção, que só existe quando havia obrigatório pendente
 * (declararConformidade). E desmarcar um item depois do registro não revoga a
 * declaração. Por isso o papel não pode contar a situação de hoje como se fosse
 * a do registro:
 * - sem justificativa gravada: foi registrada com todos os obrigatórios feitos,
 *   então o texto é o padrão; se hoje há obrigatório desmarcado, vai uma
 *   observação separada com a situação de hoje;
 * - com justificativa e obrigatórios ainda pendentes: textoDeclaracao (o mesmo
 *   que a pessoa viu ao declarar) e a observação de que a lista é a de hoje;
 * - com justificativa e tudo feito hoje: o texto padrão, dito que o registro foi
 *   com exceção, e a justificativa.
 */
function paragrafosDoTextoRegistrado(itens: unknown, excecao: unknown, hoje: string): string[] {
  const bruta = typeof excecao === "string" ? excecao : null;
  const justificativa = normalizarJustificativa(bruta);
  const mapa = normalizarMapa(itens);
  const { completo, pendentesObrigatorios } = resumirInstrucao(mapa);

  if (!justificativa) {
    if (completo) return [TEXTO_DECLARACAO];
    return [
      TEXTO_DECLARACAO,
      `Observação: em ${hoje}, constam como não confirmados na plataforma os itens obrigatórios: ${pendentesObrigatorios.join("; ")}. A declaração acima foi registrada na data indicada e não foi revogada.`,
    ];
  }
  if (!completo) {
    return [
      textoDeclaracao({ mapa, justificativaExcecao: bruta }),
      `Observação: a lista de itens acima mostra a instrução na plataforma em ${hoje}; no dia do registro ela pode ter sido diferente.`,
    ];
  }
  return [
    `${TEXTO_DECLARACAO} Declaração registrada com exceção: na data do registro havia itens obrigatórios ainda não confirmados. Justificativa registrada: ${justificativa}${/[.!?]$/.test(justificativa) ? "" : "."}`,
  ];
}

function declaracaoDeConformidade(c: Contexto, dados: DadosMinutas): Minuta {
  const declaracao = dados.declaracao;
  const registrada = condicaoParaAderiu({ declaracaoEm: declaracao?.em }).permitido;
  const referencia = `Referência: adesão do órgão aderente ${c.aderente} à ata de registro de preços nº ${c.ata}, gerenciada pelo órgão ${c.gerenciador}, fornecedor registrado ${c.fornecedor}, vigência até ${c.vigencia}.`;
  const paragrafos: string[] = [AVISO_MINUTA];

  if (registrada && declaracao) {
    const quando = declaracao.em instanceof Date ? declaracao.em : new Date(String(declaracao.em));
    const perfil = perfilDeQuemRegistrou(declaracao.porTipo);
    const quem = `${ou(declaracao.porNome, "nome de quem registrou")}${perfil ? ` (${perfil})` : ""}`;
    paragrafos.push(`Situação: registrada na plataforma em ${dataPorExtenso(quando)}, por ${quem}.`);
    paragrafos.push(referencia);
    paragrafos.push(...paragrafosDoTextoRegistrado(dados.itens, declaracao.excecao, c.data));
    if (typeof declaracao.versao === "number" && declaracao.versao !== VERSAO_DECLARACAO) {
      paragrafos.push(
        `Observação: a declaração foi registrada na versão ${declaracao.versao} do texto; o texto acima segue a versão atual (${VERSAO_DECLARACAO}).`,
      );
    }
  } else {
    paragrafos.push(`Situação: ${MARCADOR_SITUACAO_NAO_REGISTRADA}`);
    paragrafos.push(
      "Este é o texto-padrão da declaração. O registro é feito na plataforma, pela pessoa responsável pela oportunidade.",
    );
    paragrafos.push(referencia);
    paragrafos.push(TEXTO_DECLARACAO);
  }

  return { chave: "declaracao-conformidade", titulo: "Declaração interna de conformidade", paragrafos };
}

/**
 * As cinco minutas do kit, na ordem de CHAVES_MINUTAS. Dado que falta (ou
 * vem em branco) vira marcador `[PREENCHER: ...]`; nada é inventado. Não
 * altera o que recebe.
 */
export function montarMinutas(dados: DadosMinutas): Minuta[] {
  const c = montarContexto(dados);
  return [
    formalizacaoDaDemanda(c),
    justificativaDaVantagem(c, dados.comparativo),
    oficioAoGerenciador(c),
    oficioAoFornecedor(c),
    declaracaoDeConformidade(c, dados),
  ];
}
