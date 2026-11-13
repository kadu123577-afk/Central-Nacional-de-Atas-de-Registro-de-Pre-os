import { cabecalhoReconhecido, numeroDaPlanilha } from "@/lib/importar-itens";

/**
 * Leitura dos arquivos que o estagiário usa para cadastrar os itens da ata (14/11/2026): Excel
 * (.xlsx), PDF e texto (CSV). Tudo vira o MESMO texto de planilha (colunas separadas por tabulação,
 * primeira linha de cabeçalho) que o importador já sabe conferir: o estagiário vê o que foi lido, pode
 * corrigir no campo e só então confere e grava. Nada é gravado aqui.
 *
 * O Excel tem colunas de verdade; o PDF não: o texto sai de um desenho de página, então os itens são
 * reconstruídos por posição e por heurística (descrição, unidade, quantidade e valores no fim da
 * linha, com a conta quantidade × valor unitário = valor total como prova, quando o PDF traz o total).
 * O que a heurística não entende fica numa lista de "linhas não lidas" para a pessoa digitar.
 * PDF escaneado (imagem) não tem texto: não é lido (não há OCR).
 */

export type FormatoDoArquivo = "xlsx" | "pdf" | "texto" | "xls" | "ods" | "imagem" | "desconhecido";

/** Descobre o formato pelos primeiros bytes (o nome e o tipo declarado pelo navegador não provam nada). */
export function detectarFormato(nome: string, bytes: Uint8Array): FormatoDoArquivo {
  const b = bytes;
  const extensao = (/\.([a-z0-9]+)$/i.exec(nome)?.[1] ?? "").toLowerCase();
  const comeca = (...assinatura: number[]) => assinatura.every((v, i) => b[i] === v);

  if (comeca(0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf"; // %PDF-
  if (comeca(0x50, 0x4b, 0x03, 0x04)) {
    // ZIP: .xlsx e .ods são zips; só o nome distingue.
    if (extensao === "ods") return "ods";
    return extensao === "xlsx" || extensao === "xlsm" ? "xlsx" : "desconhecido";
  }
  if (comeca(0xd0, 0xcf, 0x11, 0xe0)) return "xls"; // Excel antigo (.xls)
  if (comeca(0x89, 0x50, 0x4e, 0x47) || comeca(0xff, 0xd8, 0xff)) return "imagem";

  // Texto: sem byte nulo nos primeiros 2 KB.
  const amostra = b.subarray(0, 2048);
  if (amostra.includes(0)) return "desconhecido";
  return "texto";
}

export const MENSAGEM_FORMATO: Partial<Record<FormatoDoArquivo, string>> = {
  xls: "Este é um Excel antigo (.xls). Abra no Excel e salve como “Pasta de Trabalho do Excel (.xlsx)”, ou copie as células e cole no campo.",
  ods: "Este é um arquivo do LibreOffice (.ods). Salve como .xlsx, ou copie as células e cole no campo.",
  imagem: "Imagem não dá para ler. Envie o PDF em texto, o Excel, ou copie as células e cole no campo.",
  desconhecido: "Não reconheci este arquivo. Envie Excel (.xlsx), PDF ou CSV, ou copie as células e cole no campo.",
};

export interface ArquivoLido {
  /** O texto de planilha, pronto para o importador conferir. */
  texto: string;
  formato: "xlsx" | "pdf" | "texto";
  /** Recado para a tela (o que foi lido, o que conferir). */
  aviso: string | null;
  /** Linhas do PDF que não pareciam item (para a pessoa digitar, se forem). */
  naoLidas: string[];
}

export type ResultadoLeitura = ({ ok: true } & ArquivoLido) | { ok: false; erro: string };

// ───────────────────────────── Excel ─────────────────────────────

export type CelulaBruta = string | number | boolean | Date | null | undefined;

/** Uma célula do Excel em texto de planilha: número com vírgula decimal (para "1.234" não virar mil), data como dd/mm/aaaa. */
export function celulaParaTexto(v: CelulaBruta): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v).replace(".", ",") : "";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    const dd = String(v.getUTCDate()).padStart(2, "0");
    const mm = String(v.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${v.getUTCFullYear()}`;
  }
  return String(v).replace(/\s+/g, " ").trim();
}

const LINHAS_PROCURANDO_CABECALHO = 60;
const LINHA_DE_TOTAL = /^(valor\s+)?total(\s+geral)?\b/i;

/** Escapa um campo para o texto de planilha: aspas duplicadas e entre aspas, se houver aspas. */
function campoDeTexto(campo: string): string {
  return campo.includes('"') ? `"${campo.replace(/"/g, '""')}"` : campo;
}

function linhaDeTexto(celulas: string[]): string {
  const c = [...celulas];
  while (c.length > 0 && c[c.length - 1] === "") c.pop();
  return c.map(campoDeTexto).join("\t");
}

/**
 * Matriz de células → texto de planilha. Acha o cabeçalho de itens (descrição, unidade, quantidade e
 * valor unitário) entre as primeiras linhas, descarta o que vem antes (títulos, dados da ata) e as
 * linhas em branco e de total. Sem cabeçalho reconhecido, devolve a matriz toda: o importador dá o
 * erro ("faltam colunas") e a pessoa vê o que foi lido.
 */
export function matrizParaTexto(matriz: string[][]): { texto: string; achouCabecalho: boolean } {
  const inicio = matriz.slice(0, LINHAS_PROCURANDO_CABECALHO).findIndex((linha) => cabecalhoReconhecido(linha));
  const achou = inicio >= 0;
  const linhas = (achou ? matriz.slice(inicio) : matriz).filter((linha, i) => {
    if (linha.every((c) => c === "")) return false;
    if (achou && i === 0) return true;
    const primeiras = linha.filter((c) => c !== "").slice(0, 2);
    return !primeiras.some((c) => LINHA_DE_TOTAL.test(c));
  });
  return { texto: linhas.map(linhaDeTexto).join("\n"), achouCabecalho: achou };
}

/** Lê a primeira planilha do Excel (.xlsx) que tenha um cabeçalho de itens; sem nenhuma, a primeira com dados. */
export async function lerXlsx(bytes: Uint8Array): Promise<ResultadoLeitura> {
  let planilhas: { sheet: string; data: CelulaBruta[][] }[];
  try {
    const { default: lerArquivoXlsx } = await import("read-excel-file/node");
    planilhas = (await lerArquivoXlsx(Buffer.from(bytes))) as unknown as { sheet: string; data: CelulaBruta[][] }[];
  } catch {
    return { ok: false, erro: "Não consegui abrir este Excel. Confira se é um arquivo .xlsx válido e sem senha." };
  }

  const comDados = planilhas
    .map((p) => ({ nome: p.sheet, matriz: p.data.map((linha) => linha.map(celulaParaTexto)) }))
    .filter((p) => p.matriz.some((linha) => linha.some((c) => c !== "")));
  if (comDados.length === 0) return { ok: false, erro: "O Excel está vazio." };

  for (const p of comDados) {
    const { texto, achouCabecalho } = matrizParaTexto(p.matriz);
    if (achouCabecalho) {
      const outras = comDados.length > 1 ? ` (aba “${p.nome}”; as outras abas não foram lidas)` : "";
      return { ok: true, formato: "xlsx", texto, naoLidas: [], aviso: `Li o Excel${outras}. Confira a lista antes de gravar.` };
    }
  }
  const primeira = comDados[0];
  return {
    ok: true,
    formato: "xlsx",
    texto: matrizParaTexto(primeira.matriz).texto,
    naoLidas: [],
    aviso: null,
  };
}

// ───────────────────────────── PDF ─────────────────────────────

/** Um pedaço de texto da página, com a posição (em pontos, origem embaixo à esquerda) e a largura. */
export interface PedacoDeTexto {
  texto: string;
  x: number;
  y: number;
  largura: number;
}

const TOLERANCIA_DE_LINHA = 3;
const ESPACO_ENTRE_PALAVRAS = 0.8;
const ESPACO_ENTRE_COLUNAS = 7;

/**
 * Pedaços de texto de uma página → linhas de texto, de cima para baixo. Pedaços na mesma altura formam
 * uma linha, da esquerda para a direita; o vazio largo entre dois pedaços vira tabulação (separa
 * colunas), o pequeno vira espaço.
 */
export function linhasDaPagina(pedacos: PedacoDeTexto[]): string[] {
  const validos = pedacos.filter((p) => p.texto.trim() !== "" && Number.isFinite(p.x) && Number.isFinite(p.y));
  const ordenados = [...validos].sort((a, b) => b.y - a.y || a.x - b.x);

  const grupos: { y: number; pedacos: PedacoDeTexto[] }[] = [];
  for (const p of ordenados) {
    const grupo = grupos.find((g) => Math.abs(g.y - p.y) <= TOLERANCIA_DE_LINHA);
    if (grupo) grupo.pedacos.push(p);
    else grupos.push({ y: p.y, pedacos: [p] });
  }

  return grupos
    .sort((a, b) => b.y - a.y)
    .map((g) => {
      const linha = g.pedacos.sort((a, b) => a.x - b.x);
      let texto = "";
      let fimAnterior: number | null = null;
      for (const p of linha) {
        const conteudo = p.texto.replace(/\s+/g, " ");
        if (fimAnterior !== null) {
          const vazio = p.x - fimAnterior;
          if (vazio > ESPACO_ENTRE_COLUNAS) texto += "\t";
          else if (vazio > ESPACO_ENTRE_PALAVRAS && !texto.endsWith(" ") && !conteudo.startsWith(" ")) texto += " ";
        }
        texto += conteudo;
        fimAnterior = p.x + p.largura;
      }
      return texto.replace(/[ ]*\t[ ]*/g, "\t").trim();
    })
    .filter((l) => l !== "");
}

export interface ItemDoPdf {
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  codigo: string | null;
}

export interface ResultadoDasLinhas {
  itens: ItemDoPdf[];
  /** Linhas que não pareciam item nem lixo conhecido (cabeçalho, página, total). */
  naoLidas: string[];
  /** Quantas linhas de continuação foram juntadas à descrição do item anterior. */
  juntadas: number;
}

/** Número como aparece no PDF: 1.234,56 · 25,90 · 25.90 · 100, com ou sem "R$". */
function pareceNumero(token: string): boolean {
  const t = token.replace(/^R\$\s*/i, "");
  return /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /^\d+(,\d+)?$/.test(t) || /^\d+\.\d{1,2}$/.test(t);
}

const pareceUnidade = (t: string) => /^[A-Za-zÀ-ÿ./²³]{1,20}$/.test(t);
const LINHA_DE_PAGINA = /^(p[aá]gina|p[aá]g\.?)\s*\d+|^\d+\s*(\/|de)\s*\d+$/i;
const LINHA_DE_CABECALHO = /descri[cç][aã]o|especifica[cç][aã]o|^item\b/i;
const QUANTIDADE_NO_CABECALHO = /quantidade|qtd|qtde/i;

function ehLinhaIgnorada(linha: string): boolean {
  const t = linha.replace(/\t/g, " ").trim();
  if (LINHA_DE_PAGINA.test(t) || LINHA_DE_TOTAL.test(t)) return true;
  return LINHA_DE_CABECALHO.test(t) && QUANTIDADE_NO_CABECALHO.test(t);
}

const proximo = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.001);

/** Escrito como dinheiro: termina em vírgula (ou ponto) e uma ou duas casas ("350,00"); "1.000" é milhar, não centavos. */
const temCentavos = (token: string) => /[,.]\d{1,2}$/.test(token.replace(/^R\$\s*/i, ""));

/**
 * Os números do fim da linha → quantidade e valor unitário; o total, se vier, tem de bater com a conta.
 * Ordem mais comum: quantidade e depois valor. Se o primeiro está escrito com centavos e o segundo não,
 * ou o primeiro não é inteiro e o segundo é, as colunas vieram na ordem contrária.
 */
function quantidadeEValor(nums: number[], tokens: string[]): { quantidade: number; valorUnitario: number } | null {
  if (nums.length < 2) return null;
  let i = nums.length - 2; // posição do primeiro dos dois números
  if (nums.length >= 3) {
    const [x, y, total] = nums.slice(-3);
    // Os três últimos são "quantidade, valor, total" (ou "valor, quantidade, total") quando a conta fecha.
    // Se não fecha, não dá para saber qual é qual: a linha vai para as não lidas, em vez de chutar.
    if (!proximo(x * y, total)) return null;
    i = nums.length - 3;
  }
  let [a, b] = [nums[i], nums[i + 1]];
  const [ta, tb] = [tokens[i], tokens[i + 1]];
  if ((temCentavos(ta) && !temCentavos(tb)) || (!Number.isInteger(a) && Number.isInteger(b))) [a, b] = [b, a];
  if (!Number.isInteger(a) || a <= 0 || !(b > 0)) return null;
  return { quantidade: a, valorUnitario: b };
}

/** Uma linha do PDF como item, ou null. Aceita colunas separadas por tabulação ou só por espaço. */
export function interpretarLinhaDeItem(linha: string): ItemDoPdf | null {
  const modos: string[][] = [];
  if (linha.includes("\t")) modos.push(linha.split("\t").map((p) => p.trim()).filter(Boolean));
  modos.push(linha.replace(/\t/g, " ").split(/\s+/).filter(Boolean));

  for (const modo of modos) {
    const emCelulas = modo === modos[0] && linha.includes("\t");
    const partes = modo.filter((p) => !/^R\$$/i.test(p));
    const nums: string[] = [];
    while (partes.length > 0 && nums.length < 3 && pareceNumero(partes[partes.length - 1])) nums.unshift(partes.pop() as string);
    const valores = nums.map((n) => numeroDaPlanilha(n));
    if (valores.some((v) => v === null)) continue;
    const qv = quantidadeEValor(valores as number[], nums);
    if (!qv) continue;

    const unidade = partes.pop();
    if (!unidade || (emCelulas ? unidade.length > 25 || pareceNumero(unidade) : !pareceUnidade(unidade))) continue;

    // Número do item e código do catálogo no começo, se houver.
    if (partes.length > 1 && /^\d{1,4}[.)-]?$/.test(partes[0])) partes.shift();
    let codigo: string | null = null;
    if (partes.length > 1 && /^\d{5,9}$/.test(partes[0])) codigo = (partes.shift() as string).replace(/^0+/, "") || null;

    const descricao = partes.join(" ").replace(/\s+/g, " ").trim();
    if ((descricao.match(/[A-Za-zÀ-ÿ]/g) ?? []).length < 3) continue;
    return { descricao, unidade, quantidade: qv.quantidade, valorUnitario: qv.valorUnitario, codigo };
  }
  return null;
}

const MAX_JUNTADAS_POR_ITEM = 2;
const MAX_NAO_LIDAS = 40;

/**
 * Linhas do PDF → itens. Linha que não é item nem lixo conhecido (cabeçalho, número de página, total),
 * logo depois de um item, começando em minúscula ou curta, é continuação da descrição dele (descrição
 * que quebrou em duas linhas): é juntada e contada. O resto vai para as "não lidas".
 */
export function interpretarLinhasDoPdf(linhas: string[]): ResultadoDasLinhas {
  const itens: ItemDoPdf[] = [];
  const naoLidas: string[] = [];
  let juntadas = 0;
  let juntadasNoUltimo = 0;
  let anteriorFoiItem = false;

  for (const bruta of linhas) {
    const linha = bruta.trim();
    if (!linha || ehLinhaIgnorada(linha)) {
      anteriorFoiItem = false;
      continue;
    }
    const item = interpretarLinhaDeItem(linha);
    if (item) {
      itens.push(item);
      juntadasNoUltimo = 0;
      anteriorFoiItem = true;
      continue;
    }
    const texto = linha.replace(/\t/g, " ").replace(/\s+/g, " ");
    const pareceContinuacao = /^[a-zà-ÿ(/,;-]/.test(texto) || texto.length <= 80;
    if (anteriorFoiItem && itens.length > 0 && juntadasNoUltimo < MAX_JUNTADAS_POR_ITEM && texto.length <= 140 && pareceContinuacao) {
      itens[itens.length - 1].descricao = `${itens[itens.length - 1].descricao} ${texto}`;
      juntadasNoUltimo += 1;
      juntadas += 1;
      continue;
    }
    anteriorFoiItem = false;
    if (texto.length >= 3) naoLidas.push(texto.length > 200 ? `${texto.slice(0, 199)}…` : texto);
  }
  return { itens, naoLidas: naoLidas.slice(0, MAX_NAO_LIDAS), juntadas };
}

/** Os itens do PDF no texto de planilha que o importador confere (valor com vírgula decimal). */
export function itensDoPdfParaTexto(itens: ItemDoPdf[]): string {
  const cabecalho = ["Descrição", "Unidade", "Quantidade", "Valor unitário", "Código do catálogo"].join("\t");
  const linhas = itens.map((i) =>
    [
      campoDeTexto(i.descricao),
      campoDeTexto(i.unidade),
      String(i.quantidade),
      i.valorUnitario.toFixed(2).replace(".", ","),
      i.codigo ?? "",
    ].join("\t"),
  );
  return [cabecalho, ...linhas].join("\n");
}

const MAX_PAGINAS_PDF = 80;

/** Lê o PDF (só os que têm texto), reconstrói as linhas por posição e extrai os itens. */
export async function lerPdf(bytes: Uint8Array): Promise<ResultadoLeitura> {
  let linhas: string[] = [];
  let paginas = 0;
  try {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    try {
      paginas = pdf.numPages;
      for (let n = 1; n <= Math.min(paginas, MAX_PAGINAS_PDF); n += 1) {
        const pagina = await pdf.getPage(n);
        const conteudo = await pagina.getTextContent();
        const pedacos: PedacoDeTexto[] = [];
        for (const item of conteudo.items) {
          if (!("str" in item) || !Array.isArray(item.transform)) continue;
          pedacos.push({ texto: item.str, x: item.transform[4], y: item.transform[5], largura: item.width ?? 0 });
        }
        linhas = linhas.concat(linhasDaPagina(pedacos));
      }
    } finally {
      // Libera a memória do documento; a versão da biblioteca pode não ter o método, e isso não importa.
      try {
        await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
      } catch {
        // sem efeito sobre o resultado
      }
    }
  } catch {
    return { ok: false, erro: "Não consegui abrir este PDF. Ele pode estar protegido por senha ou danificado." };
  }

  if (linhas.length === 0) {
    return {
      ok: false,
      erro: "Este PDF não tem texto (parece uma imagem escaneada) e eu não leio imagem. Envie o Excel, um PDF em texto, ou copie os itens e cole no campo.",
    };
  }

  const lido = interpretarLinhasDoPdf(linhas);
  if (lido.itens.length === 0) {
    return {
      ok: false,
      erro: "Não encontrei itens neste PDF (descrição, unidade, quantidade e valor em cada linha). Se a tabela estiver em outro formato, copie os itens e cole no campo, ou envie o Excel.",
    };
  }

  const partes = [
    `Li ${lido.itens.length} item(ns) do PDF${paginas > MAX_PAGINAS_PDF ? ` (só as primeiras ${MAX_PAGINAS_PDF} páginas)` : ""}.`,
    "O PDF não é uma planilha: confira cada linha no campo abaixo (descrição, unidade, quantidade e valor) e corrija o que estiver errado antes de gravar.",
  ];
  if (lido.juntadas > 0) partes.push(`${lido.juntadas} linha(s) que pareciam continuação da descrição foram juntadas ao item de cima.`);
  return { ok: true, formato: "pdf", texto: itensDoPdfParaTexto(lido.itens), naoLidas: lido.naoLidas, aviso: partes.join(" ") };
}

// ───────────────────────────── Entrada única ─────────────────────────────

/** CSV do Excel no Windows costuma vir em Windows-1252, não em UTF-8: tenta UTF-8 e, se não for válido, cai para ele. */
function decodificarTexto(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Lê o arquivo enviado (ou o documento da ata) conforme o formato e devolve o texto de planilha. */
export async function lerArquivoDeItens(nome: string, bytes: Uint8Array): Promise<ResultadoLeitura> {
  const formato = detectarFormato(nome, bytes);
  switch (formato) {
    case "xlsx":
      return lerXlsx(bytes);
    case "pdf":
      return lerPdf(bytes);
    case "texto":
      return { ok: true, formato: "texto", texto: decodificarTexto(bytes), aviso: null, naoLidas: [] };
    default:
      return { ok: false, erro: MENSAGEM_FORMATO[formato] ?? MENSAGEM_FORMATO.desconhecido! };
  }
}
