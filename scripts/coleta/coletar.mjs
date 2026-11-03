#!/usr/bin/env node
/**
 * Coleta em lote, retomável e com ritmo controlado, de dados públicos de
 * contratação dos municípios-alvo (dados-coletados/alvos.json, gerado por
 * exportar-alvos.ts).
 *
 * Pedido do usuário (2026-10-08): levantar o máximo de informação sobre os
 * processos já feitos pelos 1.073 municípios e deixar rodando sozinho, sem
 * perder nada se a sessão cair. Por isso:
 *  - cada "chave" (ex.: contratos de 2025) só é gravada inteira e marcada
 *    como feita no estado; se o processo morrer no meio, refaz só ela;
 *  - roda fora do Claude (Node puro), então não depende de sessão nem de
 *    limite de uso; um lock por fonte impede duas cópias rodando juntas;
 *  - respeita o limite de requisições de cada API (o PNCP devolve 429 com
 *    ~10 chamadas em poucos segundos) e espera mais a cada 429.
 *
 * Uso:   node scripts/coleta/coletar.mjs <fonte> [--limite=N] [--uf=GO] [--ibge=5208707,...]
 * Fontes:
 *   pncp     contratos, atas de registro de preços e PCA no PNCP (por CNPJ)
 *   compras  contratações (licitações/dispensas) no Compras.gov.br dados abertos
 *   pncp-orgaos  contratos e atas dos outros órgãos do município (fundos, Câmara...)
 *   siconfi  despesa por função e balanço (DCA) no Tesouro/SICONFI
 *   diarios  menções em diários oficiais (Querido Diário)
 *   <outras> coletores estaduais em scripts/coleta/fontes/<fonte>.mjs (TCEs, diários
 *            das associações de municípios etc.; contrato descrito em fontes/LEIAME.md)
 * Saída:  dados-coletados/<fonte>/<UF>/<ibge>.ndjson  (uma linha por registro: {chave, dado})
 * Estado: dados-coletados/_estado/<fonte>.json         (o que já foi feito, por município)
 * Log:    dados-coletados/_logs/<fonte>.log
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DADOS = process.env.COLETA_DIR ? path.resolve(process.env.COLETA_DIR) : path.join(RAIZ, "dados-coletados");

const [fonteNome, ...resto] = process.argv.slice(2);
const opcoes = Object.fromEntries(
  resto.filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? "1"];
  }),
);

const ANO_ATUAL = new Date().getFullYear();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const hojeIso = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- arquivos

for (const d of ["_estado", "_logs"]) fs.mkdirSync(path.join(DADOS, d), { recursive: true });
const arqLog = path.join(DADOS, "_logs", `${fonteNome}.log`);
const arqEstado = path.join(DADOS, "_estado", `${fonteNome}.json`);
const arqStatus = path.join(DADOS, "_estado", `${fonteNome}.status.json`);
const arqLock = path.join(DADOS, "_estado", `${fonteNome}.lock`);

function log(msg) {
  const linha = `${new Date().toISOString()} ${msg}`;
  console.log(linha);
  fs.appendFileSync(arqLog, linha + "\n");
}

function gravarJson(arquivo, obj) {
  const tmp = `${arquivo}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  for (let t = 0; t < 10; t++) {
    try {
      fs.renameSync(tmp, arquivo);
      return;
    } catch {
      // Windows: outro processo (status.mjs) pode estar lendo; tenta de novo.
      const fim = Date.now() + 200;
      while (Date.now() < fim);
    }
  }
  fs.copyFileSync(tmp, arquivo);
}

function lerJson(arquivo, padrao) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    return padrao;
  }
}

function pegarLock() {
  const atual = lerJson(arqLock, null);
  if (atual?.pid && atual.pid !== process.pid) {
    try {
      process.kill(atual.pid, 0);
      return false; // outro processo vivo já está coletando esta fonte
    } catch {
      // processo antigo morreu: lock órfão, pode assumir
    }
  }
  gravarJson(arqLock, { pid: process.pid, desde: new Date().toISOString() });
  return true;
}

// ---------------------------------------------------------------- estado

const estado = lerJson(arqEstado, { municipios: {} });
const status = { fonte: fonteNome, pid: process.pid, iniciado: new Date().toISOString(), chamadas: 0, erros429: 0, registros: 0, feitos: 0, total: 0, atual: null };

function estadoDe(alvo) {
  return (estado.municipios[alvo.ibge] ??= { feito: {}, erros: {} });
}

function salvarEstado() {
  gravarJson(arqEstado, estado);
  gravarJson(arqStatus, { ...status, atualizado: new Date().toISOString() });
}

// ---------------------------------------------------------------- HTTP

let ultimaChamada = 0;
const UA_NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Requisição genérica com o mesmo ritmo e as mesmas novas tentativas de buscarJson,
 * para os coletores estaduais (HTML, CSV, ZIP, POST). tipo: "texto" | "buffer" | "json".
 * Devolve { status, texto | buffer | json, headers } ou { falhou } / { definitivo, corpo }.
 */
async function requisitar(url, { intervalo = 1000, metodo = "GET", corpo, headers = {}, tipo = "texto", timeout = 120_000 } = {}) {
  for (let tentativa = 1; tentativa <= 6; tentativa++) {
    const espera = ultimaChamada + intervalo - Date.now();
    if (espera > 0) await dormir(espera);
    ultimaChamada = Date.now();
    status.chamadas++;
    let r;
    try {
      r = await fetch(url, { method: metodo, body: corpo, headers: { "User-Agent": UA_NAVEGADOR, ...headers }, signal: AbortSignal.timeout(timeout) });
    } catch (e) {
      log(`  rede (${e.name}) tentativa ${tentativa}: ${url.slice(0, 160)}`);
      await dormir(Math.min(120_000, 3000 * 2 ** tentativa));
      continue;
    }
    if (r.status === 429 || r.status === 503) {
      status.erros429++;
      const pausa = Math.min(300_000, 15_000 * tentativa);
      log(`  ${r.status} (limite/indisponível) — pausa de ${pausa / 1000}s`);
      await dormir(pausa);
      continue;
    }
    if (r.status >= 500) {
      log(`  HTTP ${r.status} tentativa ${tentativa}: ${url.slice(0, 160)}`);
      await dormir(Math.min(120_000, 5000 * tentativa));
      continue;
    }
    if (!r.ok && r.status !== 204) {
      const t = await r.text().catch(() => "");
      return { status: r.status, definitivo: true, corpo: t.slice(0, 200).replace(/\s+/g, " "), headers: r.headers };
    }
    if (tipo === "buffer") return { status: r.status, buffer: Buffer.from(await r.arrayBuffer()), headers: r.headers };
    const texto = await r.text();
    if (tipo === "json") {
      if (r.status === 204 || !texto.trim()) return { status: r.status, json: null, headers: r.headers };
      try {
        return { status: r.status, json: JSON.parse(texto), headers: r.headers };
      } catch {
        log(`  resposta não-JSON tentativa ${tentativa}: ${texto.slice(0, 120).replace(/\s+/g, " ")}`);
        await dormir(5000);
        continue;
      }
    }
    return { status: r.status, texto, headers: r.headers };
  }
  return { status: 0, falhou: true };
}

/** Grava de uma vez os registros de uma chave já coletados pelo próprio coletor e marca como feita. */
function gravarChave(alvo, chave, itens) {
  const est = estadoDe(alvo);
  if (itens.length) {
    const dir = path.join(DADOS, fonteNome, alvo.uf ?? "XX");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `${alvo.ibge}.ndjson`), itens.map((dado) => JSON.stringify({ chave, dado })).join("\n") + "\n");
  }
  est.feito[chave] = itens.length;
  delete est.erros[chave];
  status.registros += itens.length;
  salvarEstado();
  return itens.length;
}

async function buscarJson(url, intervalo) {
  for (let tentativa = 1; tentativa <= 8; tentativa++) {
    const espera = ultimaChamada + intervalo - Date.now();
    if (espera > 0) await dormir(espera);
    ultimaChamada = Date.now();
    status.chamadas++;
    let r;
    try {
      r = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (coleta-municipios; uso interno)" },
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      log(`  rede (${e.name}) tentativa ${tentativa}: ${url.slice(0, 160)}`);
      await dormir(Math.min(120_000, 3000 * 2 ** tentativa));
      continue;
    }
    if (r.status === 429) {
      status.erros429++;
      const pausa = Math.min(300_000, 15_000 * tentativa);
      log(`  429 (limite da API) — pausa de ${pausa / 1000}s`);
      await dormir(pausa);
      continue;
    }
    if (r.status === 204) return { status: 204, json: null };
    if (r.status >= 500) {
      log(`  HTTP ${r.status} tentativa ${tentativa}: ${url.slice(0, 160)}`);
      await dormir(Math.min(120_000, 5000 * tentativa));
      continue;
    }
    const texto = await r.text();
    if (r.ok) {
      try {
        return { status: r.status, json: JSON.parse(texto) };
      } catch {
        log(`  resposta não-JSON tentativa ${tentativa}: ${texto.slice(0, 120).replace(/\s+/g, " ")}`);
        await dormir(5000);
        continue;
      }
    }
    return { status: r.status, json: null, definitivo: true, corpo: texto.slice(0, 200).replace(/\s+/g, " ") };
  }
  return { status: 0, json: null, falhou: true };
}

// ---------------------------------------------------------------- coleta por chave

const MAX_PAGINAS = Number(opcoes["max-paginas"] ?? 200);

/** Coleta todas as páginas de uma chave e só então grava; devolve o nº de registros ou null se falhou. */
async function coletarChave(alvo, chave, intervalo, montarUrl, extrair) {
  const est = estadoDe(alvo);
  if (est.feito[chave] !== undefined) return est.feito[chave];
  const linhas = [];
  let pagina = 1;
  let totalPaginas = 1;
  do {
    const resp = await buscarJson(montarUrl(pagina), intervalo);
    if (resp.falhou) {
      est.erros[chave] = `falha de rede/servidor em ${hojeIso()}`;
      log(`  ✗ ${alvo.nome}/${alvo.uf} ${chave}: falhou, fica para a próxima rodada`);
      return null;
    }
    if (resp.definitivo) {
      est.feito[chave] = -1;
      est.erros[chave] = `HTTP ${resp.status}: ${resp.corpo}`;
      log(`  ✗ ${alvo.nome}/${alvo.uf} ${chave}: HTTP ${resp.status} ${resp.corpo}`);
      return -1;
    }
    const { itens, totalPaginas: tp } = resp.status === 204 || !resp.json ? { itens: [], totalPaginas: 0 } : extrair(resp.json, pagina);
    for (const dado of itens) linhas.push(JSON.stringify({ chave, dado }));
    totalPaginas = Math.min(tp ?? 1, MAX_PAGINAS);
    pagina++;
  } while (pagina <= totalPaginas);

  if (linhas.length) {
    const dir = path.join(DADOS, fonteNome, alvo.uf ?? "XX");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `${alvo.ibge}.ndjson`), linhas.join("\n") + "\n");
  }
  est.feito[chave] = linhas.length;
  delete est.erros[chave];
  status.registros += linhas.length;
  salvarEstado(); // grava a cada chave: se cair, perde no máximo a chave em andamento
  return linhas.length;
}

const aaaammdd = (d) => d.replaceAll("-", "");
function janelaAno(ano) {
  const fim = ano === ANO_ATUAL ? hojeIso() : `${ano}-12-31`;
  return { ini: `${ano}-01-01`, fim };
}

// ---------------------------------------------------------------- fontes

const PNCP = "https://pncp.gov.br/api/consulta";
const extrairPncp = (j) => ({ itens: j.data ?? [], totalPaginas: j.totalPaginas ?? 1 });

/** Anos da Lei 14.133 (2023 em diante) sempre; antes disso, para no primeiro ano vazio. */
async function porAnoPncp(alvo, prefixo, desde, coletarAno) {
  let total = 0;
  for (let ano = ANO_ATUAL; ano >= desde; ano--) {
    const n = await coletarAno(ano, `${prefixo}:${ano}`);
    if (n == null) continue;
    total += Math.max(n, 0);
    if (ano < 2023 && n <= 0) break;
  }
  return total;
}

const fontes = {
  pncp: {
    intervalo: Number(opcoes.intervalo ?? 1100),
    async processar(alvo) {
      const desde = Number(opcoes.desde ?? 2021);
      const est = estadoDe(alvo);
      const contratos = await porAnoPncp(alvo, "contratos", desde, (ano, chave) => {
        const j = janelaAno(ano);
        return coletarChave(alvo, chave, this.intervalo, (p) =>
          `${PNCP}/v1/contratos?${new URLSearchParams({ dataInicial: aaaammdd(j.ini), dataFinal: aaaammdd(j.fim), cnpjOrgao: alvo.cnpj, pagina: p, tamanhoPagina: 500 })}`, extrairPncp);
      });
      const atas = await porAnoPncp(alvo, "atas", desde, (ano, chave) => {
        const j = janelaAno(ano);
        return coletarChave(alvo, chave, this.intervalo, (p) =>
          `${PNCP}/v1/atas?${new URLSearchParams({ dataInicial: aaaammdd(j.ini), dataFinal: aaaammdd(j.fim), cnpj: alvo.cnpj, pagina: p, tamanhoPagina: 500 })}`, extrairPncp);
      });
      let pca = 0;
      for (let ano = ANO_ATUAL; ano >= ANO_ATUAL - 2; ano--) {
        const j = janelaAno(ano);
        const n = await coletarChave(alvo, `pca:${ano}`, this.intervalo, (p) =>
          `${PNCP}/v1/pca/atualizacao?${new URLSearchParams({ dataInicio: aaaammdd(j.ini), dataFim: aaaammdd(j.fim), cnpj: alvo.cnpj, pagina: p, tamanhoPagina: 500 })}`, extrairPncp);
        pca += Math.max(n ?? 0, 0);
      }
      est.resumo = { contratos, atas, pca, semPresenca: contratos === 0 && atas === 0 && pca === 0 };
      return `contratos=${contratos} atas=${atas} pca=${pca}`;
    },
  },

  compras: {
    intervalo: Number(opcoes.intervalo ?? 800),
    async processar(alvo) {
      // Filtra pelo código IBGE da unidade, não pelo CNPJ da prefeitura: assim vêm
      // também Câmara, fundos, autarquias e institutos de previdência do município
      // (testado: +20% a 30% de contratações). Órgãos estaduais/federais situados
      // no município também aparecem e são separados depois por orgaoEntidadeEsferaId.
      // 6 pregão eletrônico, 8 dispensa, 9 inexigibilidade, 4 concorrência eletrônica, 7 pregão presencial.
      const modalidades = (opcoes.modalidades ?? "6,8,9,4,7").split(",").map(Number);
      const desde = Number(opcoes.desde ?? 2023);
      let total = 0;
      for (let ano = ANO_ATUAL; ano >= desde; ano--) {
        const j = janelaAno(ano);
        for (const mod of modalidades) {
          const n = await coletarChave(alvo, `contratacoes:${ano}:mod${mod}`, this.intervalo, (p) =>
            `https://dadosabertos.compras.gov.br/modulo-contratacoes/1_consultarContratacoes_PNCP_14133?${new URLSearchParams({
              unidadeOrgaoCodigoIbge: alvo.ibge, dataPublicacaoPncpInicial: j.ini, dataPublicacaoPncpFinal: j.fim, codigoModalidade: mod, pagina: p, tamanhoPagina: 500,
            })}`,
            (js) => ({ itens: js.resultado ?? [], totalPaginas: js.totalPaginas ?? 1 }));
          total += Math.max(n ?? 0, 0);
        }
      }
      return `contratacoes=${total}`;
    },
  },

  // Fundos (saúde, educação), Câmara, autarquias e previdência têm CNPJ próprio e
  // publicam contratos e atas fora do CNPJ da prefeitura. Os CNPJs saem das
  // contratações já coletadas (fonte "compras", filtrada por IBGE).
  "pncp-orgaos": {
    intervalo: Number(opcoes.intervalo ?? 1100),
    async processar(alvo) {
      const est = estadoDe(alvo);
      const compras = lerJson(path.join(DADOS, "_estado", "compras.json"), { municipios: {} }).municipios[alvo.ibge];
      if (!compras?.concluidoEm) {
        est.erros.aguardando = "contratações (fonte compras) ainda não coletadas";
        return "aguardando a fonte compras";
      }
      delete est.erros.aguardando;
      const orgaos = new Map();
      const arq = path.join(DADOS, "compras", alvo.uf ?? "XX", `${alvo.ibge}.ndjson`);
      if (fs.existsSync(arq)) {
        for (const linha of fs.readFileSync(arq, "utf8").split("\n")) {
          if (!linha) continue;
          const d = JSON.parse(linha).dado;
          if (d.orgaoEntidadeEsferaId === "M" && d.orgaoEntidadeCnpj && d.orgaoEntidadeCnpj !== alvo.cnpj) orgaos.set(d.orgaoEntidadeCnpj, d.orgaoEntidadeRazaoSocial);
        }
      }
      est.orgaos = Object.fromEntries(orgaos);
      if (!orgaos.size) return "nenhum outro órgão municipal nas contratações";
      const desde = Number(opcoes.desde ?? 2023);
      let contratos = 0;
      let atas = 0;
      for (const cnpj of orgaos.keys()) {
        for (let ano = ANO_ATUAL; ano >= desde; ano--) {
          const j = janelaAno(ano);
          contratos += Math.max((await coletarChave(alvo, `contratos:${cnpj}:${ano}`, this.intervalo, (p) =>
            `${PNCP}/v1/contratos?${new URLSearchParams({ dataInicial: aaaammdd(j.ini), dataFinal: aaaammdd(j.fim), cnpjOrgao: cnpj, pagina: p, tamanhoPagina: 500 })}`, extrairPncp)) ?? 0, 0);
          atas += Math.max((await coletarChave(alvo, `atas:${cnpj}:${ano}`, this.intervalo, (p) =>
            `${PNCP}/v1/atas?${new URLSearchParams({ dataInicial: aaaammdd(j.ini), dataFinal: aaaammdd(j.fim), cnpj, pagina: p, tamanhoPagina: 500 })}`, extrairPncp)) ?? 0, 0);
        }
      }
      return `${orgaos.size} órgão(s) além da prefeitura: contratos=${contratos} atas=${atas}`;
    },
  },

  siconfi: {
    intervalo: Number(opcoes.intervalo ?? 400),
    async processar(alvo) {
      const anexos = ["DCA-Anexo I-E", "DCA-Anexo I-C"];
      let total = 0;
      for (let ano = ANO_ATUAL - 1; ano >= ANO_ATUAL - 5; ano--) {
        for (const anexo of anexos) {
          const n = await coletarChave(alvo, `dca:${ano}:${anexo}`, this.intervalo, (p) =>
            `https://apidatalake.tesouro.gov.br/ords/siconfi/tt/dca?${new URLSearchParams({ an_exercicio: ano, no_anexo: anexo, id_ente: alvo.ibge, offset: (p - 1) * 5000, limit: 5000 })}`,
            (js, p) => ({ itens: js.items ?? [], totalPaginas: js.hasMore ? p + 1 : p }));
          total += Math.max(n ?? 0, 0);
        }
      }
      return `linhas=${total}`;
    },
  },

  diarios: {
    intervalo: Number(opcoes.intervalo ?? 800),
    async processar(alvo) {
      const est = estadoDe(alvo);
      const desde = opcoes.desde ?? "2022-01-01";
      const QD = "https://api.queridodiario.org.br/gazettes";
      // Cobertura: o Querido Diário não tem todos os municípios.
      if (est.cobertura === undefined) {
        const r = await buscarJson(`${QD}?${new URLSearchParams({ territory_ids: alvo.ibge, size: 1, published_since: desde })}`, this.intervalo);
        if (r.falhou) return "falhou ao checar cobertura";
        est.cobertura = r.json?.total_gazettes ?? 0;
      }
      if (!est.cobertura) return "sem cobertura no Querido Diário";
      const termos = {
        arp: '"ata de registro de preços" | "ata de registro de preço"',
        pregao: '"pregão eletrônico" | "pregão presencial"',
        dispensa: '"dispensa de licitação" | "dispensa eletrônica" | "contratação direta"',
        inexigibilidade: "inexigibilidade",
        adesao: '"adesão à ata" | "adesão a ata" | carona',
        contrato: '"extrato de contrato" | "extrato do contrato"',
        pca: '"plano de contratações anual" | "plano anual de contratações"',
      };
      const POR_PAGINA = 100;
      const LIMITE = Number(opcoes["max-diarios"] ?? 300);
      let total = 0;
      for (const [nome, q] of Object.entries(termos)) {
        const n = await coletarChave(alvo, `qd:${nome}`, this.intervalo, (p) =>
          `${QD}?${new URLSearchParams({ querystring: q, territory_ids: alvo.ibge, published_since: desde, size: POR_PAGINA, offset: (p - 1) * POR_PAGINA, excerpt_size: 700, number_of_excerpts: 5, sort_by: "descending_date" })}`,
          (js) => ({
            itens: (js.gazettes ?? []).map((g) => ({ data: g.date, edicao: g.edition, extra: g.is_extra_edition, url: g.url, txt: g.txt_url, trechos: g.excerpts })),
            totalPaginas: Math.ceil(Math.min(js.total_gazettes ?? 0, LIMITE) / POR_PAGINA),
          }));
        total += Math.max(n ?? 0, 0);
      }
      return `diarios=${total} (cobertura ${est.cobertura} edições)`;
    },
  },
};

// ---------------------------------------------------------------- principal

// COLETA_FONTES_DIR: testar coletores novos (fontes-em-teste/) sem que rodar-coleta.ps1 os dispare.
const DIR_FONTES = process.env.COLETA_FONTES_DIR ? path.resolve(process.env.COLETA_FONTES_DIR) : path.join(path.dirname(fileURLToPath(import.meta.url)), "fontes");

/** Coletor estadual em fontes/<nome>.mjs (export default { ufs, intervalo, preparar?, processar, resumir? }). */
async function carregarFonteExterna(nome) {
  const arq = path.join(DIR_FONTES, `${nome}.mjs`);
  if (!/^[a-z0-9-]+$/.test(nome) || !fs.existsSync(arq)) return null;
  const mod = (await import(pathToFileURL(arq).href)).default;
  const intervalo = Number(opcoes.intervalo ?? mod.intervalo ?? 1500);
  const ctx = { opcoes, DADOS, ANO_ATUAL, intervalo, log, dormir, hojeIso, janelaAno, aaaammdd, lerJson, gravarJson, requisitar, buscarJson, coletarChave, gravarChave, estadoDe, salvarEstado, fonteNome };
  return {
    ...mod,
    intervalo,
    preparar: mod.preparar ? (lista) => mod.preparar(ctx, lista) : null,
    processar: (alvo) => mod.processar(alvo, ctx),
  };
}

async function main() {
  const fonte = fontes[fonteNome] ?? (await carregarFonteExterna(fonteNome));
  if (!fonte) {
    const externas = fs.existsSync(DIR_FONTES) ? fs.readdirSync(DIR_FONTES).filter((f) => f.endsWith(".mjs")).map((f) => f.slice(0, -4)) : [];
    console.error(`Fonte desconhecida: ${fonteNome}. Use: ${[...Object.keys(fontes), ...externas].join(" | ")}`);
    process.exit(2);
  }
  if (!pegarLock()) {
    console.log(`Já existe uma coleta "${fonteNome}" rodando; saindo.`);
    return;
  }
  const { alvos } = lerJson(path.join(DADOS, "alvos.json"), { alvos: [] });
  if (!alvos.length) throw new Error("dados-coletados/alvos.json vazio — rode scripts/coleta/exportar-alvos.ts antes.");

  let lista = alvos;
  if (fonte.ufs?.length) lista = lista.filter((a) => fonte.ufs.includes(a.uf));
  if (opcoes.uf) lista = lista.filter((a) => a.uf === opcoes.uf.toUpperCase());
  if (opcoes.ibge) {
    const set = new Set(opcoes.ibge.split(","));
    lista = lista.filter((a) => set.has(a.ibge));
  }
  if (opcoes.limite) lista = lista.slice(0, Number(opcoes.limite));

  status.total = lista.length;
  log(`=== início "${fonteNome}" pid ${process.pid}: ${lista.length} municípios (intervalo ${fonte.intervalo} ms)`);
  const t0 = Date.now();
  // Ex.: montar a tabela entidade → IBGE de um diário antes de varrer os municípios.
  if (fonte.preparar) await fonte.preparar(lista.filter((a) => !estadoDe(a).concluidoEm || opcoes.refazer));

  for (const [i, alvo] of lista.entries()) {
    const est = estadoDe(alvo);
    status.atual = `${alvo.nome}/${alvo.uf}`;
    if (est.concluidoEm && !opcoes.refazer) {
      status.feitos++;
      continue;
    }
    try {
      const resumo = await fonte.processar(alvo);
      if (!Object.keys(est.erros).length) est.concluidoEm = new Date().toISOString();
      status.feitos++;
      log(`[${i + 1}/${lista.length}] ${alvo.nome}/${alvo.uf}: ${resumo}${Object.keys(est.erros).length ? " (com pendências)" : ""}`);
    } catch (e) {
      est.erros._geral = String(e?.message ?? e);
      log(`[${i + 1}/${lista.length}] ${alvo.nome}/${alvo.uf}: ERRO ${e?.message ?? e}`);
    }
    salvarEstado();
  }

  const pendentes = lista.filter((a) => !estadoDe(a).concluidoEm).length;
  estado.ultimaRodada = { fim: new Date().toISOString(), minutos: Math.round((Date.now() - t0) / 60000), pendentes };
  status.atual = null;
  status.concluido = pendentes === 0;
  salvarEstado();
  log(`=== fim "${fonteNome}": ${lista.length - pendentes} concluídos, ${pendentes} com pendência (serão refeitos na próxima rodada)`);
}

main()
  .catch((e) => {
    log(`FALHA GERAL: ${e?.stack ?? e}`);
    process.exitCode = 1;
  })
  .finally(() => {
    const lock = lerJson(arqLock, null);
    if (lock?.pid === process.pid) fs.rmSync(arqLock, { force: true });
  });
