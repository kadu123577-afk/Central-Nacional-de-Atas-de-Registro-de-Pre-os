import { CATEGORIAS_ATAS } from "@/lib/categorias";

/**
 * Título público da ata (2026-10-20). É o único "nome" da ata que visitante e
 * órgão logado veem: genérico de propósito ("Ata de material de limpeza"), porque
 * o objeto original costuma ser o mesmo texto do PNCP e permitiria achar a ata lá
 * e contratar direto, sem a plataforma.
 *
 * Quem cadastra a ata escreve o título; se ficar vazio, o site gera um a partir
 * da categoria. Nunca cai de volta para o objeto original.
 */

const GENERICO = "Ata de registro de preços";

/** "Ata de <categoria>", ou um título neutro se a ata não tem categoria conhecida. */
export function tituloGenerico(categoria: string | null | undefined): string {
  const conhecida = CATEGORIAS_ATAS.find((c) => c.slug === categoria);
  if (!conhecida) return GENERICO;
  const r = conhecida.rotulo;
  return `Ata de ${r.charAt(0).toLowerCase()}${r.slice(1)}`;
}

/** O título que o site mostra: o escrito pela equipe ou, na falta, o genérico. */
export function tituloPublicoDaAta(
  tituloPublico: string | null | undefined,
  categoria: string | null | undefined,
): string {
  const escrito = tituloPublico?.trim();
  return escrito ? escrito : tituloGenerico(categoria);
}

export const TAMANHO_MAXIMO_TITULO = 120;

/** O que identifica a ata e NUNCA pode aparecer no título público (16/11/2026, pedido de Carlos). */
export interface IdentificadoresDaAta {
  /** Nome do órgão gerenciador ("Prefeitura Municipal de Rio Verde"). */
  orgao?: string | null;
  /** Município do órgão gerenciador. */
  municipio?: string | null;
  /** Razão social do fornecedor da ata. */
  fornecedor?: string | null;
  /** Número da ata ("11/2026"). */
  numero?: string | null;
}

/** Minúsculas, sem acento, só letras e números separados por um espaço. */
function simplificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SUFIXOS_SOCIETARIOS = new Set(["ltda", "eireli", "me", "epp", "sa", "s", "a", "cia", "ei", "mei"]);

/** O texto cita a expressão inteira (palavras inteiras, não pedaços de outra palavra)? */
function cita(textoSimples: string, expressao: string): boolean {
  const e = simplificar(expressao);
  return e.length >= 3 && ` ${textoSimples} `.includes(` ${e} `);
}

/**
 * O que, no título, entrega a ata: o município ou o órgão gerenciador, o fornecedor ou o número da ata.
 * Qualquer um deles, somado ao objeto, basta para achar a ata no PNCP e contratar direto (a plataforma
 * perde a comissão). Devolve a lista do que foi achado, vazia se o título está limpo.
 */
export function oQueOTituloRevela(titulo: string, ids: IdentificadoresDaAta): string[] {
  const t = simplificar(titulo);
  const achados: string[] = [];

  if (ids.municipio && cita(t, ids.municipio)) achados.push("o município");
  if (ids.orgao && cita(t, ids.orgao) && !achados.includes("o município")) achados.push("o órgão gerenciador");

  if (ids.fornecedor) {
    const palavras = simplificar(ids.fornecedor)
      .split(" ")
      .filter((p) => !SUFIXOS_SOCIETARIOS.has(p));
    // O nome inteiro, ou as duas primeiras palavras (a parte que identifica a empresa).
    const nome = palavras.join(" ");
    const inicio = palavras.slice(0, 2).join(" ");
    if ((nome.length >= 5 && cita(t, nome)) || (palavras.length >= 2 && inicio.length >= 5 && cita(t, inicio))) {
      achados.push("o fornecedor");
    }
  }

  const numero = ids.numero?.trim();
  if (numero && numero.length >= 4 && titulo.toLowerCase().includes(numero.toLowerCase())) achados.push("o número da ata");

  return achados;
}

/**
 * Mensagem de erro, ou null se o título (opcional) é aceitável. Com os identificadores da ata, recusa o
 * título que revela o município, o órgão, o fornecedor ou o número dela.
 */
export function validarTituloPublico(texto: string, ids?: IdentificadoresDaAta): string | null {
  const t = texto.trim();
  if (!t) return null; // vazio é permitido: o site usa o genérico
  if (t.length < 5) return "O título público precisa ter ao menos 5 caracteres.";
  if (t.length > TAMANHO_MAXIMO_TITULO) {
    return `O título público pode ter no máximo ${TAMANHO_MAXIMO_TITULO} caracteres.`;
  }
  if (ids) {
    const revelado = oQueOTituloRevela(t, ids);
    if (revelado.length > 0) {
      return `O título público não pode revelar ${revelado.join(", ")}: com isso o visitante acharia a ata no PNCP e contrataria direto, sem a plataforma. Deixe só a categoria, como "Ata de material de limpeza".`;
    }
  }
  return null;
}
