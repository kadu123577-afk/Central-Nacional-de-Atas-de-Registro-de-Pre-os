import { prisma } from "@/lib/prisma";
import {
  classificarPreco,
  resumirAta,
  type EstatisticasPrecos,
  type ItemParaResumo,
  type ResumoAta,
  type SituacaoPreco,
} from "@/lib/vantajosidade";

/**
 * Comparativo AUXILIAR de preços de uma ata, pronto para as telas
 * (Projeto RNA, etapa 4, 2026-10-22). Junta os itens da ata com as
 * ReferenciaPreco (preços de contratações públicas do Compras.gov.br,
 * gravadas pelo script scripts/inteligencia/buscar-precos-referencia.ts) e
 * usa as regras puras de src/lib/vantajosidade.ts. Nada aqui afirma que um
 * preço é vantajoso: o comparativo não substitui a pesquisa de preços do
 * órgão (Lei 14.133/2021, art. 23).
 *
 * Duas consultas ao banco, qualquer que seja o tamanho da ata: os itens e as
 * referências de todos os códigos de uma vez (sem consulta por item).
 */

// ------------------------------------------------------------- código do catálogo

/** O código do catálogo (CATMAT/CATSER) é só número, de 1 a 10 dígitos. */
export const MENSAGEM_CODIGO_CATALOGO_INVALIDO =
  "O código do catálogo deve ter só números (de 1 a 10 dígitos), como aparece no catálogo do Compras.gov.br. Deixe em branco se não souber.";

export type ResultadoCodigoCatalogo = { ok: true; codigo: string | null } | { ok: false; erro: string };

/**
 * Valida o código digitado num formulário. Vazio (ou só espaços) vira `null`
 * ("ainda não informado"); qualquer coisa que não seja 1 a 10 dígitos é
 * recusada, em vez de adivinhada. Zeros à esquerda saem ("00123" vira
 * "123"), para o mesmo código digitado de dois jeitos compartilhar a mesma
 * referência de preços; um código só de zeros não existe no catálogo e
 * também é recusado.
 */
export function interpretarCodigoCatalogo(bruto: unknown): ResultadoCodigoCatalogo {
  if (bruto === null || bruto === undefined) return { ok: true, codigo: null };
  if (typeof bruto !== "string") return { ok: false, erro: MENSAGEM_CODIGO_CATALOGO_INVALIDO };
  const texto = bruto.trim();
  if (texto === "") return { ok: true, codigo: null };
  if (!/^[0-9]{1,10}$/.test(texto)) return { ok: false, erro: MENSAGEM_CODIGO_CATALOGO_INVALIDO };
  const semZeros = texto.replace(/^0+/, "");
  if (semZeros === "") return { ok: false, erro: MENSAGEM_CODIGO_CATALOGO_INVALIDO };
  return { ok: true, codigo: semZeros };
}

// ------------------------------------------------------------- unidades

/**
 * Abreviações e nomes comuns de unidade, já sem acento e em minúsculas, e o
 * tipo a que pertencem. Só o que é claro: quem não estiver aqui não entra na
 * comparação ("lt", por exemplo, pode ser litro ou lata). Peça vale como
 * unidade, que é como as compras tratam as duas.
 */
const TIPO_DA_UNIDADE: Record<string, string> = {
  un: "unidade",
  und: "unidade",
  unid: "unidade",
  unidade: "unidade",
  unidades: "unidade",
  uni: "unidade",
  unt: "unidade",
  pc: "unidade",
  pcs: "unidade",
  peca: "unidade",
  pecas: "unidade",
  cx: "caixa",
  cxa: "caixa",
  caixa: "caixa",
  caixas: "caixa",
  pct: "pacote",
  pcte: "pacote",
  pacote: "pacote",
  pacotes: "pacote",
  kg: "quilo",
  kgs: "quilo",
  kilo: "quilo",
  quilo: "quilo",
  quilos: "quilo",
  quilograma: "quilo",
  quilogramas: "quilo",
  g: "grama",
  gr: "grama",
  grs: "grama",
  grama: "grama",
  gramas: "grama",
  mg: "miligrama",
  miligrama: "miligrama",
  miligramas: "miligrama",
  l: "litro",
  litro: "litro",
  litros: "litro",
  ml: "mililitro",
  mililitro: "mililitro",
  mililitros: "mililitro",
  m: "metro",
  mt: "metro",
  mts: "metro",
  metro: "metro",
  metros: "metro",
  m2: "metro quadrado",
  m3: "metro cubico",
  cm: "centimetro",
  mm: "milimetro",
  km: "quilometro",
  // "KMR" é como o endpoint de serviço do Compras.gov.br escreve quilômetro rodado.
  kmr: "quilometro",
  // Unidades de serviço (CATSER): sem elas, "Mês" contra "DIA" não divergia e a
  // comparação saía conclusiva. "D" é a sigla que o endpoint de serviço usa para
  // DIA (conferido ao vivo, código 25089). "Diária" fica de fora de propósito:
  // pode ou não ser o mesmo que "dia", e em dúvida a tela não barra.
  dia: "dia",
  dias: "dia",
  d: "dia",
  mes: "mes",
  meses: "mes",
  h: "hora",
  hr: "hora",
  hrs: "hora",
  hora: "hora",
  horas: "hora",
  serv: "servico",
  servico: "servico",
  servicos: "servico",
  par: "par",
  pares: "par",
  pr: "par",
  fr: "frasco",
  frs: "frasco",
  frasco: "frasco",
  frascos: "frasco",
  gl: "galao",
  galao: "galao",
  galoes: "galao",
  rl: "rolo",
  rolo: "rolo",
  rolos: "rolo",
  resma: "resma",
  resmas: "resma",
  rm: "resma",
  dz: "duzia",
  duzia: "duzia",
  duzias: "duzia",
  sc: "saco",
  saco: "saco",
  sacos: "saco",
  tb: "tubo",
  tubo: "tubo",
  tubos: "tubo",
  kit: "kit",
  kits: "kit",
  jogo: "jogo",
  jogos: "jogo",
  jg: "jogo",
  lata: "lata",
  latas: "lata",
  bd: "balde",
  balde: "balde",
  baldes: "balde",
};

interface UnidadeLida {
  /** Primeira palavra reconhecida (ex.: "caixa" em "CX 50 UN"); null se nenhuma. */
  tipo: string | null;
  /** Números que aparecem no texto (capacidade: "50" em "CAIXA 50 UN"), sem zeros e sem vírgula. */
  numeros: string[];
}

function lerUnidade(texto: string): UnidadeLida {
  const base = texto
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/metros?\s+quadrados?/g, "m2")
    .replace(/metros?\s+cubicos?/g, "m3");
  // "m2" e "m3" ficam inteiros (metro quadrado e cúbico); o resto separa letras de números.
  const pedacos = base.match(/m[23](?![a-z0-9])|\d+(?:[.,]\d+)?|[a-z]+/g) ?? [];
  let tipo: string | null = null;
  const numeros: string[] = [];
  for (const pedaco of pedacos) {
    if (/^\d/.test(pedaco)) {
      const numero = Number(pedaco.replace(",", "."));
      if (Number.isFinite(numero)) numeros.push(String(numero));
    } else if (tipo === null && Object.hasOwn(TIPO_DA_UNIDADE, pedaco)) {
      tipo = TIPO_DA_UNIDADE[pedaco];
    }
  }
  return { tipo, numeros };
}

/**
 * As duas unidades parecem ser diferentes? Normaliza caixa, acento e
 * abreviações comuns (UN, UND e UNIDADE são a mesma; CX e CAIXA também) e
 * compara o tipo da unidade; se o tipo é o mesmo, só diverge quando os dois
 * textos trazem número de capacidade e nenhum número é comum ("PACOTE 100" x
 * "PACOTE 500"). Em dúvida (texto vazio, unidade que não reconhece), diz que
 * NÃO diverge: a tela só barra a comparação quando há motivo claro.
 */
export function unidadesDivergem(unidadeDoItem: string | null | undefined, unidadeDaReferencia: string | null | undefined): boolean {
  if (typeof unidadeDoItem !== "string" || typeof unidadeDaReferencia !== "string") return false;
  if (!unidadeDoItem.trim() || !unidadeDaReferencia.trim()) return false;
  const a = lerUnidade(unidadeDoItem);
  const b = lerUnidade(unidadeDaReferencia);
  if (a.tipo === null || b.tipo === null) return false;
  if (a.tipo !== b.tipo) return true;
  if (a.numeros.length > 0 && b.numeros.length > 0) {
    return !a.numeros.some((n) => b.numeros.includes(n));
  }
  return false;
}

// ------------------------------------------------------------- tipos de saída

export interface ReferenciaDoItem {
  mediana: number | null;
  p25: number | null;
  p75: number | null;
  minimo: number | null;
  maximo: number | null;
  /**
   * Tamanho do grupo de unidade que o script de preços escolheu (preços de
   * outras unidades não entram), depois de tirar a duplicidade por
   * idItemCompra e antes de descartar outliers. NÃO é o total de preços que a
   * API devolveu.
   */
  n: number;
  /** Preços que sobraram depois de descartar inválidos e outliers (as estatísticas valem sobre estes). */
  nUsadas: number;
  janelaInicio: Date;
  janelaFim: Date;
  unidadeFornecimento: string | null;
  consultadoEm: Date;
  /** Texto curto quando a última consulta falhou; null = deu certo. */
  erro: string | null;
}

export interface ItemComparado {
  itemId: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  precoAta: number;
  codigoCatalogo: string | null;
  referencia: ReferenciaDoItem | null;
  classificacao: SituacaoPreco;
  /** Em %, em relação à mediana (negativo = preço da ata mais barato); null quando não há comparação. */
  diferencaPercentual: number | null;
  explicacao: string;
  /** A unidade do item e a da referência parecem diferentes: o item é tratado como "sem_referencia". */
  unidadeDiverge: boolean;
}

export interface ComparativoDaAta {
  itens: ItemComparado[];
  resumo: ResumoAta;
  /** Primeira e última consulta entre os itens efetivamente comparados; null quando nenhum foi comparado. */
  consultadoEm: { maisAntiga: Date; maisRecente: Date } | null;
}

// ------------------------------------------------------------- entradas (formato do banco)

type Numerico = { toString(): string } | number | null | undefined;

/** O que se lê do Item. `valorUnitario` é Decimal no Prisma. */
export interface LinhaItem {
  id: string;
  descricao: string;
  unidade: string;
  quantidadeRegistrada: number;
  valorUnitario: Numerico;
  codigoCatalogo: string | null;
}

/** O que se lê da ReferenciaPreco. As estatísticas são Decimal no Prisma. */
export interface LinhaReferencia {
  codigoCatalogo: string;
  tipoCatalogo: string;
  n: number;
  nUsadas: number;
  minimo: Numerico;
  p25: Numerico;
  mediana: Numerico;
  p75: Numerico;
  maximo: Numerico;
  media: Numerico;
  janelaInicio: Date;
  janelaFim: Date;
  unidadeFornecimento: string | null;
  consultadoEm: Date;
  erro: string | null;
}

/** Decimal do Prisma, número ou texto numérico para number; vazio ou inválido vira null. */
function paraNumero(valor: Numerico): number | null {
  if (valor === null || valor === undefined) return null;
  const numero = typeof valor === "number" ? valor : Number(valor.toString());
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Código do item como a referência de preços o guarda: sem espaços nas pontas
 * e, sendo número, sem zeros à esquerda (o script de preços grava a referência
 * assim; "0123" no item e "123" na referência são o mesmo código). Vazio ou só
 * zeros: sem código.
 */
function codigoLimpo(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (limpo === "") return null;
  if (/^[0-9]+$/.test(limpo)) {
    const semZeros = limpo.replace(/^0+/, "");
    return semZeros === "" ? null : semZeros;
  }
  return limpo;
}

// ------------------------------------------------------------- montagem

const EXPLICACAO_SEM_CODIGO = "Informe o código do catálogo do item para comparar.";

function estatisticasUsaveis(linha: LinhaReferencia): EstatisticasPrecos | null {
  const mediana = paraNumero(linha.mediana);
  const p25 = paraNumero(linha.p25);
  const p75 = paraNumero(linha.p75);
  if (mediana === null || p25 === null || p75 === null) return null;
  return {
    n: linha.n,
    nUsadas: linha.nUsadas,
    minimo: paraNumero(linha.minimo) ?? p25,
    p25,
    mediana,
    p75,
    maximo: paraNumero(linha.maximo) ?? p75,
    media: paraNumero(linha.media) ?? mediana,
  };
}

/**
 * Um mesmo código pode ter duas linhas (material e serviço). Fica a que tem
 * estatísticas utilizáveis; entre duas utilizáveis (ou duas sem), a de
 * material, que é o caso comum, e depois a consulta mais recente.
 */
function escolherLinha(candidatas: LinhaReferencia[]): LinhaReferencia {
  const ordenadas = [...candidatas].sort((a, b) => {
    const utilA = estatisticasUsaveis(a) ? 1 : 0;
    const utilB = estatisticasUsaveis(b) ? 1 : 0;
    if (utilA !== utilB) return utilB - utilA;
    const materialA = a.tipoCatalogo === "material" ? 1 : 0;
    const materialB = b.tipoCatalogo === "material" ? 1 : 0;
    if (materialA !== materialB) return materialB - materialA;
    return b.consultadoEm.getTime() - a.consultadoEm.getTime();
  });
  return ordenadas[0];
}

const MEIO_DIA_MS = 12 * 60 * 60 * 1000;

/**
 * Quando os preços da linha foram de fato consultados. Quando a última
 * tentativa do script falhou, ele troca só `erro` e `consultadoEm` (a data da
 * TENTATIVA): as estatísticas e a janela continuam as da última consulta que
 * deu certo, e a janela termina no dia dessa consulta. Mostrar a data da
 * tentativa ao lado de números antigos faria o comparativo parecer mais novo
 * do que é (e a minuta diria "consultados em" um dia em que nada foi
 * consultado); por isso, nesse caso, vale o fim da janela (ao meio-dia UTC,
 * para o fuso de São Paulo mostrar o mesmo dia).
 */
function quandoOsPrecosForamConsultados(linha: LinhaReferencia, temEstatisticas: boolean): Date {
  if (!linha.erro || !temEstatisticas) return linha.consultadoEm;
  const fim = linha.janelaFim instanceof Date ? linha.janelaFim.getTime() : Number.NaN;
  return Number.isNaN(fim) ? linha.consultadoEm : new Date(fim + MEIO_DIA_MS);
}

const AVISO_ATUALIZACAO_FALHOU =
  "A última tentativa de atualizar os preços deste código não deu certo; esta comparação usa a consulta anterior.";

function referenciaDaLinha(linha: LinhaReferencia, temEstatisticas: boolean): ReferenciaDoItem {
  return {
    mediana: paraNumero(linha.mediana),
    p25: paraNumero(linha.p25),
    p75: paraNumero(linha.p75),
    minimo: paraNumero(linha.minimo),
    maximo: paraNumero(linha.maximo),
    n: linha.n,
    nUsadas: linha.nUsadas,
    janelaInicio: linha.janelaInicio,
    janelaFim: linha.janelaFim,
    unidadeFornecimento: linha.unidadeFornecimento,
    consultadoEm: quandoOsPrecosForamConsultados(linha, temEstatisticas),
    erro: linha.erro,
  };
}

/**
 * Monta o comparativo a partir do que veio do banco. Pura (sem banco): é o
 * que `carregarComparativoDaAta` chama, e o que os testes exercitam.
 */
export function montarComparativo(itensDoBanco: LinhaItem[], referencias: LinhaReferencia[]): ComparativoDaAta {
  const porCodigo = new Map<string, LinhaReferencia[]>();
  for (const linha of referencias) {
    const lista = porCodigo.get(linha.codigoCatalogo) ?? [];
    lista.push(linha);
    porCodigo.set(linha.codigoCatalogo, lista);
  }

  const itens: ItemComparado[] = [];
  const paraResumo: ItemParaResumo[] = [];

  for (const linhaItem of itensDoBanco) {
    const codigo = codigoLimpo(linhaItem.codigoCatalogo);
    const precoAta = paraNumero(linhaItem.valorUnitario) ?? Number.NaN;
    const base = {
      itemId: linhaItem.id,
      descricao: linhaItem.descricao,
      unidade: linhaItem.unidade,
      quantidade: linhaItem.quantidadeRegistrada,
      precoAta,
      codigoCatalogo: codigo,
    };

    const semComparacao = (
      referencia: ReferenciaDoItem | null,
      explicacao: string,
      unidadeDiverge = false,
    ): ItemComparado => {
      paraResumo.push({ descricao: base.descricao, precoAta, quantidade: base.quantidade, referencia: null });
      return {
        ...base,
        referencia,
        classificacao: "sem_referencia",
        diferencaPercentual: null,
        explicacao,
        unidadeDiverge,
      };
    };

    if (codigo === null) {
      itens.push(semComparacao(null, EXPLICACAO_SEM_CODIGO));
      continue;
    }

    const candidatas = porCodigo.get(codigo);
    if (!candidatas || candidatas.length === 0) {
      itens.push(semComparacao(null, `Ainda não foram consultados preços para o código ${codigo} do catálogo.`));
      continue;
    }

    const linha = escolherLinha(candidatas);
    const estatisticas = estatisticasUsaveis(linha);
    const referencia = referenciaDaLinha(linha, estatisticas !== null);

    if (estatisticas === null) {
      itens.push(
        semComparacao(
          referencia,
          linha.erro
            ? "A última consulta de preços para este código não deu certo, então não foi possível comparar."
            : "A consulta não encontrou preços para este código no período consultado.",
        ),
      );
      continue;
    }

    if (unidadesDivergem(linhaItem.unidade, linha.unidadeFornecimento)) {
      itens.push(
        semComparacao(
          referencia,
          `A unidade do item (${linhaItem.unidade.trim()}) parece diferente da unidade da referência (${(linha.unidadeFornecimento ?? "").trim()}); confira antes de comparar.`,
          true,
        ),
      );
      continue;
    }

    const resultado = classificarPreco({ precoAta, referencia: estatisticas });
    paraResumo.push({ descricao: base.descricao, precoAta, quantidade: base.quantidade, referencia: estatisticas });
    itens.push({
      ...base,
      referencia,
      classificacao: resultado.situacao,
      diferencaPercentual: resultado.diferencaPercentual,
      explicacao: linha.erro ? `${resultado.explicacao} ${AVISO_ATUALIZACAO_FALHOU}` : resultado.explicacao,
      unidadeDiverge: false,
    });
  }

  const resumo = resumirAta(paraResumo);

  let maisAntiga: Date | null = null;
  let maisRecente: Date | null = null;
  for (const item of itens) {
    const conclusiva =
      item.classificacao === "abaixo" || item.classificacao === "compativel" || item.classificacao === "acima";
    if (!conclusiva || !item.referencia) continue;
    const quando = item.referencia.consultadoEm;
    if (!(quando instanceof Date) || Number.isNaN(quando.getTime())) continue;
    if (maisAntiga === null || quando < maisAntiga) maisAntiga = quando;
    if (maisRecente === null || quando > maisRecente) maisRecente = quando;
  }

  return {
    itens,
    resumo,
    consultadoEm: maisAntiga && maisRecente ? { maisAntiga, maisRecente } : null,
  };
}

// ------------------------------------------------------------- banco

/**
 * Carrega os itens da ata e as referências de preço dos códigos deles (uma
 * consulta para cada, em lote) e devolve o comparativo.
 */
export async function carregarComparativoDaAta(ataId: string): Promise<ComparativoDaAta> {
  const itens = await prisma.item.findMany({
    where: { ataId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      descricao: true,
      unidade: true,
      quantidadeRegistrada: true,
      valorUnitario: true,
      codigoCatalogo: true,
    },
  });

  const codigos = [...new Set(itens.map((i) => codigoLimpo(i.codigoCatalogo)).filter((c): c is string => c !== null))];
  const referencias =
    codigos.length > 0
      ? await prisma.referenciaPreco.findMany({ where: { codigoCatalogo: { in: codigos } } })
      : [];

  return montarComparativo(itens, referencias);
}

/**
 * Igual a `carregarComparativoDaAta`, mas devolve null se o banco falhar. Para
 * as telas em que o comparativo é um extra (Kanban do vendedor, kit de
 * minutas): um problema nele não pode derrubar a página inteira.
 */
export async function carregarComparativoOuNulo(ataId: string): Promise<ComparativoDaAta | null> {
  try {
    return await carregarComparativoDaAta(ataId);
  } catch (erro) {
    console.error("Comparativo de preços da ata indisponível:", erro);
    return null;
  }
}
