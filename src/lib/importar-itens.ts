import { resolverSlugCategoria } from "@/lib/categorias";

/**
 * Importação de itens da ata por planilha (2026-11-14), para a captação cadastrar muitos itens
 * de uma vez. Regras puras: sem banco, sem rede. Entra o texto copiado do Excel (colunas
 * separadas por tabulação) ou de um arquivo CSV (ponto e vírgula ou vírgula); a primeira linha
 * é o cabeçalho. Nada é gravado aqui: devolve os itens válidos e a lista de erros por linha,
 * para a tela conferir antes de gravar. Tudo ou nada: com qualquer erro, nada é gravado.
 *
 * Colunas (com sinônimos, sem acento e sem diferença de maiúscula):
 *   descrição*, unidade*, quantidade*, valor unitário*, marca, categoria, código do catálogo
 * (* obrigatórias; categoria pode faltar se a ata já tem categoria).
 */

export const LIMITE_LINHAS_IMPORTACAO = 500;
export const LIMITE_CARACTERES_IMPORTACAO = 200_000;

export interface ItemImportado {
  linha: number;
  descricao: string;
  unidade: string;
  quantidadeRegistrada: number;
  /** Texto com duas casas ("25.90"), do jeito que o banco (Decimal) recebe. */
  valorUnitario: string;
  marca: string | null;
  categoria: string;
  codigoCatalogo: string | null;
}

export interface ErroImportacao {
  /** Número da linha na planilha (a do cabeçalho é a 1). 0 = erro do arquivo inteiro. */
  linha: number;
  mensagem: string;
}

export interface ResultadoImportacao {
  itens: ItemImportado[];
  erros: ErroImportacao[];
  /** Linhas de dados lidas (sem o cabeçalho e sem linhas em branco). */
  linhasLidas: number;
}

type Coluna = "descricao" | "unidade" | "quantidade" | "valor" | "marca" | "categoria" | "codigo";

// Sinônimos em ordem de preferência: "descrição" vale mais que "item", porque em muita planilha a
// coluna "Item" é só o número da linha. Os cabeçalhos são comparados sem acento, sem pontuação e sem
// "(R$)" (ver normalizarCabecalho).
const SINONIMOS_BRUTOS: Record<Coluna, string[]> = {
  descricao: [
    "descricao",
    "descricao do item",
    "descricao do produto",
    "descricao resumida",
    "descricao do objeto",
    "descricao/especificacao",
    "descricao especificacao",
    "especificacao",
    "item",
    "objeto",
    "produto",
  ],
  unidade: ["unidade", "unidade de medida", "unidade de fornecimento", "unid medida", "unid", "und", "un"],
  quantidade: ["quantidade", "quantidade registrada", "quantidade total", "qtd total", "qtde total", "qtd", "qtde", "quant"],
  valor: [
    "valor unitario",
    "valor unitario registrado",
    "preco unitario",
    "valor unit",
    "preco unit",
    "vl unitario",
    "vlr unitario",
    "valor un",
    "preco",
    "valor",
  ],
  marca: ["marca", "fabricante"],
  categoria: ["categoria", "tema"],
  codigo: ["codigo do catalogo", "codigo catalogo", "codigo catmat", "cod catmat", "catmat/catser", "catmat", "catser", "cod catalogo", "codigo"],
};

/** Cabeçalho comparável: sem acento, sem maiúscula, sem pontuação e sem "(R$)"; espaços reduzidos a um. */
export function normalizarCabecalho(texto: string): string {
  return semAcento(texto)
    .replace(/r\$/g, " ")
    .replace(/[().:*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SINONIMOS = Object.fromEntries(
  (Object.keys(SINONIMOS_BRUTOS) as Coluna[]).map((c) => [c, SINONIMOS_BRUTOS[c].map(normalizarCabecalho)]),
) as Record<Coluna, string[]>;

/** Índice de cada coluna conhecida no cabeçalho (já normalizado), pela ordem de preferência dos sinônimos. */
function indicesDoCabecalho(cabecalho: string[]): Partial<Record<Coluna, number>> {
  const indice: Partial<Record<Coluna, number>> = {};
  const usados = new Set<number>();
  for (const coluna of Object.keys(SINONIMOS) as Coluna[]) {
    for (const sinonimo of SINONIMOS[coluna]) {
      const i = cabecalho.findIndex((c, pos) => c === sinonimo && !usados.has(pos));
      if (i >= 0) {
        indice[coluna] = i;
        usados.add(i);
        break;
      }
    }
  }
  return indice;
}

/** A linha é um cabeçalho de itens: tem as quatro colunas obrigatórias (descrição, unidade, quantidade e valor unitário). */
export function cabecalhoReconhecido(celulas: string[]): boolean {
  const indice = indicesDoCabecalho(celulas.map(normalizarCabecalho));
  return OBRIGATORIAS.every((c) => indice[c] !== undefined);
}

const OBRIGATORIAS: Coluna[] = ["descricao", "unidade", "quantidade", "valor"];
const ROTULO_COLUNA: Record<Coluna, string> = {
  descricao: "descrição",
  unidade: "unidade",
  quantidade: "quantidade",
  valor: "valor unitário",
  marca: "marca",
  categoria: "categoria",
  codigo: "código do catálogo",
};

function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function detectarSeparador(cabecalho: string): string {
  if (cabecalho.includes("\t")) return "\t";
  if (cabecalho.includes(";")) return ";";
  return ",";
}

/** Divide uma linha respeitando aspas ("Caneta, azul"; aspas duplas dentro de aspas valem uma aspa). */
function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (dentroDeAspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else if (c === '"') {
        dentroDeAspas = false;
      } else {
        atual += c;
      }
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === separador) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((x) => x.trim());
}

/** "1.234,56", "25,90", "25.90" e "R$ 1.000" viram número; qualquer outra coisa vira null. */
export function numeroDaPlanilha(texto: string): number | null {
  const limpo = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!limpo) return null;
  let normal = limpo;
  if (limpo.includes(",")) normal = limpo.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) normal = limpo.replace(/\./g, ""); // 1.234 = mil duzentos e trinta e quatro
  if (!/^\d+(\.\d+)?$/.test(normal)) return null;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

function interpretarCodigo(texto: string): { ok: true; codigo: string | null } | { ok: false } {
  const t = texto.trim();
  if (!t) return { ok: true, codigo: null };
  if (!/^[0-9]{1,10}$/.test(t)) return { ok: false };
  const semZeros = t.replace(/^0+/, "");
  return semZeros ? { ok: true, codigo: semZeros } : { ok: false };
}

export function interpretarPlanilhaDeItens(texto: string, categoriaPadrao: string | null): ResultadoImportacao {
  const resultado: ResultadoImportacao = { itens: [], erros: [], linhasLidas: 0 };

  if (texto.length > LIMITE_CARACTERES_IMPORTACAO) {
    resultado.erros.push({ linha: 0, mensagem: "O texto é grande demais. Divida a planilha em partes menores." });
    return resultado;
  }
  const linhas = texto
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l, i) => ({ texto: l, numero: i + 1 }))
    .filter((l) => l.texto.trim() !== "");
  if (linhas.length === 0) {
    resultado.erros.push({ linha: 0, mensagem: "Cole ou envie a planilha: a primeira linha é o cabeçalho." });
    return resultado;
  }

  const separador = detectarSeparador(linhas[0].texto);
  const cabecalho = dividirLinha(linhas[0].texto, separador).map(normalizarCabecalho);
  const indice = indicesDoCabecalho(cabecalho);
  const faltando = OBRIGATORIAS.filter((c) => indice[c] === undefined);
  if (faltando.length > 0) {
    resultado.erros.push({
      linha: 1,
      mensagem: `Faltam colunas no cabeçalho: ${faltando.map((c) => ROTULO_COLUNA[c]).join(", ")}.`,
    });
    return resultado;
  }

  const dados = linhas.slice(1);
  if (dados.length > LIMITE_LINHAS_IMPORTACAO) {
    resultado.erros.push({
      linha: 0,
      mensagem: `A planilha tem ${dados.length} itens; o limite por importação é ${LIMITE_LINHAS_IMPORTACAO}. Divida em partes.`,
    });
    return resultado;
  }
  resultado.linhasLidas = dados.length;

  const campo = (celulas: string[], coluna: Coluna) => (indice[coluna] === undefined ? "" : (celulas[indice[coluna]!] ?? ""));

  for (const { texto: linha, numero } of dados) {
    const celulas = dividirLinha(linha, separador);
    const problemas: string[] = [];

    const descricao = campo(celulas, "descricao");
    if (!descricao) problemas.push("descrição vazia");
    const unidade = campo(celulas, "unidade");
    if (!unidade) problemas.push("unidade vazia");

    const quantidade = numeroDaPlanilha(campo(celulas, "quantidade"));
    if (quantidade === null || quantidade <= 0) problemas.push("quantidade inválida");
    else if (!Number.isInteger(quantidade)) problemas.push("a quantidade precisa ser um número inteiro");

    const valor = numeroDaPlanilha(campo(celulas, "valor"));
    if (valor === null || valor <= 0) problemas.push("valor unitário inválido");

    const textoCategoria = campo(celulas, "categoria");
    let categoria = categoriaPadrao;
    if (textoCategoria) {
      const slug = resolverSlugCategoria(textoCategoria);
      if (slug) categoria = slug;
      else problemas.push(`categoria "${textoCategoria}" não existe`);
    }
    if (!categoria && !problemas.some((p) => p.startsWith("categoria"))) {
      problemas.push("sem categoria (a ata não tem categoria; preencha a coluna)");
    }

    const codigo = interpretarCodigo(campo(celulas, "codigo"));
    if (!codigo.ok) problemas.push("código do catálogo deve ter só números (até 10) e não pode ser zero");

    if (problemas.length > 0) {
      resultado.erros.push({ linha: numero, mensagem: problemas.join("; ") });
      continue;
    }
    resultado.itens.push({
      linha: numero,
      descricao,
      unidade,
      quantidadeRegistrada: quantidade as number,
      valorUnitario: (valor as number).toFixed(2),
      marca: campo(celulas, "marca") || null,
      categoria: categoria as string,
      codigoCatalogo: codigo.ok ? codigo.codigo : null,
    });
  }
  return resultado;
}
