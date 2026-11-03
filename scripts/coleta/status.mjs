#!/usr/bin/env node
/**
 * Mostra o andamento da coleta em lote (scripts/coleta/coletar.mjs) e dos
 * arquivos salvos pelos agentes.
 *
 * Uso: node scripts/coleta/status.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DADOS = process.env.COLETA_DIR ? path.resolve(process.env.COLETA_DIR) : path.join(RAIZ, "dados-coletados");
const ler = (f, p) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return p;
  }
};
const vivo = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function tamanhoPasta(dir) {
  let bytes = 0;
  let arquivos = 0;
  if (!fs.existsSync(dir)) return { bytes, arquivos };
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const t = tamanhoPasta(p);
      bytes += t.bytes;
      arquivos += t.arquivos;
    } else {
      bytes += fs.statSync(p).size;
      arquivos++;
    }
  }
  return { bytes, arquivos };
}

const total = ler(path.join(DADOS, "alvos.json"), { total: 0 }).total;
console.log(`Pasta: ${DADOS}\nMunicípios-alvo: ${total}\n`);

const dirFontes = path.join(RAIZ, "scripts", "coleta", "fontes");
const estaduais = fs.existsSync(dirFontes) ? fs.readdirSync(dirFontes).filter((f) => /^[a-z0-9-]+\.mjs$/.test(f)).map((f) => f.slice(0, -4)) : [];

for (const fonte of ["pncp", "compras", "pncp-orgaos", "siconfi", "diarios", ...estaduais]) {
  const est = ler(path.join(DADOS, "_estado", `${fonte}.json`), null);
  const st = ler(path.join(DADOS, "_estado", `${fonte}.status.json`), null);
  const lock = ler(path.join(DADOS, "_estado", `${fonte}.lock`), null);
  if (!est) {
    console.log(`${fonte.padEnd(8)} ainda não começou`);
    continue;
  }
  const muns = Object.values(est.municipios);
  const concluidos = muns.filter((m) => m.concluidoEm).length;
  const pendencias = muns.filter((m) => Object.keys(m.erros ?? {}).length).length;
  const registros = muns.reduce((s, m) => s + Object.values(m.feito ?? {}).reduce((a, n) => a + Math.max(n, 0), 0), 0);
  const rodando = lock?.pid && vivo(lock.pid);
  const disco = tamanhoPasta(path.join(DADOS, fonte));
  console.log(
    `${fonte.padEnd(8)} ${rodando ? "RODANDO" : st?.concluido ? "CONCLUÍDO" : "parado "}  ${concluidos}/${st?.total || total} municípios  ` +
      `${registros.toLocaleString("pt-BR")} registros  ${(disco.bytes / 1048576).toFixed(1)} MB  ` +
      `${pendencias ? pendencias + " com pendência  " : ""}${st?.erros429 ? st.erros429 + "×429  " : ""}` +
      `${rodando && st?.atual ? "agora: " + st.atual : ""}${st?.atualizado ? "  (atualizado " + st.atualizado.slice(11, 19) + " UTC)" : ""}`,
  );
}

const agentes = tamanhoPasta(path.join(DADOS, "agentes"));
console.log(`\nArquivos salvos pelos agentes: ${agentes.arquivos} (${(agentes.bytes / 1048576).toFixed(1)} MB) em dados-coletados/agentes`);
