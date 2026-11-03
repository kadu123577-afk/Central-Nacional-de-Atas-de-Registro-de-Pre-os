#!/usr/bin/env node
/**
 * Monta, para cada município, o "contexto" que o agente do dossiê lê antes de
 * pesquisar: o que a coleta automática (PNCP, Compras.gov.br, órgãos, diários,
 * SICONFI e coletores estaduais em fontes/) já trouxe.
 *
 * Motivo (2026-10-10): os dossiês gastavam boa parte do esforço repetindo
 * processos que o script do PNCP já baixa de graça. Com o contexto, o agente
 * pula o que já é conhecido e usa os sinais prontos (contratos e atas vencendo,
 * PCA, maiores fornecedores) em vez de procurá-los na web.
 *
 * Uso:   node scripts/coleta/contexto-dossie.mjs <ibge>[,<ibge>...] [--hoje=AAAA-MM-DD]
 * Saída: dados-coletados/agentes/contexto/<ibge>.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DADOS = process.env.COLETA_DIR ? path.resolve(process.env.COLETA_DIR) : path.join(RAIZ, "dados-coletados");
const DIR_FONTES = path.join(RAIZ, "scripts", "coleta", "fontes");

const args = process.argv.slice(2);
const ibges = args.filter((a) => !a.startsWith("--")).flatMap((a) => a.split(",")).filter(Boolean);
const HOJE = (args.find((a) => a.startsWith("--hoje=")) ?? "").slice(7) || new Date().toISOString().slice(0, 10);
if (!ibges.length) {
  console.error("Uso: node scripts/coleta/contexto-dossie.mjs <ibge>[,<ibge>...]");
  process.exit(2);
}

const somarDias = (iso, d) => new Date(Date.parse(iso) + d * 86400000).toISOString().slice(0, 10);
const DESDE = somarDias(HOJE, -730); // últimos 24 meses
const corta = (s, n) => (s == null ? null : String(s).replace(/\s+/g, " ").trim().slice(0, n));
const lerJson = (f, p) => {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return p;
  }
};

// Listas de prefeitos recebidas em PDF e convertidas por prefeitos-lista.mjs (dados-coletados/prefeitos/*.json).
// Já trazem nome, partido e contatos institucionais: o agente não precisa gastar busca nisso.
const prefeitosPorIbge = new Map();
const dirPrefeitos = path.join(DADOS, "prefeitos");
if (fs.existsSync(dirPrefeitos)) {
  for (const f of fs.readdirSync(dirPrefeitos).filter((x) => x.endsWith(".json"))) {
    const lista = lerJson(path.join(dirPrefeitos, f), null);
    for (const p of lista?.prefeitos ?? []) {
      if (!p.ibge) continue;
      prefeitosPorIbge.set(p.ibge, {
        nome: p.nomeCompleto,
        nomeUrna: p.nomeUrna,
        partido: p.partido,
        reeleito: p.reeleito,
        telefonePrefeitura: p.telefonePrefeitura,
        celular: p.celular,
        email: p.email,
        fonte: lista.fonte,
        atualizadaEm: lista.atualizadaEm,
        aviso: lista.aviso,
      });
    }
  }
}

function* registros(fonte, uf, ibge) {
  const arq = path.join(DADOS, fonte, uf, `${ibge}.ndjson`);
  if (!fs.existsSync(arq)) return;
  for (const linha of fs.readFileSync(arq, "utf8").split("\n")) {
    if (!linha) continue;
    try {
      yield JSON.parse(linha);
    } catch {
      // linha truncada por queda do processo: ignora
    }
  }
}

function estadoFonte(fonte, ibge) {
  const m = lerJson(path.join(DADOS, "_estado", `${fonte}.json`), { municipios: {} }).municipios[ibge];
  if (!m) return "não coletado";
  return m.concluidoEm ? "concluído" : "em andamento";
}

// ---- links públicos do PNCP a partir do número de controle
function urlPncp(nc) {
  const m = nc?.match(/^(\d{14})-(\d)-(\d+)\/(\d{4})(?:-(\d+))?$/);
  if (!m) return null;
  const [, cnpj, tipo, seq, ano, seqAta] = m;
  if (seqAta) return `https://pncp.gov.br/app/atas/${cnpj}/${ano}/${Number(seq)}/${Number(seqAta)}`;
  return tipo === "2" ? `https://pncp.gov.br/app/contratos/${cnpj}/${ano}/${Number(seq)}` : `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${Number(seq)}`;
}

async function carregarEstaduais() {
  if (!fs.existsSync(DIR_FONTES)) return [];
  const mods = [];
  for (const f of fs.readdirSync(DIR_FONTES).filter((f) => /^[a-z0-9-]+\.mjs$/.test(f))) {
    try {
      const mod = (await import(pathToFileURL(path.join(DIR_FONTES, f)).href)).default;
      if (typeof mod?.resumir === "function") mods.push({ nome: f.slice(0, -4), resumir: mod.resumir, descricao: mod.descricao });
    } catch (e) {
      console.error(`aviso: fonte ${f} não carregou (${e.message})`);
    }
  }
  return mods;
}

async function montar(alvo, estaduais) {
  const { ibge, uf } = alvo;
  const processos = [];
  const contratos = [];
  const atas = [];
  const pcaItens = [];
  let nContratos = 0;
  let nAtas = 0;
  let nCompras = 0;

  for (const fonte of ["pncp", "pncp-orgaos"]) {
    for (const { chave, dado: d } of registros(fonte, uf, ibge)) {
      if (chave.startsWith("contratos:")) {
        nContratos++;
        contratos.push({
          fonte,
          orgao: corta(d.orgaoEntidade?.razaoSocial, 60),
          objeto: corta(d.objetoContrato, 160),
          fornecedor: corta(d.nomeRazaoSocialFornecedor, 70),
          valor: d.valorGlobal ?? d.valorInicial ?? null,
          assinatura: d.dataAssinatura,
          vigenciaFim: d.dataVigenciaFim,
          url: urlPncp(d.numeroControlePNCP),
        });
      } else if (chave.startsWith("atas:")) {
        nAtas++;
        if (d.cancelado) continue;
        atas.push({ fonte, objeto: corta(d.objetoContratacao, 160), orgao: corta(d.nomeOrgao, 60), assinatura: d.dataAssinatura, vigenciaFim: d.vigenciaFim, url: urlPncp(d.numeroControlePNCPAta) });
      } else if (chave.startsWith("pca:")) {
        for (const it of d.itens ?? []) pcaItens.push({ ano: chave.slice(4), categoria: it.classificacaoSuperiorNome ?? it.categoriaItemPcaNome, item: corta(it.descricaoItem, 90), valor: it.valorTotal ?? 0, dataDesejada: it.dataDesejada });
      }
    }
  }

  for (const { dado: d } of registros("compras", uf, ibge)) {
    if (d.orgaoEntidadeEsferaId && d.orgaoEntidadeEsferaId !== "M") continue; // órgãos estaduais/federais situados no município
    nCompras++;
    const data = (d.dataPublicacaoPncp ?? d.dataAberturaPropostaPncp ?? "").slice(0, 10);
    if (data < DESDE) continue;
    processos.push({
      fonte: "compras.gov/pncp",
      data,
      numero: `${d.modalidadeNome ?? ""} ${d.numeroCompra ?? ""}/${d.anoCompraPncp ?? ""}`.trim(),
      processo: d.processo ?? null,
      objeto: corta(d.objetoCompra, 160),
      valorEstimado: d.valorTotalEstimado ?? null,
      valorHomologado: d.valorTotalHomologado ?? null,
      srp: d.srp ?? null,
      situacao: d.situacaoCompraNomePncp ?? null,
      orgao: d.orgaoEntidadeCnpj === alvo.cnpj ? undefined : corta(d.orgaoEntidadeRazaoSocial, 60),
      url: urlPncp(d.numeroControlePNCP),
    });
  }
  processos.sort((a, b) => b.data.localeCompare(a.data));

  const ate = (dias) => somarDias(HOJE, dias);
  const contratosVencendo = contratos
    .filter((c) => c.vigenciaFim && c.vigenciaFim >= HOJE && c.vigenciaFim <= ate(240))
    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
    .slice(0, 40);
  const atasVencendo = atas
    .filter((a) => a.vigenciaFim && a.vigenciaFim >= HOJE && a.vigenciaFim <= ate(180))
    .sort((a, b) => a.vigenciaFim.localeCompare(b.vigenciaFim))
    .slice(0, 40);
  const atasVigentes = atas.filter((a) => a.vigenciaFim && a.vigenciaFim >= HOJE).length;

  const porFornecedor = new Map();
  for (const c of contratos) {
    if (!c.fornecedor || (c.assinatura ?? "") < DESDE) continue;
    const f = porFornecedor.get(c.fornecedor) ?? { fornecedor: c.fornecedor, contratos: 0, valor: 0, exemplo: c.objeto };
    f.contratos++;
    f.valor += c.valor ?? 0;
    porFornecedor.set(c.fornecedor, f);
  }
  const maioresFornecedores = [...porFornecedor.values()].sort((a, b) => b.valor - a.valor).slice(0, 12).map((f) => ({ ...f, valor: Math.round(f.valor) }));

  const anosPca = [...new Set(pcaItens.map((i) => i.ano))].sort().reverse();
  const pcaAno = anosPca[0];
  const porCategoria = new Map();
  for (const i of pcaItens.filter((i) => i.ano === pcaAno)) porCategoria.set(i.categoria, (porCategoria.get(i.categoria) ?? 0) + (i.valor ?? 0));
  const pca = pcaAno
    ? {
        ano: pcaAno,
        itens: pcaItens.filter((i) => i.ano === pcaAno).length,
        valorTotal: Math.round(pcaItens.filter((i) => i.ano === pcaAno).reduce((s, i) => s + (i.valor ?? 0), 0)),
        categorias: [...porCategoria].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([categoria, valor]) => ({ categoria, valor: Math.round(valor) })),
        maioresItensFuturos: pcaItens.filter((i) => i.ano === pcaAno && (i.dataDesejada ?? "") >= HOJE).sort((a, b) => b.valor - a.valor).slice(0, 15),
      }
    : null;

  // SICONFI: despesa empenhada por função no último exercício disponível
  let despesa = null;
  const dca = [...registros("siconfi", uf, ibge)].filter((r) => r.chave.includes("DCA-Anexo I-E") && r.dado.coluna === "Despesas Empenhadas");
  if (dca.length) {
    const ano = Math.max(...dca.map((r) => r.dado.exercicio));
    const doAno = dca.filter((r) => r.dado.exercicio === ano);
    despesa = {
      exercicio: ano,
      total: Math.round(doAno.find((r) => r.dado.cod_conta === "TotalDespesas" && /Exceto Intra/i.test(r.dado.conta))?.dado.valor ?? 0),
      porFuncao: doAno.filter((r) => /^\d{2} - /.test(r.dado.conta)).sort((a, b) => b.dado.valor - a.dado.valor).slice(0, 10).map((r) => ({ funcao: r.dado.conta.slice(5), valor: Math.round(r.dado.valor) })),
    };
  }

  const diarios = [];
  for (const { chave, dado: d } of registros("diarios", uf, ibge)) {
    if ((d.data ?? "") < DESDE) continue;
    diarios.push({ termo: chave.slice(3), data: d.data, url: d.url, trecho: corta((d.trechos ?? []).join(" … ").replace(/\. \. /g, ""), 280) });
  }
  diarios.sort((a, b) => b.data.localeCompare(a.data));

  const fontesEstaduais = {};
  for (const m of estaduais) {
    const itens = [];
    let total = 0;
    for (const { chave, dado } of registros(m.nome, uf, ibge)) {
      total++;
      let r = null;
      try {
        r = m.resumir(chave, dado);
      } catch {
        continue;
      }
      if (!r || ((r.data ?? "9999") < DESDE && r.tipo !== "convenio")) continue;
      itens.push({ ...r, objeto: corta(r.objeto, 160), fornecedor: corta(r.fornecedor, 70) });
    }
    if (!total && estadoFonte(m.nome, ibge) === "não coletado") continue;
    itens.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
    fontesEstaduais[m.nome] = { descricao: m.descricao, situacao: estadoFonte(m.nome, ibge), registros: total, ultimos24meses: itens.length, itens: itens.slice(0, 80) };
  }

  return {
    ibge,
    municipio: alvo.nome.replace(/^Prefeitura (Municipal )?de /, ""),
    uf,
    cnpj: alvo.cnpj,
    populacao: alvo.populacao,
    prefeitoLista: prefeitosPorIbge.get(alvo.ibge) ?? null,
    geradoEm: new Date().toISOString(),
    referencia: HOJE,
    comoUsar:
      "Tudo aqui JÁ foi coletado automaticamente e será juntado ao dossiê. Não repita esses processos nem procure de novo o que está aqui: " +
      "use para o resumo e para os sinais, e gaste a pesquisa no que falta (diário oficial, portal municipal, TCE/TCM, notícias, contatos, riscos).",
    situacaoColeta: Object.fromEntries(["pncp", "pncp-orgaos", "compras", "diarios", "siconfi"].map((f) => [f, estadoFonte(f, ibge)])),
    totais: { contratosPncp: nContratos, atasPncp: nAtas, atasVigentes, contratacoesComprasGov: nCompras, contratacoesUltimos24meses: processos.length, trechosDiarios: diarios.length },
    contratosVencendo,
    atasVencendo,
    pca,
    maioresFornecedores,
    despesa,
    processosConhecidos: processos.slice(0, 150),
    processosConhecidosOmitidos: Math.max(0, processos.length - 150),
    diarios: diarios.slice(0, 20),
    fontesEstaduais,
  };
}

const { alvos } = lerJson(path.join(DADOS, "alvos.json"), { alvos: [] });
const porIbge = new Map(alvos.map((a) => [a.ibge, a]));
const estaduais = await carregarEstaduais();
const saida = path.join(DADOS, "agentes", "contexto");
fs.mkdirSync(saida, { recursive: true });
for (const ibge of ibges) {
  const alvo = porIbge.get(ibge);
  if (!alvo) {
    console.error(`${ibge}: não está em alvos.json`);
    continue;
  }
  const ctx = await montar(alvo, estaduais);
  const arq = path.join(saida, `${ibge}.json`);
  fs.writeFileSync(arq, JSON.stringify(ctx, null, 1));
  console.log(
    `${ibge} ${ctx.municipio}/${ctx.uf}: ${ctx.totais.contratacoesUltimos24meses} contratações (24m), ${ctx.contratosVencendo.length} contratos e ${ctx.atasVencendo.length} atas vencendo, ` +
      `PCA ${ctx.pca ? ctx.pca.itens + " itens" : "—"}, estaduais: ${Object.keys(ctx.fontesEstaduais).join(", ") || "—"} (${(fs.statSync(arq).size / 1024).toFixed(0)} KB)`,
  );
}
