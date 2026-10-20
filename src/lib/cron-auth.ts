import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Autoriza chamadas às rotas de rastreamento (/api/rastreador-*).
 *
 * Antes (2026-10-20) a rota ficava ABERTA quando CRON_SECRET não estava
 * definido — esquecer a variável em produção expunha o rastreador a
 * qualquer pessoa. Agora, em produção, sem o segredo configurado a rota
 * recusa tudo; só em desenvolvimento ela funciona sem segredo.
 */
export function cronAutorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    return process.env.NODE_ENV !== "production";
  }

  const recebido = request.headers.get("authorization") ?? "";
  const hashRecebido = createHash("sha256").update(recebido).digest();
  const hashEsperado = createHash("sha256").update(`Bearer ${segredo}`).digest();
  return timingSafeEqual(hashRecebido, hashEsperado);
}
