#!/usr/bin/env node
/**
 * Orquestração dos lotes de dossiês dos municípios-alvo, num comando só.
 *
 * Antes, a rotina agendada montava vários comandos de PowerShell diferentes a
 * cada execução, e cada variação pedia permissão ao Carlos. Agora ela roda
 * sempre o mesmo comando, que basta aprovar uma vez:
 *
 *   node scripts/coleta/lote.mjs preparar   passos 1 a 5: reinicia a coleta, resolve o
 *                                           lote anterior, escolhe os próximos 20
 *                                           municípios, grava o lote e o arquivo de
 *                                           argumentos do workflow
 *   node scripts/coleta/lote.mjs fechar     passo 7: soma tentativas dos que faltaram,
 *                                           registra o andamento e apaga o lote
 *   node scripts/coleta/lote.mjs status     só mostra o andamento
 *
 * A saída é sempre JSON de uma linha, para a rotina ler. Este script não chama
 * agentes e não usa rede além do que a coleta já usa.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DADOS = process.env.COLETA_DIR ? path.resolve(process.env.COLETA_DIR) : path.join(RAIZ, "dados-coletados");
const AG = path.join(DADOS, "agentes");
const ARQ = {
  lote: path.join(AG, "_lote-em-andamento.json"),
  tentativas: path.join(AG, "_tentativas.json"),
  progresso: path.join(AG, "_progresso.md"),
  argsLote: path.join(AG, "_args-lote.json"),
  argsPiloto: path.join(AG, "args-piloto.json"),
  alvos: path.join(DADOS, "alvos.json"),
};
const UFS_MAPEAR = ["MG", "BA", "MA", "PR", "PA", "GO", "AM", "MT", "PI", "MS", "TO"];
const TAMANHO_LOTE = 20;
const MAX_TENTATIVAS = 3;
// Quando um único orquestrador roda os lotes (o chat do Carlos), qualquer lote antigo está morto:
// LOTE_HORAS_VIVO=0 faz o preparar fechar o lote anterior na hora em vez de esperar 2 h.
const HORAS_LOTE_VIVO = Number.isFinite(Number(process.env.LOTE_HORAS_VIVO)) && process.env.LOTE_HORAS_VIVO !== undefined && process.env.LOTE_HORAS_VIVO !== "" ? Number(process.env.LOTE_HORAS_VIVO) : 2;
// Lote cortado por limite de uso, permissão ou PC desligado não é culpa do município: com
// LOTE_SEM_TENTATIVA=1 (ou "fechar --sem-tentativa") as tentativas não são somadas.
const SEM_TENTATIVA = process.env.LOTE_SEM_TENTATIVA === "1" || process.argv.includes("--sem-tentativa");

const ler = (f, padrao) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));
  } catch {
    return padrao;
  }
};
const gravar = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1), "utf8");
const saida = (o) => console.log(JSON.stringify(o));
const dois = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${dois(d.getHours())}:${dois(d.getMinutes())}`;
const aaaammdd = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;

const alvos = ler(ARQ.alvos, { alvos: [] }).alvos;
const ufDe = new Map(alvos.map((a) => [String(a.ibge), a.uf]));
const total = alvos.length;

const arqDossie = (ibge) => path.join(AG, "dossies", ufDe.get(String(ibge)) ?? "", `${ibge}.json`);
const temDossie = (ibge) => fs.existsSync(arqDossie(ibge));
const temMapa = (uf) => fs.existsSync(path.join(AG, "mapa-uf", `${uf}.json`));

function contarDossies() {
  const base = path.join(AG, "dossies");
  let n = 0;
  if (!fs.existsSync(base)) return 0;
  for (const uf of fs.readdirSync(base)) {
    const dir = path.join(base, uf);
    if (!fs.statSync(dir).isDirectory()) continue;
    n += fs.readdirSync(dir).filter((f) => /^\d{7}\.json$/.test(f)).length;
  }
  return n;
}

function acrescentarProgresso(linha) {
  fs.appendFileSync(ARQ.progresso, `\n${linha}\n`, "utf8");
}

function rodarColeta() {
  if (process.env.LOTE_SEM_COLETA) return ["(coleta não reiniciada: LOTE_SEM_COLETA)"];
  const ps1 = path.join(RAIZ, "scripts", "coleta", "rodar-coleta.ps1");
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1], {
    encoding: "utf8",
    timeout: 120000,
  });
  return (r.stdout || r.stderr || "").trim().split(/\r?\n/).slice(-6);
}

/** Taxa de confirmação do lote: confirmados ÷ (checados − inacessíveis). */
function taxaConfirmacao(municipios) {
  let confirmados = 0;
  let checados = 0;
  let inacessiveis = 0;
  for (const ibge of municipios) {
    const v = ler(path.join(AG, "dossies", ufDe.get(String(ibge)) ?? "", `${ibge}.verificacao.json`), null);
    for (const x of v?.checados ?? []) {
      checados++;
      if (x.resultado === "confirmado") confirmados++;
      if (x.resultado === "inacessivel") inacessiveis++;
    }
  }
  const base = checados - inacessiveis;
  return { confirmados, checados, inacessiveis, pct: base > 0 ? (100 * confirmados) / base : null };
}

/** Passo 7. `motivo` só muda o texto do registro. */
function fechar(lote, motivo) {
  const salvos = lote.municipios.filter(temDossie);
  const faltantes = lote.municipios.filter((i) => !temDossie(i));
  const tent = ler(ARQ.tentativas, {});
  if (!SEM_TENTATIVA) {
    for (const i of faltantes) tent[i] = (tent[i] ?? 0) + 1;
    if (faltantes.length) gravar(ARQ.tentativas, tent);
  }

  const ini = new Date(lote.inicio);
  const agora = new Date();
  const mapeadas = (lote.ufs ?? []).filter(temMapa);
  const t = taxaConfirmacao(lote.municipios);
  const totalSalvos = contarDossies();
  const pct = t.pct === null ? "sem verificações" : `${t.pct.toFixed(1).replace(".", ",")}% (${t.confirmados} confirmados ÷ (${t.checados} checados − ${t.inacessiveis} inacessíveis))`;
  const tipo = faltantes.length ? "lote interrompido" : "lote de " + lote.municipios.length + " municípios";
  acrescentarProgresso(
    `- ${aaaammdd(agora)} ${hhmm(agora)} (-03) — ${tipo} (iniciado ${hhmm(ini)}): ${salvos.length} de ${lote.municipios.length} dossiês salvos; ` +
      (faltantes.length ? `faltante(s): ${faltantes.join(", ")} (${SEM_TENTATIVA ? "sem somar tentativa: interrupção por limite ou permissão" : "+1 tentativa cada"}); ` : "") +
      `UFs mapeadas: ${mapeadas.length ? mapeadas.join(", ") : "nenhuma"}; taxa de confirmação do lote: ${pct}; total: ${totalSalvos}/${total} dossiês.${motivo ? ` (${motivo})` : ""}`,
  );
  fs.rmSync(ARQ.lote, { force: true });
  return { salvos: salvos.length, faltantes, totalSalvos, taxa: t.pct };
}

function preparar() {
  const coleta = rodarColeta();

  let fechado = null;
  const lote = ler(ARQ.lote, null);
  if (lote) {
    const mapasOk = (lote.ufs ?? []).every(temMapa);
    const dossiesOk = lote.municipios.every(temDossie);
    const idadeH = (Date.now() - new Date(lote.inicio).getTime()) / 3.6e6;
    if (mapasOk && dossiesOk) {
      fechado = { como: "terminado e não fechado", ...fechar(lote, "fechamento automático") };
    } else if (idadeH < HORAS_LOTE_VIVO) {
      return saida({
        acao: "encerrar",
        motivo: `há um lote rodando (iniciado há ${idadeH.toFixed(1)} h; um lote normal leva ~15 minutos)`,
        coleta,
      });
    } else {
      fechado = { como: "interrompido", ...fechar(lote, "lote morreu, provavelmente limite de uso") };
    }
  }

  const ufs = UFS_MAPEAR.filter((u) => !temMapa(u)).slice(0, 4);
  const tent = ler(ARQ.tentativas, {});
  const municipios = alvos
    .filter((a) => !temDossie(a.ibge) && (tent[a.ibge] ?? 0) < MAX_TENTATIVAS)
    .slice(0, TAMANHO_LOTE);

  if (!municipios.length && !ufs.length) {
    const falharam = alvos.filter((a) => !temDossie(a.ibge)).map((a) => a.ibge);
    const agora = new Date();
    acrescentarProgresso(
      `- ${aaaammdd(agora)} ${hhmm(agora)} (-03) — TRABALHO TERMINADO: ${contarDossies()}/${total} dossiês salvos; falharam ${MAX_TENTATIVAS} vezes: ${falharam.length ? falharam.join(", ") : "nenhum"}. A rotina já pode ser desligada.`,
    );
    return saida({ acao: "concluido", totalSalvos: contarDossies(), falharam, coleta, fechado });
  }

  const novo = { inicio: new Date().toISOString(), municipios: municipios.map((m) => m.ibge), ufs };
  gravar(ARQ.lote, novo);

  const piloto = ler(ARQ.argsPiloto, {});
  const args = {
    hoje: aaaammdd(new Date()),
    pasta: AG.replaceAll("\\", "/"),
    ufs,
    totalPorUf: piloto.totalPorUf ?? {},
    exemplosPorUf: piloto.exemplosPorUf ?? {},
    categorias: piloto.categorias ?? "",
    municipios: municipios.map((m) => ({
      nome: m.nome.replace(/^Prefeitura (Municipal )?de /i, ""),
      uf: m.uf,
      ibge: m.ibge,
      cnpj: m.cnpj,
      populacao: m.populacao,
    })),
  };
  gravar(ARQ.argsLote, args);

  saida({
    acao: "rodar-workflow",
    scriptPath: path.join(AG, "workflow-dossies.js"),
    argsFile: ARQ.argsLote,
    municipios: novo.municipios.length,
    ufs,
    totalSalvos: contarDossies(),
    total,
    coleta,
    fechado,
  });
}

function fecharComando() {
  const lote = ler(ARQ.lote, null);
  if (!lote) return saida({ acao: "nada-a-fechar", totalSalvos: contarDossies(), total });
  const r = fechar(lote, "");
  saida({ acao: "fechado", ...r, total });
}

const cmd = process.argv[2];
if (cmd === "preparar") preparar();
else if (cmd === "fechar") fecharComando();
else if (cmd === "status") {
  const lote = ler(ARQ.lote, null);
  saida({ totalSalvos: contarDossies(), total, lote: lote ? { inicio: lote.inicio, municipios: lote.municipios.length, ufs: lote.ufs } : null });
} else {
  console.error("uso: node scripts/coleta/lote.mjs preparar | fechar | status");
  process.exit(2);
}
