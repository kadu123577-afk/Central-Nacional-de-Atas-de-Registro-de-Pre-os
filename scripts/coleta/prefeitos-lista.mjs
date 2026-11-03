#!/usr/bin/env node
/**
 * Converte a "Relação de prefeitos eleitos 2025-2028" (PDF recebido em 2026-11-03,
 * atualizada em 28/10/2024, só Goiás) em JSON por município e cruza com alvos.json.
 *
 * Fica de fora de propósito (minimização, LGPD): CPF, data de nascimento, idade e dados
 * de cônjuge. O que interessa à venda é o contato institucional e o nome do prefeito.
 *
 * Uso:   node scripts/coleta/prefeitos-lista.mjs "<arquivo.pdf>" [--uf=GO]
 * Saída: dados-coletados/prefeitos/prefeitos-<UF>-2025-2028.json  (não vai para o Git)
 * Requer o `pdftotext` (poppler) no PATH.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizarNome } from "./fontes/_util.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DADOS = process.env.COLETA_DIR ? path.resolve(process.env.COLETA_DIR) : path.join(RAIZ, "dados-coletados");

const args = process.argv.slice(2);
const pdf = args.find((a) => !a.startsWith("--"));
const UF = (args.find((a) => a.startsWith("--uf=")) ?? "").slice(5) || "GO";
if (!pdf || !fs.existsSync(pdf)) {
  console.error('Uso: node scripts/coleta/prefeitos-lista.mjs "<arquivo.pdf>" [--uf=GO]');
  process.exit(2);
}

const r = spawnSync("pdftotext", ["-enc", "UTF-8", "-layout", pdf, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (r.status !== 0) {
  console.error("pdftotext falhou:", r.stderr || r.error);
  process.exit(1);
}
const linhas = r.stdout.replace(/\r/g, "").split("\n");

// Cabeçalho de cada registro: "Abadia de Goiás - GO. Reeleito" (hífen ou travessão, com ou sem ponto).
const CABECALHO = new RegExp(`^\\s*(.+?)\\s*[-–—]\\s*${UF}\\.?\\s*(Reeleit[oa])?\\s*$`);
const registros = [];
let atual = null;
for (const linha of linhas) {
  if (/^=+\s*$/.test(linha.trim())) continue;
  const c = linha.match(CABECALHO);
  if (c && !/Nome:/i.test(linha)) {
    atual = { municipio: c[1].trim(), reeleito: Boolean(c[2]), corpo: [] };
    registros.push(atual);
    continue;
  }
  if (atual && linha.trim()) atual.corpo.push(linha.trim());
}

const so = (s) => s?.replace(/\s+/g, " ").trim() || null;
const rotulo = (corpo, re) => {
  const l = corpo.find((x) => re.test(x));
  return l ? so(l.replace(re, "")) : null;
};

const lista = registros.map((g) => {
  const { corpo } = g;
  const iNome = corpo.findIndex((x) => /^Nome\s*:/i.test(x));
  // Nome de urna: a linha logo antes de "Nome:" (em alguns registros "Nome:" falta e a linha é o próprio nome completo).
  const nomeUrna = iNome > 0 ? so(corpo[iNome - 1]) : so(corpo[0]);
  // Em poucos registros a linha "Nome:" falta e o nome completo vem na linha seguinte ao nome de urna (ainda com "- CPF").
  const linhaNome = iNome >= 0 ? corpo[iNome] : (corpo.find((x, i) => i > 0 && /CPF\s*:/i.test(x)) ?? corpo[1] ?? corpo[0] ?? "");
  const nomeCompleto = so(linhaNome.replace(/^Nome\s*:/i, "").replace(/[-–]?\s*CPF\b.*$/i, "").replace(/[-–]\s*$/, ""));
  const email = rotulo(corpo, /^E-?mail\s*:/i)?.match(/[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+/)?.[0] ?? null;
  const celulares = corpo
    .filter((x) => /^Celular\s*\d?\s*:/i.test(x))
    .map((x) => so(x.replace(/^Celular\s*\d?\s*:/i, "")))
    .filter(Boolean);
  return {
    municipio: g.municipio,
    uf: UF,
    reeleito: g.reeleito,
    nomeUrna,
    nomeCompleto,
    telefonePrefeitura: rotulo(corpo, /^Pref\s*:/i),
    celular: celulares.join(" / ") || null,
    email: email && /@/.test(email) ? email.toLowerCase() : null,
    partido: rotulo(corpo, /^Parti(do|d)\s*:/i),
    aniversarioMunicipio: rotulo(corpo, /^Aniv\.?\s*Mun[^:]*:/i),
  };
});

const { alvos } = JSON.parse(fs.readFileSync(path.join(DADOS, "alvos.json"), "utf8"));
const porNome = new Map();
for (const a of alvos.filter((x) => x.uf === UF)) porNome.set(normalizarNome(a.nome), a);
// Código IBGE de todos os municípios da UF (API pública de localidades), para os que não estão entre os alvos.
const ibgeDaApi = new Map();
try {
  const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${UF}/municipios`);
  for (const m of await resp.json()) ibgeDaApi.set(normalizarNome(m.nome), String(m.id));
} catch (e) {
  console.error("Aviso: não consegui o código IBGE pela API; só os alvos terão ibge.", e.message);
}
let casados = 0;
const alvosSemPrefeito = new Set(porNome.keys());
const divergenciasIbge = [];
for (const p of lista) {
  const a = porNome.get(normalizarNome(p.municipio));
  const daApi = ibgeDaApi.get(normalizarNome(p.municipio)) ?? null;
  if (a && daApi && a.ibge !== daApi) divergenciasIbge.push(`${p.municipio}: alvos ${a.ibge} x API ${daApi}`);
  p.ibge = a?.ibge ?? daApi;
  p.alvo = Boolean(a);
  if (a) {
    casados++;
    alvosSemPrefeito.delete(normalizarNome(a.nome));
  }
}

const dir = path.join(DADOS, "prefeitos");
fs.mkdirSync(dir, { recursive: true });
const arq = path.join(dir, `prefeitos-${UF.toLowerCase()}-2025-2028.json`);
fs.writeFileSync(
  arq,
  JSON.stringify(
    {
      fonte: "Relação de prefeitos eleitos 2025-2028 (PDF recebido de Carlos em 2026-11-03)",
      atualizadaEm: "2024-10-28",
      aviso: "Lista de outubro de 2024: confirmar se a pessoa ainda ocupa o cargo (eleição suplementar, cassação, renúncia) antes de usar o contato.",
      omitido: "CPF, data de nascimento, idade e cônjuge, por minimização (LGPD)",
      geradoEm: new Date().toISOString(),
      total: lista.length,
      prefeitos: lista,
    },
    null,
    1,
  ),
);

const sem = (campo) => lista.filter((p) => !p[campo]).length;
console.log(
  JSON.stringify({
    arquivo: arq,
    registros: lista.length,
    casadosComAlvos: casados,
    alvosDaUf: porNome.size,
    alvosSemPrefeitoNaLista: [...alvosSemPrefeito],
    comIbge: lista.filter((p) => p.ibge).length,
    semIbge: lista.filter((p) => !p.ibge).map((p) => p.municipio),
    divergenciasIbge,
    municipiosDaUfNaApi: ibgeDaApi.size,
    naApiSemPrefeitoNaLista: [...ibgeDaApi.keys()].filter((n) => !lista.some((p) => normalizarNome(p.municipio) === n)),
    semEmail: sem("email"),
    semCelular: sem("celular"),
    semTelefonePrefeitura: sem("telefonePrefeitura"),
    semPartido: sem("partido"),
  }),
);
