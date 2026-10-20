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

/** Mensagem de erro, ou null se o título (opcional) é aceitável. */
export function validarTituloPublico(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null; // vazio é permitido: o site usa o genérico
  if (t.length < 5) return "O título público precisa ter ao menos 5 caracteres.";
  if (t.length > TAMANHO_MAXIMO_TITULO) {
    return `O título público pode ter no máximo ${TAMANHO_MAXIMO_TITULO} caracteres.`;
  }
  return null;
}
