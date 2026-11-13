import { urlAtaPncp } from "@/lib/radar-atas-view";

/**
 * Link da ata no PNCP (14/11/2026): a fonte oficial da ata, guardada para a EQUIPE conferir a versão
 * vigente. Só é aceito endereço de pncp.gov.br (ou o número de controle da ata, que vira o endereço): um
 * campo de texto livre que a equipe e os consultores clicam não pode apontar para qualquer site.
 * Nunca é mostrado ao público, ao órgão nem ao fornecedor (o PNCP permite o município contratar direto).
 */

export type ResultadoLinkPncp = { ok: true; url: string | null } | { ok: false; erro: string };

export const LIMITE_LINK_PNCP = 300;

const NUMERO_DE_CONTROLE = /^\d{14}-\d-\d{1,10}\/\d{4}-\d{1,10}$/;

export function lerLinkPncp(texto: string | null | undefined): ResultadoLinkPncp {
  const bruto = (texto ?? "").trim();
  if (!bruto) return { ok: true, url: null };

  if (NUMERO_DE_CONTROLE.test(bruto)) {
    const url = urlAtaPncp(bruto);
    return url ? { ok: true, url } : { ok: false, erro: "Número de controle do PNCP inválido." };
  }

  const erro = "Use o endereço da ata no PNCP (começa com https://pncp.gov.br) ou o número de controle da ata.";
  if (bruto.length > LIMITE_LINK_PNCP) return { ok: false, erro };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(bruto) ? bruto : `https://${bruto}`);
  } catch {
    return { ok: false, erro };
  }
  const host = url.hostname.toLowerCase();
  const dominioCerto = host === "pncp.gov.br" || host.endsWith(".pncp.gov.br");
  if (url.protocol !== "https:" || !dominioCerto || url.username || url.password || url.port) {
    return { ok: false, erro };
  }
  url.hash = "";
  const final = url.toString();
  return final.length > LIMITE_LINK_PNCP ? { ok: false, erro } : { ok: true, url: final };
}

/** O endereço da ata no PNCP para a tela: o link guardado ou, na falta dele, o do número de controle (ata importada do PNCP). */
export function linkPncpDaAta(ata: { linkPncp?: string | null; numeroControlePncp?: string | null }): string | null {
  if (ata.linkPncp) {
    const lido = lerLinkPncp(ata.linkPncp);
    if (lido.ok && lido.url) return lido.url;
  }
  return ata.numeroControlePncp ? urlAtaPncp(ata.numeroControlePncp) : null;
}
