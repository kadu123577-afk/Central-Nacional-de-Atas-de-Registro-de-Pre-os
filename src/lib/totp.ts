import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * 2FA por app autenticador (TOTP, RFC 6238: SHA-1, 6 dígitos, passo de 30 s)
 * — compatível com Google Authenticator, Microsoft Authenticator, Authy etc.
 * Implementado com o crypto do Node para não adicionar dependência.
 */

const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PASSO_SEGUNDOS = 30;
const DIGITOS = 6;

export function codificarBase32(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

export function decodificarBase32(texto: string): Buffer {
  const limpo = texto.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const caractere of limpo) {
    const indice = ALFABETO_BASE32.indexOf(caractere);
    if (indice === -1) throw new Error("Segredo base32 inválido");
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function gerarSegredoTotp(): string {
  return codificarBase32(randomBytes(20));
}

export function codigoTotp(segredoBase32: string, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac("sha1", decodificarBase32(segredoBase32)).update(contador).digest();
  const deslocamento = hmac[hmac.length - 1] & 0x0f;
  const numero =
    ((hmac[deslocamento] & 0x7f) << 24) |
    (hmac[deslocamento + 1] << 16) |
    (hmac[deslocamento + 2] << 8) |
    hmac[deslocamento + 3];
  return String(numero % 10 ** DIGITOS).padStart(DIGITOS, "0");
}

export function passoAtual(agoraMs: number = Date.now()): number {
  return Math.floor(agoraMs / 1000 / PASSO_SEGUNDOS);
}

function igualEmTempoConstante(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Confere o código aceitando 1 passo de folga para cada lado (relógios
 * levemente fora de hora). Retorna o passo que bateu — o chamador deve
 * gravá-lo e recusar passos <= ao último usado (anti-reuso) — ou null.
 */
export function verificarTotp(
  segredoBase32: string,
  codigoInformado: string,
  ultimoPassoUsado: number | null,
  agoraMs: number = Date.now(),
): number | null {
  const codigo = codigoInformado.replace(/\s/g, "");
  if (!/^\d{6}$/.test(codigo)) return null;

  const atual = passoAtual(agoraMs);
  let passoValido: number | null = null;
  // Percorre todas as janelas sem interromper, para não vazar por tempo qual bateu.
  for (const passo of [atual - 1, atual, atual + 1]) {
    if (igualEmTempoConstante(codigoTotp(segredoBase32, passo), codigo) && passoValido === null) {
      passoValido = passo;
    }
  }
  if (passoValido === null) return null;
  if (ultimoPassoUsado !== null && passoValido <= ultimoPassoUsado) return null;
  return passoValido;
}

export function uriOtpauth(segredoBase32: string, email: string, emissor: string): string {
  const rotulo = encodeURIComponent(`${emissor}:${email}`);
  return `otpauth://totp/${rotulo}?secret=${segredoBase32}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=${DIGITOS}&period=${PASSO_SEGUNDOS}`;
}

// --- cifra do segredo em repouso (AES-256-GCM) ---------------------------

function chaveDeCifra(): Buffer {
  const base = process.env.TOTP_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!base) {
    throw new Error("Defina SESSION_SECRET (ou TOTP_ENCRYPTION_KEY) para cifrar o segredo do 2FA.");
  }
  return createHash("sha256").update(`totp-v1:${base}`).digest();
}

export function cifrarSegredo(segredoBase32: string): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chaveDeCifra(), iv);
  const conteudo = Buffer.concat([cifra.update(segredoBase32, "utf8"), cifra.final()]);
  const etiqueta = cifra.getAuthTag();
  return [iv, etiqueta, conteudo].map((b) => b.toString("base64url")).join(".");
}

export function decifrarSegredo(armazenado: string): string {
  const [iv, etiqueta, conteudo] = armazenado.split(".").map((p) => Buffer.from(p, "base64url"));
  const decifra = createDecipheriv("aes-256-gcm", chaveDeCifra(), iv);
  decifra.setAuthTag(etiqueta);
  return Buffer.concat([decifra.update(conteudo), decifra.final()]).toString("utf8");
}
