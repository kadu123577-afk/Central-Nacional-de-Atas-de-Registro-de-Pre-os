/**
 * Utilitários compartilhados pelos coletores estaduais (sem dependências externas).
 */
import zlib from "node:zlib";

/** Lê um ZIP inteiro em memória e devolve [{ nome, dados: Buffer }]. Suporta "stored" e "deflate". */
export function lerZip(buf) {
  // fim do diretório central: assinatura 0x06054b50 nos últimos ~64 KB
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP inválido (sem diretório central)");
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const arquivos = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("ZIP inválido (entrada do diretório)");
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const lenNome = buf.readUInt16LE(p + 28);
    const lenExtra = buf.readUInt16LE(p + 30);
    const lenComent = buf.readUInt16LE(p + 32);
    const offLocal = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + lenNome);
    p += 46 + lenNome + lenExtra + lenComent;
    if (nome.endsWith("/")) continue;
    const ini = offLocal + 30 + buf.readUInt16LE(offLocal + 26) + buf.readUInt16LE(offLocal + 28);
    const bruto = buf.subarray(ini, ini + tamComp);
    const dados = metodo === 0 ? Buffer.from(bruto) : metodo === 8 ? zlib.inflateRawSync(bruto) : null;
    if (dados) arquivos.push({ nome, dados });
  }
  return arquivos;
}

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ordm: "º", ordf: "ª", deg: "°" };

/** Decodifica entidades HTML comuns (&amp; &#231; &#xE7; &ccedil;...). */
export function decodificarHtml(s = "") {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    const k = e.toLowerCase();
    if (ENTIDADES[k]) return ENTIDADES[k];
    const acento = { aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", atilde: "ã", otilde: "õ", acirc: "â", ecirc: "ê", ocirc: "ô", ccedil: "ç", agrave: "à" };
    const base = acento[k] ?? acento[k.toLowerCase()];
    if (base) return e[0] === e[0].toUpperCase() ? base.toUpperCase() : base;
    return m;
  });
}

/** Remove tags e normaliza espaços. */
export function textoDeHtml(html = "") {
  return decodificarHtml(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Opções de um <select> (por name ou id): [{ valor, texto }]. */
export function opcoesDoSelect(html, nomeOuId) {
  const re = new RegExp(`<select[^>]*(?:name|id)=["']${nomeOuId.replace(/[[\]]/g, "\\$&")}["'][^>]*>([\\s\\S]*?)</select>`, "i");
  const m = html.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/<option[^>]*value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi)]
    .map(([, valor, texto]) => ({ valor, texto: textoDeHtml(texto) }))
    .filter((o) => o.valor !== "");
}

/** Normaliza nome de município para comparação: sem acento, minúsculo, sem "prefeitura (municipal) de". */
export function normalizarNome(s = "") {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(prefeitura|municipio|camara)( municipal)?( de| do| da)?\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "1.234,56" ou "R$ 1.234,56" → 1234.56 (null se não for número). */
export function numeroBr(s) {
  if (s == null) return null;
  if (typeof s === "number") return s;
  const t = String(s).replace(/[^\d,.-]/g, "");
  if (!t) return null;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "31/12/2025" → "2025-12-31" (devolve a entrada se já estiver em ISO). */
export function dataIso(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const iso = String(s).match(/\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : null;
}
