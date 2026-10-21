/**
 * Instrução por adesão — acompanhamento por OPORTUNIDADE (município)
 * (Projeto RNA, etapa 3, 2026-10-21).
 *
 * A plataforma intermedia adesões a atas de registro de preços (Lei
 * 14.133/2021, art. 86), mas quem decide é o órgão aderente, o órgão
 * gerenciador e o fornecedor: aqui só se organiza a informação e o pedido.
 * Este módulo reúne o checklist do que o ÓRGÃO ADERENTE precisa reunir e a
 * trava da declaração interna de conformidade (a oportunidade só vai para
 * "aderiu" depois dela). Regras puras — sem banco, sem rede, sem relógio:
 * quem chama passa a data de hoje. O armazenamento fica em
 * InstrucaoAdesao (coluna `itens` em JSON), sempre lido com normalizarMapa.
 *
 * Não confundir com src/lib/conformidade.ts, que é o checklist da ATA.
 */

export const GRUPO_ORGAO_ADERENTE = "Instrução do órgão aderente";
export const GRUPO_ACEITES = "Aceites";
export const GRUPO_FORMALIZACAO = "Formalização";

/** Ordem em que os grupos aparecem na tela. */
export const GRUPOS_INSTRUCAO = [GRUPO_ORGAO_ADERENTE, GRUPO_ACEITES, GRUPO_FORMALIZACAO] as const;

export type GrupoInstrucao = (typeof GRUPOS_INSTRUCAO)[number];

/**
 * Itens fixos do checklist, na ordem da tela. `obrigatorio` é só o que vale
 * para a trava: publicação no PNCP e contrato/empenho acontecem DEPOIS da
 * adesão, então não impedem a declaração.
 */
export const ITENS_INSTRUCAO = [
  {
    chave: "dfd",
    rotulo: "Formalização da demanda assinada",
    grupo: GRUPO_ORGAO_ADERENTE,
    obrigatorio: true,
    ajuda: "Documento do órgão aderente que descreve a necessidade da compra, assinado por quem tem competência para isso.",
  },
  {
    chave: "justificativa_vantagem",
    rotulo: "Justificativa da vantagem da adesão",
    grupo: GRUPO_ORGAO_ADERENTE,
    obrigatorio: true,
    ajuda: "Texto do órgão aderente explicando por que aderir à ata é mais vantajoso do que licitar sozinho.",
  },
  {
    chave: "pesquisa_precos",
    rotulo: "Pesquisa de preços que mostra preço compatível com o mercado, art. 23",
    grupo: GRUPO_ORGAO_ADERENTE,
    obrigatorio: true,
    ajuda: "Comparação com preços praticados no mercado que mostre que o valor da ata é compatível.",
  },
  {
    chave: "dotacao",
    rotulo: "Indicação de dotação orçamentária",
    grupo: GRUPO_ORGAO_ADERENTE,
    obrigatorio: true,
    ajuda: "Indicação de que existe recurso orçamentário reservado para pagar a despesa.",
  },
  {
    chave: "parecer_juridico",
    rotulo: "Parecer jurídico do órgão, art. 53",
    grupo: GRUPO_ORGAO_ADERENTE,
    obrigatorio: true,
    ajuda: "Parecer da assessoria jurídica do órgão aderente analisando o pedido de adesão.",
  },
  {
    chave: "autorizacao",
    rotulo: "Autorização da autoridade competente",
    grupo: GRUPO_ORGAO_ADERENTE,
    obrigatorio: true,
    ajuda: "Decisão da autoridade competente do órgão aderente autorizando a adesão.",
  },
  {
    chave: "anuencia_gerenciador",
    rotulo: "Anuência do órgão gerenciador da ata",
    grupo: GRUPO_ACEITES,
    obrigatorio: true,
    ajuda: "Concordância do órgão que gerencia a ata, obtida antes de formalizar a adesão.",
  },
  {
    chave: "aceite_fornecedor",
    rotulo: "Aceite do fornecedor, sem prejuízo dos compromissos já assumidos na ata",
    grupo: GRUPO_ACEITES,
    obrigatorio: true,
    ajuda: "Confirmação do fornecedor de que atende o órgão aderente nas condições da ata.",
  },
  {
    chave: "limites_conferidos",
    rotulo: "Limites do art. 86 conferidos: 50% por órgão aderente e 200% no total por item",
    grupo: GRUPO_ACEITES,
    obrigatorio: true,
    ajuda: "Conferência de que a adesão cabe nos limites de quantidade da ata, item por item.",
  },
  {
    chave: "publicacao_pncp",
    rotulo: "Publicação da contratação no PNCP, art. 94",
    grupo: GRUPO_FORMALIZACAO,
    obrigatorio: false,
    ajuda: "Divulgação da contratação no Portal Nacional de Contratações Públicas, feita depois da adesão.",
  },
  {
    chave: "contrato_ou_empenho",
    rotulo: "Contrato ou nota de empenho emitido",
    grupo: GRUPO_FORMALIZACAO,
    obrigatorio: false,
    ajuda: "Contrato assinado ou nota de empenho emitida pelo órgão aderente, depois da adesão.",
  },
] as const;

export type ChaveInstrucao = (typeof ITENS_INSTRUCAO)[number]["chave"];

export type EstadoItemInstrucao = {
  feito: boolean;
  /** Dia em que foi marcado, ISO só-dia (AAAA-MM-DD). Só existe com feito = true. */
  em?: string;
  /** Observação livre, até MAX_NOTA caracteres. */
  nota?: string;
};

/**
 * Estado salvo em InstrucaoAdesao.itens. É esparso: item que nunca foi
 * tocado não aparece, e conta como não feito.
 */
export type MapaInstrucao = Partial<Record<ChaveInstrucao, EstadoItemInstrucao>>;

export const MAX_NOTA = 300;
/** Justificativa de exceção: mínimo (após trim) e máximo de caracteres. */
export const MIN_JUSTIFICATIVA = 20;
export const MAX_JUSTIFICATIVA = 1000;

export function itemInstrucaoValido(chave: unknown): chave is ChaveInstrucao {
  return typeof chave === "string" && ITENS_INSTRUCAO.some((i) => i.chave === chave);
}

// ---------------------------------------------------------------------------
// Limpeza de entrada (o JSON do banco e o texto do formulário são "lixo até
// prova em contrário")
// ---------------------------------------------------------------------------

/**
 * Tira o que o PostgreSQL (jsonb e text) não aceita ou que não faz sentido
 * num texto de uma observação: caractere nulo e outros de controle (menos
 * quebra de linha e tabulação) e metades soltas de emoji. Se `max` vier,
 * corta nesse tamanho sem partir um emoji ao meio.
 */
function limparTexto(entrada: string, max?: number): string {
  let saida = "";
  for (const ch of entrada) {
    const codigo = ch.codePointAt(0) ?? 0;
    const metadeSolta = codigo >= 0xd800 && codigo <= 0xdfff;
    const controle = codigo < 0x20 ? codigo !== 0x09 && codigo !== 0x0a : codigo === 0x7f;
    if (metadeSolta || controle) continue;
    if (max !== undefined && saida.length + ch.length > max) break;
    saida += ch;
  }
  return saida;
}

function limparNota(entrada: unknown): string {
  return typeof entrada === "string" ? limparTexto(entrada.trim(), MAX_NOTA).trim() : "";
}

/** Devolve o dia se a entrada for exatamente uma data real AAAA-MM-DD; senão, vazio. */
function diaValido(entrada: unknown): string {
  if (typeof entrada !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entrada)) return "";
  const data = new Date(`${entrada}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === entrada ? entrada : "";
}

function objetoSimples(valor: unknown): valor is Record<string, unknown> {
  try {
    return typeof valor === "object" && valor !== null && !Array.isArray(valor);
  } catch {
    // Proxy revogado: Array.isArray lança. Para este módulo, não é objeto.
    return false;
  }
}

/**
 * Lê o que veio do banco (ou de um formulário) e devolve um mapa seguro:
 * só chaves conhecidas, `feito` só é verdadeiro se for exatamente `true`,
 * `em` só se for uma data real (e só com feito), nota cortada em MAX_NOTA.
 * Qualquer outra coisa é ignorada — nunca lança.
 */
export function normalizarMapa(entrada: unknown): MapaInstrucao {
  const mapa: MapaInstrucao = {};
  if (!objetoSimples(entrada)) return mapa;
  for (const { chave } of ITENS_INSTRUCAO) {
    try {
      if (!Object.prototype.hasOwnProperty.call(entrada, chave)) continue;
      const bruto = entrada[chave];
      if (!objetoSimples(bruto)) continue;
      const estado: EstadoItemInstrucao = { feito: bruto.feito === true };
      if (estado.feito) {
        const em = diaValido(bruto.em);
        if (em) estado.em = em;
      }
      const nota = limparNota(bruto.nota);
      if (nota) estado.nota = nota;
      mapa[chave] = estado;
    } catch {
      // Valor hostil (ex.: getter que lança): esse item é descartado.
    }
  }
  return mapa;
}

/**
 * Marca ou desmarca um item e devolve um mapa NOVO (o recebido não é
 * alterado). `hoje` é o dia ISO (aceita também data e hora; só os 10
 * primeiros caracteres contam). Ao marcar, grava `em = hoje` — mas marcar de
 * novo um item que já estava feito mantém a data original. Ao desmarcar, a
 * data some. `nota` omitida mantém a observação que já existia; vazia ou
 * nula apaga. Chave desconhecida não muda nada.
 */
export function marcarItem(
  mapa: MapaInstrucao,
  chave: string,
  feito: boolean,
  hoje: string,
  nota?: string | null,
): MapaInstrucao {
  const base = normalizarMapa(mapa);
  if (!itemInstrucaoValido(chave)) return base;
  const atual = base[chave];
  const novo: EstadoItemInstrucao = { feito: feito === true };
  if (novo.feito) {
    const em = atual?.feito && atual.em ? atual.em : diaValido(typeof hoje === "string" ? hoje.slice(0, 10) : "");
    if (em) novo.em = em;
  }
  const notaFinal = nota === undefined ? atual?.nota : limparNota(nota);
  if (notaFinal) novo.nota = notaFinal;
  return normalizarMapa({ ...base, [chave]: novo });
}

// ---------------------------------------------------------------------------
// Resumo e trava
// ---------------------------------------------------------------------------

export type ResumoInstrucao = {
  total: number;
  feitos: number;
  obrigatoriosTotal: number;
  obrigatoriosFeitos: number;
  /** Rótulos dos obrigatórios ainda não feitos, na ordem da tela. */
  pendentesObrigatorios: string[];
  /** Todos os obrigatórios feitos. */
  completo: boolean;
  /** 0 a 100, dos OBRIGATÓRIOS (100 só quando `completo`) — é o que a trava mede. */
  percentual: number;
};

export function resumirInstrucao(mapa: MapaInstrucao): ResumoInstrucao {
  const estados = normalizarMapa(mapa);
  const obrigatorios = ITENS_INSTRUCAO.filter((i) => i.obrigatorio);
  const feitos = ITENS_INSTRUCAO.filter((i) => estados[i.chave]?.feito).length;
  const pendentes = obrigatorios.filter((i) => !estados[i.chave]?.feito);
  const obrigatoriosFeitos = obrigatorios.length - pendentes.length;
  return {
    total: ITENS_INSTRUCAO.length,
    feitos,
    obrigatoriosTotal: obrigatorios.length,
    obrigatoriosFeitos,
    pendentesObrigatorios: pendentes.map((i) => i.rotulo),
    completo: pendentes.length === 0,
    percentual: obrigatorios.length === 0 ? 0 : Math.floor((obrigatoriosFeitos / obrigatorios.length) * 100),
  };
}

function listarItens(rotulos: string[]): string {
  return rotulos.join("; ");
}

/**
 * Pode declarar SEM exceção? Só quando todos os obrigatórios estão feitos.
 * Com pendência, `motivo` diz o que falta (a exceção é tratada em
 * validarDeclaracao).
 */
export function podeDeclararConformidade(mapa: MapaInstrucao): { liberado: boolean; motivo?: string } {
  const { completo, pendentesObrigatorios } = resumirInstrucao(mapa);
  if (completo) return { liberado: true };
  return {
    liberado: false,
    motivo: `Faltam itens obrigatórios da instrução: ${listarItens(pendentesObrigatorios)}.`,
  };
}

/**
 * Caracteres que não aparecem na tela mas que o trim() não tira: os de
 * formato (largura zero, marca de ordem de bytes, controles de direção,
 * hífen suave) e alguns "espaços" de aparência vazia (braille em branco e
 * preenchimentos do hangul). Sem isso, 20 deles passariam por uma
 * justificativa de verdade.
 */
const INVISIVEIS = /[\p{Cf}⠀ㅤᅟᅠﾠ]/gu;

/**
 * Texto da justificativa de exceção já limpo: sem caractere de controle,
 * nulo ou invisível, com qualquer sequência de espaços ou quebras de linha
 * reduzida a um espaço só (ela entra numa frase única da declaração) e sem
 * espaços nas pontas. É este valor que se mede e que se grava.
 */
export function normalizarJustificativa(entrada: unknown): string {
  if (typeof entrada !== "string") return "";
  return limparTexto(entrada).replace(INVISIVEIS, "").replace(/\s+/g, " ").trim();
}

/**
 * A regra da declaração: exige todos os obrigatórios feitos OU uma
 * justificativa de exceção com pelo menos MIN_JUSTIFICATIVA caracteres
 * (depois do trim) e no máximo MAX_JUSTIFICATIVA. Com tudo feito, a
 * justificativa é irrelevante.
 */
export function validarDeclaracao(args: {
  mapa: MapaInstrucao;
  justificativaExcecao?: string | null;
}): { ok: true } | { ok: false; erro: string } {
  const pode = podeDeclararConformidade(args.mapa);
  if (pode.liberado) return { ok: true };
  const justificativa = normalizarJustificativa(args.justificativaExcecao);
  const complemento = `Para declarar mesmo assim, explique o motivo em pelo menos ${MIN_JUSTIFICATIVA} caracteres.`;
  if (justificativa.length === 0) return { ok: false, erro: `${pode.motivo} ${complemento}` };
  if (justificativa.length < MIN_JUSTIFICATIVA) {
    return { ok: false, erro: `A justificativa é curta demais. ${complemento}` };
  }
  if (justificativa.length > MAX_JUSTIFICATIVA) {
    return { ok: false, erro: `A justificativa passou de ${MAX_JUSTIFICATIVA} caracteres. Resuma o motivo.` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Texto da declaração e trava do estágio "aderiu"
// ---------------------------------------------------------------------------

/** Mude junto com TEXTO_DECLARACAO: fica gravado em declaracaoVersao. */
export const VERSAO_DECLARACAO = 1;

export const TEXTO_DECLARACAO =
  "Declaro que, até onde sei, o pedido de adesão foi instruído pelo órgão aderente com os documentos e aceites indicados, que a decisão de aderir é do órgão aderente, do órgão gerenciador e do fornecedor, e que a plataforma apenas organizou as informações e o pedido.";

/**
 * Texto que a pessoa declara. Com tudo feito, é TEXTO_DECLARACAO. Havendo
 * obrigatórios pendentes, acrescenta a variante de exceção: "Itens ainda
 * não confirmados: <lista>. Justificativa: <texto>." (sem a parte da
 * justificativa se ela vier vazia — nesse caso validarDeclaracao já recusa).
 */
export function textoDeclaracao(args: { mapa: MapaInstrucao; justificativaExcecao?: string | null }): string {
  const { completo, pendentesObrigatorios } = resumirInstrucao(args.mapa);
  if (completo) return TEXTO_DECLARACAO;
  let texto = `${TEXTO_DECLARACAO} Itens ainda não confirmados: ${listarItens(pendentesObrigatorios)}.`;
  const justificativa = normalizarJustificativa(args.justificativaExcecao);
  if (justificativa) {
    texto += ` Justificativa: ${justificativa}${/[.!?]$/.test(justificativa) ? "" : "."}`;
  }
  return texto;
}

/** Trava do Kanban: o estágio "aderiu" exige a declaração já registrada. */
export function condicaoParaAderiu(args: { declaracaoEm?: Date | string | null }): { permitido: boolean; erro?: string } {
  const { declaracaoEm } = args;
  // Texto só vale se começar com um dia real em ISO (new Date("1") "funciona"
  // no V8 e new Date("2026-02-31") vira 3 de março).
  const data =
    declaracaoEm instanceof Date
      ? declaracaoEm
      : typeof declaracaoEm === "string" && diaValido(declaracaoEm.slice(0, 10))
        ? new Date(declaracaoEm)
        : null;
  if (data && !Number.isNaN(data.getTime())) return { permitido: true };
  return {
    permitido: false,
    erro: "Antes de marcar como Aderiu, registre a declaração de conformidade da instrução da adesão.",
  };
}
