/**
 * Segurança de anexos de ata (2026-10-20).
 *
 * O `File.type` de um upload é informado pelo navegador do remetente — não
 * prova nada. Aqui o tipo é decidido pelos primeiros bytes do arquivo
 * (assinatura), e só PDF, JPEG e PNG passam.
 */

export type TipoDocumento = "application/pdf" | "image/jpeg" | "image/png";

export function detectarTipoDocumento(conteudo: Buffer): TipoDocumento | null {
  if (conteudo.length >= 5 && conteudo.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }
  if (conteudo.length >= 3 && conteudo[0] === 0xff && conteudo[1] === 0xd8 && conteudo[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    conteudo.length >= 8 &&
    conteudo.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  return null;
}

/** Nome de arquivo sem separadores de caminho, aspas nem caracteres de controle. */
export function nomeArquivoSeguro(nome: string): string {
  const semCaminho = nome.split(/[\\/]/).pop() ?? "";
  const limpo = semCaminho
    .replace(/[\u0000-\u001f\u007f"<>:*?|]/g, "")
    .trim()
    .slice(0, 150);
  return limpo || "documento";
}

/** Content-Disposition seguro (ASCII + filename* RFC 5987 para acentos). */
export function contentDispositionSeguro(nome: string): string {
  const seguro = nomeArquivoSeguro(nome);
  const ascii = seguro.replace(/[^\x20-\x7e]/g, "_").replace(/[\\"]/g, "_");
  const codificado = encodeURIComponent(seguro).replace(/['()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${ascii}"; filename*=UTF-8''${codificado}`;
}
