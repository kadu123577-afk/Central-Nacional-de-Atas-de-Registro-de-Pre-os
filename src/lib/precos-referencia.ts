/**
 * Preços de referência vindos da API pública de pesquisa de preços do
 * Compras.gov.br — 2026-10-22, Projeto RNA etapa 4 ("vantajosidade").
 *
 * Esta é a parte PURA (sem banco, sem rede) da camada de consulta: monta as
 * URLs, converte cada registro da API em amostra de preço, separa os preços
 * por unidade de fornecimento, escolhe a unidade certa para o item da ata e
 * tira duplicidades. A consulta em si e a gravação em ReferenciaPreco ficam em
 * scripts/inteligencia/buscar-precos-referencia.ts; o cálculo das estatísticas
 * e a classificação, em src/lib/vantajosidade.ts.
 *
 * Fatos da API confirmados ao vivo (2026-10-22), que moldaram o código:
 *  - dado de preço vem em `precoUnitario` (number); registro sem esse número,
 *    ou com valor zerado/negativo, não serve e é descartado;
 *  - `idItemCompra` é um número seguro (< 2^53) e identifica o item da compra;
 *    `idCompra` PASSA de 2^53 (o JSON.parse perde precisão), então nunca é
 *    usado como chave nem exibido;
 *  - o endpoint de serviço (3_consultarServico) traz a unidade de MEDIDA
 *    (siglaUnidadeMedida/nomeUnidadeMedida, quase sempre "UNIDADE"), sem
 *    capacidade; um mesmo código CATSER reúne cobranças diferentes (valor fixo,
 *    hora, quilômetro), então a faixa de preços de serviço é larga;
 *  - ARMADILHA DE UNIDADE: o mesmo item aparece a R$ 0,70 em "UN" e a R$ 7,20
 *    em "PCT" de capacidade 100, e há "PCT" de capacidade 0 a R$ 116. A chave de
 *    unidade é SIGLA + CAPACIDADE e grupos diferentes nunca se misturam: o
 *    filtro por unidade vem ANTES de qualquer estatística.
 */
import type { AmostraPreco } from "./vantajosidade";

export const URL_BASE_PRECOS = "https://dadosabertos.compras.gov.br";
/** A API aceita de 10 a 500 registros por página. */
export const TAMANHO_PAGINA_MINIMO = 10;
export const TAMANHO_PAGINA_MAXIMO = 500;
/** Janela padrão de contratações consultadas, em meses até hoje. */
export const MESES_JANELA_PADRAO = 12;
/** Uma referência mais nova que isso não precisa ser consultada de novo. */
export const DIAS_VALIDADE_REFERENCIA = 30;
/** Consulta que falhou é tentada de novo depois deste tempo (e não só em 30 dias). */
export const DIAS_RETENTAR_ERRO = 1;
/**
 * Preço unitário acima disto é dado errado (a coluna do banco é Decimal(16,4):
 * 12 dígitos antes da vírgula). Fica bem abaixo do limite para a média caber.
 */
export const PRECO_MAXIMO = 1e11;

export type TipoCatalogo = "material" | "servico";

// ------------------------------------------------------------- códigos

/**
 * Código de catálogo (CATMAT/CATSER) na forma de sempre: só dígitos, de 1 a 10,
 * sem zeros à esquerda ("000123" e "123" são o mesmo código, como em
 * src/lib/vantajosidade-db.ts). Nulo quando não serve: vazio, com letras ou
 * sinais, longo demais ou só zeros. Espaços nas pontas são ignorados.
 */
export function codigoCatalogoValido(codigo: unknown): string | null {
  if (typeof codigo === "number") {
    if (!Number.isSafeInteger(codigo) || codigo <= 0) return null;
    codigo = String(codigo);
  }
  if (typeof codigo !== "string") return null;
  const texto = codigo.trim();
  if (!/^\d{1,10}$/.test(texto)) return null;
  const semZeros = texto.replace(/^0+/, "");
  return semZeros === "" ? null : semZeros;
}

// ------------------------------------------------------------- datas

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** AAAA-MM-DD pelo calendário local (igual a src/lib/compras-gov.ts). */
function formatarData(data: Date): string {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

/** Aceita Date ou texto AAAA-MM-DD de uma data que existe; lança erro nos demais casos. */
function dataParaApi(valor: string | Date, nome: string): string {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new Error(`${nome}: data inválida`);
    return formatarData(valor);
  }
  const m = typeof valor === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor) : null;
  if (m) {
    const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const d = new Date(ano, mes - 1, dia);
    if (d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia) return valor;
  }
  throw new Error(`${nome}: use AAAA-MM-DD (recebido: ${String(valor)})`);
}

/**
 * Janela de datas das contratações consultadas: de `meses` meses atrás até
 * hoje (padrão 12). Dia que não existe no mês de início (31 de março menos 1
 * mês) vira o último dia daquele mês. Datas em AAAA-MM-DD, calendário local.
 */
export function janelaDeDatas(hoje: Date, meses: number = MESES_JANELA_PADRAO): { inicio: string; fim: string } {
  if (!(hoje instanceof Date) || Number.isNaN(hoje.getTime())) throw new Error("janelaDeDatas: data de hoje inválida");
  const m = Number.isFinite(meses) ? Math.max(1, Math.floor(meses)) : MESES_JANELA_PADRAO;
  const primeiroDoMes = new Date(hoje.getFullYear(), hoje.getMonth() - m, 1);
  const ultimoDia = new Date(primeiroDoMes.getFullYear(), primeiroDoMes.getMonth() + 1, 0).getDate();
  const inicio = new Date(primeiroDoMes.getFullYear(), primeiroDoMes.getMonth(), Math.min(hoje.getDate(), ultimoDia));
  return { inicio: formatarData(inicio), fim: formatarData(hoje) };
}

// ------------------------------------------------------------- URLs

export interface ParamsUrlPreco {
  /** Código do catálogo (CATMAT para material, CATSER para serviço), só dígitos. */
  codigo: string | number;
  inicio: string | Date;
  fim: string | Date;
  /** Padrão 1. */
  pagina?: number;
  /** De 10 a 500 (ajustado aos limites); padrão 500. */
  tamanhoPagina?: number;
  /** Sigla da UF (ex.: "GO"), para limitar a consulta a um estado. */
  estado?: string;
}

function paramsBase(p: ParamsUrlPreco): { codigo: string; resto: [string, string][] } {
  const codigo = codigoCatalogoValido(p.codigo);
  if (!codigo) throw new Error(`Código de catálogo inválido: ${String(p.codigo)}`);
  const pagina = Number.isInteger(p.pagina) && (p.pagina as number) >= 1 ? (p.pagina as number) : 1;
  const tamanho = Math.min(
    TAMANHO_PAGINA_MAXIMO,
    Math.max(TAMANHO_PAGINA_MINIMO, Math.floor(p.tamanhoPagina ?? TAMANHO_PAGINA_MAXIMO) || TAMANHO_PAGINA_MAXIMO),
  );
  const resto: [string, string][] = [
    ["dataCompraInicio", dataParaApi(p.inicio, "inicio")],
    ["dataCompraFim", dataParaApi(p.fim, "fim")],
    ["pagina", String(pagina)],
    ["tamanhoPagina", String(tamanho)],
  ];
  if (p.estado !== undefined && p.estado !== "") {
    const uf = String(p.estado).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(uf)) throw new Error(`Estado inválido: ${String(p.estado)}`);
    resto.push(["estado", uf]);
  }
  return { codigo, resto };
}

/** GET de preços praticados de um MATERIAL (CATMAT): /modulo-pesquisa-preco/1_consultarMaterial. */
export function urlPrecoMaterial(p: ParamsUrlPreco): string {
  const { codigo, resto } = paramsBase(p);
  const busca = new URLSearchParams([["tipo", "codigoItemCatalogo"], ["codigo", codigo], ...resto]);
  return `${URL_BASE_PRECOS}/modulo-pesquisa-preco/1_consultarMaterial?${busca.toString()}`;
}

/** GET de preços praticados de um SERVIÇO (CATSER): /modulo-pesquisa-preco/3_consultarServico (sem tipo/codigo: o filtro é codigoItemCatalogo). */
export function urlPrecoServico(p: ParamsUrlPreco): string {
  const { codigo, resto } = paramsBase(p);
  const busca = new URLSearchParams([["codigoItemCatalogo", codigo], ...resto]);
  return `${URL_BASE_PRECOS}/modulo-pesquisa-preco/3_consultarServico?${busca.toString()}`;
}

// ------------------------------------------------------------- unidades

/** Sigla padrão => formas parecidas que aparecem nos dados (sem acento, caixa alta). */
const SINONIMOS_DE_UNIDADE: Record<string, string[]> = {
  UN: ["UN", "UND", "UNID", "UNIDADE", "UNIDADES", "UNI", "UNT", "UNIT"],
  CX: ["CX", "CXA", "CAIXA", "CAIXAS"],
  PCT: ["PCT", "PCTE", "PACOTE", "PACOTES"],
  FR: ["FR", "FRS", "FRASCO", "FRASCOS"],
  KG: ["KG", "KGS", "QUILO", "QUILOS", "KILO", "QUILOGRAMA", "QUILOGRAMAS", "KILOGRAMA", "KILOGRAMAS"],
  G: ["G", "GR", "GRS", "GRAMA", "GRAMAS"],
  MG: ["MG", "MILIGRAMA", "MILIGRAMAS"],
  L: ["L", "LT", "LTS", "LITRO", "LITROS"],
  ML: ["ML", "MLS", "MILILITRO", "MILILITROS"],
  M: ["M", "MT", "MTS", "METRO", "METROS"],
  M2: ["M2", "METRO QUADRADO", "METROS QUADRADOS"],
  M3: ["M3", "METRO CUBICO", "METROS CUBICOS"],
  CM: ["CM", "CENTIMETRO", "CENTIMETROS"],
  MM: ["MM", "MILIMETRO", "MILIMETROS"],
  KM: ["KM", "QUILOMETRO", "QUILOMETROS"],
  PAR: ["PAR", "PARES", "PR"],
  RESMA: ["RESMA", "RESMAS", "RM"],
  ROLO: ["ROLO", "ROLOS", "RL"],
  SC: ["SC", "SACO", "SACOS", "SACA"],
  TB: ["TB", "TUBO", "TUBOS"],
  BD: ["BD", "BALDE", "BALDES"],
  GL: ["GL", "GALAO", "GALOES"],
  LATA: ["LATA", "LATAS"],
  PC: ["PC", "PCS", "PECA", "PECAS"],
  AMP: ["AMP", "AMPOLA", "AMPOLAS"],
  CP: ["CP", "CPR", "COMP", "COMPRIMIDO", "COMPRIMIDOS"],
  BL: ["BL", "BLOCO", "BLOCOS"],
  KIT: ["KIT", "KITS"],
  JG: ["JG", "JOGO", "JOGOS"],
  DZ: ["DZ", "DUZIA", "DUZIAS"],
  CENTO: ["CENTO", "CENTOS", "CTO"],
  MIL: ["MIL", "MILHEIRO", "MILHEIROS", "MLH"],
  BOB: ["BOB", "BOBINA", "BOBINAS"],
  BIS: ["BIS", "BISNAGA", "BISNAGAS"],
  EMB: ["EMB", "EMBALAGEM", "EMBALAGENS"],
  FD: ["FD", "FARDO", "FARDOS"],
  SACHE: ["SACHE", "SACHES"],
  BARRA: ["BARRA", "BARRAS"],
  TON: ["TON", "TONELADA", "TONELADAS"],
  H: ["H", "HR", "HRS", "HORA", "HORAS"],
  DIA: ["DIA", "DIAS"],
  MES: ["MES", "MESES"],
  DIARIA: ["DIARIA", "DIARIAS"],
  SERV: ["SERV", "SERVICO", "SERVICOS"],
};

const SIGLA_PELO_SINONIMO: ReadonlyMap<string, string> = new Map(
  Object.entries(SINONIMOS_DE_UNIDADE).flatMap(([sigla, formas]) => formas.map((f) => [f, sigla] as [string, string])),
);

/** Unidades de coisas que se contam, pesam ou medem: um serviço não vem nelas. */
const UNIDADES_DE_COISA = new Set([
  "CX", "PCT", "FR", "KG", "G", "MG", "L", "ML", "M", "M2", "M3", "CM", "MM", "PAR", "RESMA", "ROLO", "SC", "TB",
  "BD", "GL", "LATA", "PC", "AMP", "CP", "BL", "KIT", "JG", "DZ", "CENTO", "MIL", "BOB", "BIS", "EMB", "FD", "SACHE",
  "BARRA", "TON",
]);

function textoSimples(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sigla padronizada de uma unidade de fornecimento: caixa alta, sem acento e
 * sem espaços sobrando; formas conhecidas viram a sigla padrão ("UNIDADE",
 * "UND" e "UN" => "UN"; "CAIXA" e "CX" => "CX"; "PACOTE" e "PCT" => "PCT"...).
 * O que não é conhecido sai como veio (já limpo). Vazio ou não texto => "".
 */
export function normalizarUnidade(texto: unknown): string {
  if (typeof texto !== "string") return "";
  const limpo = textoSimples(texto);
  return SIGLA_PELO_SINONIMO.get(limpo) ?? limpo;
}

/**
 * Sigla padrão da unidade escrita num item da ata ("Caixa c/ 50", "kg", "UND"),
 * ou "" quando não é reconhecida. Vale a unidade inteira ou, se não bater, a
 * primeira palavra.
 */
export function siglaDaUnidadeDoItem(texto: unknown): string {
  if (typeof texto !== "string") return "";
  const limpo = textoSimples(texto);
  const inteira = SIGLA_PELO_SINONIMO.get(limpo);
  if (inteira) return inteira;
  const primeira = limpo.split(/[^A-Z0-9]+/).filter(Boolean)[0];
  return (primeira && SIGLA_PELO_SINONIMO.get(primeira)) || "";
}

function capacidadeValida(valor: unknown): number {
  const n = typeof valor === "number" ? valor : typeof valor === "string" && /^\d+(\.\d+)?$/.test(valor.trim()) ? Number(valor) : NaN;
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(4)) : 0;
}

const SIGLA_DESCONHECIDA = "?";

/**
 * Chave da unidade de um registro da API: sigla padronizada + "|" +
 * capacidade ("UN|0", "PCT|100"). Sem sigla, usa o nome da unidade; sem nenhum
 * dos dois, "?". Capacidade ausente ou inválida vale 0.
 * O endpoint de material informa a unidade de FORNECIMENTO (com capacidade);
 * o de serviço só a unidade de MEDIDA (siglaUnidadeMedida/nomeUnidadeMedida,
 * conferido ao vivo em 2026-10-22), que serve de segunda opção.
 */
export function chaveUnidade(registro: unknown): string {
  const r = (registro && typeof registro === "object" ? registro : {}) as Record<string, unknown>;
  const sigla =
    normalizarUnidade(r.siglaUnidadeFornecimento) ||
    normalizarUnidade(r.nomeUnidadeFornecimento) ||
    normalizarUnidade(r.siglaUnidadeMedida) ||
    normalizarUnidade(r.nomeUnidadeMedida) ||
    SIGLA_DESCONHECIDA;
  let capacidade = capacidadeValida(r.capacidadeUnidadeFornecimento);
  // "UN" de capacidade 1 é o mesmo que "UN" sem capacidade: sem isto o mesmo item se partiria em dois grupos.
  if (sigla === "UN" && capacidade === 1) capacidade = 0;
  return `${sigla}|${capacidade}`;
}

/** "PCT|100" => { sigla: "PCT", capacidade: 100 }. */
export function separarChave(chave: string): { sigla: string; capacidade: number } {
  const i = chave.lastIndexOf("|");
  if (i < 0) return { sigla: chave, capacidade: 0 };
  return { sigla: chave.slice(0, i), capacidade: capacidadeValida(chave.slice(i + 1)) };
}

/** Texto da unidade para guardar e mostrar: "PCT 100" (capacidade 0 mostra só "PCT"); nulo sem sigla. */
export function rotuloUnidade(chave: string): string | null {
  const { sigla, capacidade } = separarChave(chave);
  if (!sigla || sigla === SIGLA_DESCONHECIDA) return null;
  return capacidade > 0 ? `${sigla} ${capacidade}` : sigla;
}

/**
 * O código de um item que não achou preço de material PARECE de serviço?
 * Códigos CATSER têm até 5 dígitos (CATMAT passa disso) e a unidade do item
 * não pode ser de coisa (caixa, quilo, litro...). É só um palpite — os
 * números de CATMAT e CATSER se sobrepõem —, por isso só vale depois que a
 * consulta de material veio vazia.
 */
export function pareceCodigoDeServico(codigo: unknown, unidadeDoItem?: unknown): boolean {
  const c = codigoCatalogoValido(codigo);
  if (!c || c.length > 5) return false;
  return !UNIDADES_DE_COISA.has(siglaDaUnidadeDoItem(unidadeDoItem));
}

// ------------------------------------------------------------- registros

/** Amostra de preço com os dados de unidade e de identificação usados no filtro e na deduplicação. */
export interface AmostraRegistro extends AmostraPreco {
  /** idItemCompra (número seguro) em texto; nulo quando a API não informou. */
  idItemCompra: string | null;
  chaveUnidade: string;
}

/**
 * Preço de um registro: número, ou texto só de dígitos com ponto decimal
 * ("12.50"). Vírgula, texto qualquer e coisas como "Infinity" não viram
 * número por adivinhação.
 */
function precoDoRegistro(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : typeof valor === "string" && /^\d+(\.\d+)?$/.test(valor.trim()) ? Number(valor) : NaN;
  return Number.isFinite(n) && n > 0 && n <= PRECO_MAXIMO ? n : null;
}

function idDoRegistro(valor: unknown): string | null {
  if (typeof valor === "number") return Number.isSafeInteger(valor) && valor > 0 ? String(valor) : null;
  if (typeof valor === "string" && /^\d{1,15}$/.test(valor.trim())) return String(Number(valor));
  return null;
}

/**
 * Converte um registro bruto da API de preços em amostra. Nulo quando não
 * serve: não é objeto ou não tem `precoUnitario` numérico maior que zero.
 * Nunca lê nem guarda dado de fornecedor.
 */
export function registroParaAmostra(bruto: unknown): AmostraRegistro | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const r = bruto as Record<string, unknown>;
  const preco = precoDoRegistro(r.precoUnitario);
  if (preco === null) return null;

  const chave = chaveUnidade(r);
  const amostra: AmostraRegistro = {
    valorUnitario: preco,
    idItemCompra: idDoRegistro(r.idItemCompra),
    chaveUnidade: chave,
  };
  if (typeof r.dataCompra === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(r.dataCompra);
    if (m) amostra.data = m[1];
  }
  if (typeof r.estado === "string" && /^[A-Za-z]{2}$/.test(r.estado.trim())) amostra.uf = r.estado.trim().toUpperCase();
  const rotulo = rotuloUnidade(chave);
  if (rotulo) amostra.unidade = rotulo;
  return amostra;
}

/**
 * Tira duplicidade por idItemCompra (fica a primeira ocorrência, na mesma
 * ordem). Amostra sem idItemCompra não tem como ser comparada e é mantida.
 */
export function dedupePorIdItemCompra<T extends { idItemCompra?: string | number | null }>(amostras: T[]): T[] {
  const vistos = new Set<string>();
  const saida: T[] = [];
  for (const a of amostras) {
    const id = a.idItemCompra;
    if (id === null || id === undefined || id === "") {
      saida.push(a);
      continue;
    }
    const chave = String(id);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(a);
  }
  return saida;
}

/** Separa as amostras pela chave de unidade (sigla + capacidade). */
export function agruparPorUnidade<T extends { chaveUnidade: string }>(amostras: T[]): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const a of amostras) {
    const lista = grupos.get(a.chaveUnidade);
    if (lista) lista.push(a);
    else grupos.set(a.chaveUnidade, [a]);
  }
  return grupos;
}

// ------------------------------------------------------------- escolha da unidade

export interface GrupoEscolhido<T> {
  chave: string;
  amostras: T[];
  /** Por que este grupo foi escolhido (e, quando for o caso, aviso de que a unidade pode divergir). */
  motivo: string;
  /** true quando a sigla do grupo é a mesma da unidade do item. */
  unidadeConfere: boolean;
}

function rotuloOuChave(chave: string): string {
  return rotuloUnidade(chave) ?? "sem unidade informada";
}

/**
 * Escolhe UM grupo de unidade para calcular as estatísticas (grupos nunca se
 * misturam).
 *  - Se a unidade do item é reconhecida e há grupo com a mesma sigla, vale o
 *    maior grupo com essa sigla (capacidades diferentes não se juntam).
 *  - Se a unidade do item não é reconhecida, ou nenhum grupo tem a sigla dela,
 *    vale o MAIOR grupo, e o motivo avisa que a unidade pode divergir.
 *  - Empate de tamanho: ordem da chave (resultado sempre igual).
 * Nulo quando não há nenhuma amostra.
 */
export function escolherGrupoDeUnidade<T>(
  amostrasPorChave: ReadonlyMap<string, T[]> | Record<string, T[]>,
  unidadeDoItem?: string | null,
): GrupoEscolhido<T> | null {
  const entradas = (amostrasPorChave instanceof Map ? [...amostrasPorChave.entries()] : Object.entries(amostrasPorChave)).filter(
    ([, lista]) => Array.isArray(lista) && lista.length > 0,
  );
  if (entradas.length === 0) return null;

  const maior = (lista: [string, T[]][]) =>
    [...lista].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0];

  const siglaItem = siglaDaUnidadeDoItem(unidadeDoItem);
  const mesmaSigla = siglaItem ? entradas.filter(([chave]) => separarChave(chave).sigla === siglaItem) : [];

  let escolhido: [string, T[]];
  let motivo: string;
  let confere: boolean;
  if (mesmaSigla.length > 0) {
    escolhido = maior(mesmaSigla);
    confere = true;
    motivo =
      mesmaSigla.length === 1
        ? `A unidade do item (${siglaItem}) bate com o grupo ${rotuloOuChave(escolhido[0])} (${escolhido[1].length} preços).`
        : `A unidade do item (${siglaItem}) bate com mais de um grupo (capacidades diferentes); usado o maior, ${rotuloOuChave(escolhido[0])} (${escolhido[1].length} preços). A capacidade da embalagem pode divergir da do item.`;
  } else {
    escolhido = maior(entradas);
    confere = false;
    motivo = siglaItem
      ? `Nenhum grupo de preços tem a unidade do item (${siglaItem}); usado o maior grupo, ${rotuloOuChave(escolhido[0])} (${escolhido[1].length} preços). A unidade pode divergir da do item.`
      : `A unidade do item não foi reconhecida; usado o maior grupo, ${rotuloOuChave(escolhido[0])} (${escolhido[1].length} preços). A unidade pode divergir da do item.`;
  }

  const outros = entradas
    .filter(([chave]) => chave !== escolhido[0])
    .sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
  if (outros.length > 0) {
    const lista = outros
      .slice(0, 5)
      .map(([chave, l]) => `${rotuloOuChave(chave)} (${l.length})`)
      .join(", ");
    motivo += ` Grupos de outras unidades, ignorados: ${lista}${outros.length > 5 ? " e outros" : ""}.`;
  }

  return { chave: escolhido[0], amostras: escolhido[1], motivo, unidadeConfere: confere };
}

// ------------------------------------------------------------- atualização

/**
 * A referência de um código precisa ser consultada de novo? Sim quando não há
 * referência, quando é mais velha que `diasValidade` (padrão 30) ou quando a
 * última consulta falhou há mais de `diasRetentarErro` (padrão 1) dia.
 */
export function precisaConsultar(
  existente: { consultadoEm: Date; erro: string | null } | null | undefined,
  agora: Date,
  opcoes: { diasValidade?: number; diasRetentarErro?: number } = {},
): boolean {
  if (!existente) return true;
  const diasValidade = opcoes.diasValidade ?? DIAS_VALIDADE_REFERENCIA;
  const diasRetentarErro = opcoes.diasRetentarErro ?? DIAS_RETENTAR_ERRO;
  const idadeDias = (agora.getTime() - existente.consultadoEm.getTime()) / 86_400_000;
  if (!Number.isFinite(idadeDias)) return true;
  if (existente.erro) return idadeDias > diasRetentarErro;
  return idadeDias > diasValidade;
}
