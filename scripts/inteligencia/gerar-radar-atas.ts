/**
 * Gera o Radar de atas e o Funil de prospecção de fornecedores a partir dos
 * dados públicos do PNCP já coletados — 2026-10-22, Projeto RNA etapa 5. Não
 * usa o Claude nem a rede: lê dados-coletados/pncp e pncp-orgaos (mantidos em
 * dia pela coleta automática) e grava em RadarAta e ProspeccaoFornecedor.
 * Regras em src/lib/radar-atas.ts; leitura e ligação em src/lib/radar-atas-fonte.ts.
 *
 * O que faz:
 *  1. Lê, município a município (sem guardar tudo na memória), as atas e os
 *     contratos que os municípios-alvo publicaram. O fornecedor de uma ata é a
 *     empresa (CNPJ) que mais aparece nos contratos que a citam, vindos de
 *     qualquer município lido — inclusive o contrato de quem aderiu à ata.
 *     Pessoa física e CPF nunca entram.
 *  2. Deixa só as atas elegíveis (não canceladas, abertas à adesão, com pelo
 *     menos --dias dias de vigência), classifica o objeto em categoria e conta
 *     a demanda: quantos municípios-alvo DIFERENTES de quem publicou a ata
 *     mostram necessidade daquela categoria. A necessidade vem de duas fontes,
 *     juntas e sem contar o mesmo município duas vezes:
 *       - SinalMunicipio com categoria e ainda dentro da validade (contrato
 *         vencendo, PCA etc.; sinal sem categoria não indica categoria);
 *       - raio-X de consumo (HistoricoConsumoCategoria): o município contratou
 *         a categoria na janela do raio-X, ou seja, é consumidor dela.
 *  3. Pontua (pontuarAta), grava em RadarAta (no máximo 20.000, as de maior
 *     pontuação) e apaga as linhas que deixaram de ser elegíveis.
 *  4. Agrega os fornecedores das atas do radar e cria o funil
 *     (ProspeccaoFornecedor, "identificado") para os --limite-fornecedores
 *     primeiros que ainda não existem. Quem já existe só tem atasVigentes,
 *     pontuação, categorias, UFs e razão social vazia atualizadas: estágio,
 *     observações e próximo contato nunca são alterados.
 *
 * Idempotente. Com --ibge as atas só são recalculadas para aqueles municípios
 * (as linhas dos outros ficam como estão; os contratos continuam sendo lidos de
 * todos, para ligar o fornecedor), o limite de 20.000 vale para o radar inteiro
 * e o funil considera o radar inteiro. Opção desconhecida encerra o script sem
 * fazer nada (um --dryrun escrito errado não pode virar uma gravação).
 *
 * Uso: npx tsx scripts/inteligencia/gerar-radar-atas.ts [--dry-run] [--mostrar]
 *        [--ibge=5208707,...] [--dias=45] [--limite-fornecedores=300]
 * COLETA_DIR aponta para a pasta dados-coletados (padrão: ./dados-coletados).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../../src/generated/prisma/client";
import { rotuloDaCategoria } from "../../src/lib/categorias";
import {
  agregarFornecedores,
  DIAS_MINIMOS_ADESAO,
  demandaPorCategoria,
  PONTOS_POR_MUNICIPIO,
  TETO_PONTOS_DEMANDA,
} from "../../src/lib/radar-atas";
import {
  ataMaisRecente,
  avaliarAta,
  chaveMunicipio,
  contarPorCategoria,
  grupoDoMotivo,
  LIMITE_ATAS_RADAR,
  lerLinha,
  ligarFornecedor,
  linhaRadar,
  normalizarAta,
  paraAtasDoFornecedor,
  planejarProspeccao,
  planejarRadar,
  pontuarCandidata,
  registrarVinculo,
  vinculoDeContrato,
  type AtaCandidata,
  type AtaNormalizada,
  type Ligacoes,
  type ProspeccaoExistente,
  type RadarExistente,
} from "../../src/lib/radar-atas-fonte";
import { resumir } from "../../src/lib/sinais-preditivos";

const prisma = new PrismaClient();
const DADOS = process.env.COLETA_DIR ? path.resolve(process.env.COLETA_DIR) : path.resolve("dados-coletados");
const FONTES = ["pncp", "pncp-orgaos"];

function falhar(mensagem: string): never {
  console.error(`${mensagem} Nada foi feito.`);
  process.exit(1);
}

// Opção desconhecida ou mal escrita (ex.: --dryrun) encerra o script: se fosse ignorada, a rodada
// que devia ser só uma simulação gravaria no banco.
const OPCOES_SEM_VALOR = new Set(["dry-run", "mostrar"]);
const OPCOES_COM_VALOR = new Set(["ibge", "dias", "limite-fornecedores"]);
const opcoes: Record<string, string> = {};
for (const arg of process.argv.slice(2)) {
  const igual = arg.indexOf("=");
  const nome = arg.startsWith("--") ? arg.slice(2, igual === -1 ? undefined : igual) : "";
  const valor = igual === -1 ? undefined : arg.slice(igual + 1);
  if (OPCOES_SEM_VALOR.has(nome)) {
    if (valor !== undefined) falhar(`A opção --${nome} não recebe valor.`);
    opcoes[nome] = "1";
  } else if (OPCOES_COM_VALOR.has(nome)) {
    if (!valor) falhar(`A opção --${nome} precisa de um valor (--${nome}=...).`);
    opcoes[nome] = valor;
  } else {
    falhar(
      `Opção desconhecida: "${arg}". Use: --dry-run, --mostrar, --ibge=5208707,..., --dias=45, --limite-fornecedores=300.`,
    );
  }
}
const dryRun = opcoes["dry-run"] !== undefined;
const mostrar = opcoes.mostrar !== undefined;

function inteiroPositivo(nome: string, padrao: number, minimo: number): number {
  const bruto = opcoes[nome];
  if (bruto === undefined) return padrao;
  const n = Number(bruto);
  if (!/^\d+$/.test(bruto) || !Number.isSafeInteger(n) || n < minimo) {
    falhar(`Opção --${nome} inválida ("${bruto}"): use um número inteiro maior ou igual a ${minimo}.`);
  }
  return n;
}
const DIAS = inteiroPositivo("dias", DIAS_MINIMOS_ADESAO, 0);
const LIMITE_FORNECEDORES = inteiroPositivo("limite-fornecedores", 300, 1);

/** --ibge=5208707,5205109 → conjunto de códigos IBGE (7 dígitos); null sem a opção. */
function codigosIbge(): Set<string> | null {
  if (opcoes.ibge === undefined) return null;
  const codigos = opcoes.ibge.split(",").map((s) => s.trim());
  const invalido = codigos.find((c) => !/^\d{7}$/.test(c));
  if (invalido !== undefined) falhar(`Opção --ibge inválida ("${invalido}"): cada código IBGE tem 7 dígitos.`);
  return new Set(codigos);
}

function* linhasDoArquivo(arquivo: string): Generator<string> {
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    if (linha) yield linha;
  }
}

function* blocos<T>(lista: T[], tamanho: number): Generator<T[]> {
  for (let i = 0; i < lista.length; i += tamanho) yield lista.slice(i, i + tamanho);
}

/** Tabela que ainda não existe no banco (a migração do radar não foi aplicada). */
function tabelaInexistente(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2021";
}

const fmtData = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
const num = (n: number) => n.toLocaleString("pt-BR");

function nomeCategoria(slug: string | null): string {
  return slug ? `${rotuloDaCategoria(slug)} (${slug})` : "sem categoria";
}

async function main() {
  if (!fs.existsSync(DADOS)) {
    throw new Error(`A pasta de dados coletados não existe: ${DADOS}. Confira COLETA_DIR. Nada foi gravado.`);
  }
  const agora = new Date();
  const filtroIbge = codigosIbge();
  const parcial = filtroIbge !== null;

  const entidades = await prisma.entidadeAlvo.findMany({
    where: { isSeed: false, codigoIbgeMunicipio: { not: null }, uf: { not: null } },
    select: { id: true, nome: true, municipio: true, uf: true, codigoIbgeMunicipio: true },
    orderBy: { nome: "asc" },
  });
  const alvos = entidades.filter((e) => !filtroIbge || filtroIbge.has(e.codigoIbgeMunicipio!));

  // ── Demanda: municípios-alvo (todos, mesmo com --ibge) com necessidade por categoria ──
  const idsAlvo = new Set(entidades.map((e) => e.id));
  const [sinais, raioX] = await Promise.all([
    prisma.sinalMunicipio.findMany({
      where: { isSeed: false, categoria: { not: null }, OR: [{ expiraEm: null }, { expiraEm: { gte: agora } }] },
      select: { entidadeAlvoId: true, categoria: true },
    }),
    prisma.historicoConsumoCategoria.findMany({ select: { entidadeAlvoId: true, categoria: true } }),
  ]);
  const sinaisAlvo = sinais.filter((s) => idsAlvo.has(s.entidadeAlvoId));
  const raioXAlvo = raioX.filter((s) => idsAlvo.has(s.entidadeAlvoId));
  const demanda = demandaPorCategoria([...sinaisAlvo, ...raioXAlvo]);

  console.log(`Dados: ${DADOS}${dryRun ? "  (SIMULAÇÃO: nada será gravado)" : ""}`);
  console.log(
    `Municípios-alvo: ${num(entidades.length)}${parcial ? ` (lendo ${num(alvos.length)} por --ibge)` : ""} · vigência mínima: ${DIAS} dias`,
  );
  console.log(
    `Demanda: ${num(sinaisAlvo.length)} sinais com categoria + ${num(raioXAlvo.length)} linhas do raio-X → ${demanda.size} categorias com algum município.`,
  );
  const municipiosNoTeto = TETO_PONTOS_DEMANDA / PONTOS_POR_MUNICIPIO;
  const saturadas = [...demanda.values()].filter((ids) => ids.size >= municipiosNoTeto).length;
  console.log(
    `Categorias que já batem o teto de pontos de demanda (${municipiosNoTeto} municípios ou mais): ${saturadas} de ${demanda.size}.`,
  );

  // ── Leitura município a município ──
  const vistas = new Map<string, string>(); // ata → dataAtualizacao da versão que valeu
  const candidatas = new Map<string, AtaCandidata>();
  const foraDoRadar = new Map<string, string>(); // ata → grupo do motivo
  const ligacoes: Ligacoes = new Map();
  const contratosVistos = new Set<string>();
  let municipiosComArquivo = 0;
  let linhasDeAta = 0;
  let contratosComAta = 0;

  // Os contratos vêm de todos os municípios-alvo, mesmo com --ibge: o contrato de quem aderiu à
  // ata mora em outro município, e sem ele a ata perderia o fornecedor. As atas, só dos municípios lidos.
  let feitos = 0;
  for (const e of entidades) {
    feitos++;
    if (feitos % 100 === 0) {
      console.log(`  … ${num(feitos)}/${num(entidades.length)} municípios · ${num(vistas.size)} atas · ${num(candidatas.size)} elegíveis`);
    }
    const lerAtas = !filtroIbge || filtroIbge.has(e.codigoIbgeMunicipio!);
    const municipio = { entidadeAlvoId: e.id, uf: e.uf!, municipioNome: e.municipio ?? e.nome };
    const locais = new Map<string, AtaNormalizada>();
    let temArquivo = false;
    for (const fonte of FONTES) {
      const arquivo = path.join(DADOS, fonte, e.uf!, `${e.codigoIbgeMunicipio}.ndjson`);
      if (!fs.existsSync(arquivo)) continue;
      temArquivo = true;
      for (const linha of linhasDoArquivo(arquivo)) {
        const lida = lerLinha(linha);
        if (!lida) continue;
        if (lida.tipo === "ata") {
          if (!lerAtas) continue;
          linhasDeAta++;
          const ata = normalizarAta(lida.dado);
          if (ata) locais.set(ata.numeroControle, ataMaisRecente(locais.get(ata.numeroControle), ata));
        } else {
          const vinculo = vinculoDeContrato(lida.dado);
          if (vinculo && registrarVinculo(ligacoes, vinculo, contratosVistos)) contratosComAta++;
        }
      }
    }
    if (temArquivo && lerAtas) municipiosComArquivo++;

    for (const ata of locais.values()) {
      // Mesma ata em dois municípios (raro): fica a versão mais recente.
      const anterior = vistas.get(ata.numeroControle);
      if (anterior !== undefined && anterior >= ata.atualizadoEm) continue;
      vistas.set(ata.numeroControle, ata.atualizadoEm);
      candidatas.delete(ata.numeroControle);
      foraDoRadar.delete(ata.numeroControle);
      const avaliacao = avaliarAta(ata, agora, municipio, { diasMinimos: DIAS });
      if (avaliacao.elegivel) candidatas.set(ata.numeroControle, avaliacao.candidata);
      else foraDoRadar.set(ata.numeroControle, grupoDoMotivo(avaliacao.motivo));
    }
  }

  if (municipiosComArquivo === 0) {
    throw new Error(
      `Nenhum arquivo de município encontrado em ${DADOS}/{${FONTES.join(",")}}/<UF>/<IBGE>.ndjson. Confira COLETA_DIR. Nada foi gravado nem apagado.`,
    );
  }

  // ── Fornecedor e pontuação ──
  const pontuadas = [...candidatas.values()].map((c) => pontuarCandidata(ligarFornecedor(c, ligacoes), demanda));

  // ── Estado atual do banco ──
  let tabelasPendentes = false;
  let existentes: RadarExistente[] = [];
  let prospeccoes: ProspeccaoExistente[] = [];
  try {
    existentes = await prisma.radarAta.findMany({
      select: {
        numeroControlePncpAta: true,
        uf: true,
        municipioNome: true,
        categoria: true,
        fornecedorCnpj: true,
        fornecedorNome: true,
        pontuacao: true,
      },
    });
    prospeccoes = await prisma.prospeccaoFornecedor.findMany({
      select: { cnpj: true, razaoSocial: true, atasVigentes: true, pontuacao: true, categorias: true, ufs: true },
    });
  } catch (e) {
    if (!tabelaInexistente(e)) throw e;
    if (!dryRun) {
      throw new Error(
        "As tabelas radar_atas e prospeccao_fornecedores ainda não existem neste banco. Aplique a migração 20261022010000_radar_prospeccao antes de gravar.",
      );
    }
    tabelasPendentes = true;
    console.log("Aviso: as tabelas do radar ainda não existem neste banco (migração pendente); a simulação trata como vazias.");
  }

  // Linhas do radar que esta rodada pode mexer: todas; com --ibge, só as dos municípios lidos.
  // O limite de 20.000 vale para o radar inteiro (planejarRadar).
  const escopo = parcial ? new Set(alvos.map((e) => chaveMunicipio(e.uf, e.municipio ?? e.nome))) : null;
  const { mantidas, cortadas, criar, atualizar, apagar, foraDoEscopo } = planejarRadar(pontuadas, existentes, {
    escopo,
    limite: LIMITE_ATAS_RADAR,
  });

  // ── Fornecedores: sobre o radar inteiro como vai ficar ──
  const radarFinal = [...mantidas, ...foraDoEscopo];
  const agregados = agregarFornecedores(paraAtasDoFornecedor(radarFinal));
  const plano = planejarProspeccao(agregados, prospeccoes, { topN: LIMITE_FORNECEDORES });
  const atualizadosSemZerar = plano.atualizar.length - plano.zerados;

  // ── Gravação ──
  if (!dryRun) {
    for (const bloco of blocos(criar.map((a) => linhaRadar(a, agora)), 1000)) {
      await prisma.radarAta.createMany({ data: bloco, skipDuplicates: true });
    }
    for (const bloco of blocos(atualizar, 200)) {
      await prisma.$transaction(
        bloco.map((a) => {
          const { numeroControlePncpAta, ...dados } = linhaRadar(a, agora);
          return prisma.radarAta.update({ where: { numeroControlePncpAta }, data: dados });
        }),
      );
    }
    for (const bloco of blocos(apagar, 5000)) {
      await prisma.radarAta.deleteMany({ where: { numeroControlePncpAta: { in: bloco } } });
    }
    for (const bloco of blocos(plano.criar, 500)) {
      await prisma.prospeccaoFornecedor.createMany({
        data: bloco.map((n) => ({ ...n, estagio: "identificado", origem: "radar" })),
        skipDuplicates: true,
      });
    }
    for (const bloco of blocos(plano.atualizar, 200)) {
      await prisma.$transaction(bloco.map((u) => prisma.prospeccaoFornecedor.update({ where: { cnpj: u.cnpj }, data: u.dados })));
    }
  }

  // ── Resumo ──
  const gruposFora = new Map<string, number>();
  for (const g of foraDoRadar.values()) gruposFora.set(g, (gruposFora.get(g) ?? 0) + 1);
  const comFornecedor = mantidas.filter((a) => a.fornecedorCnpj !== null).length;
  const semCategoria = mantidas.filter((a) => a.categoria === null).length;
  const comDemanda = mantidas.filter((a) => a.municipiosComDemanda > 0).length;
  const verbo = dryRun ? "seriam" : "foram";

  console.log(`\n${dryRun ? "SIMULAÇÃO (nada gravado)" : "Radar gravado"}${tabelasPendentes ? " · tabelas ainda não existem: tudo contaria como novo" : ""}`);
  console.log(`Municípios com arquivo: ${num(municipiosComArquivo)} de ${num(alvos.length)}`);
  console.log(`Atas lidas: ${num(vistas.size)} únicas (${num(linhasDeAta)} linhas de ata, com repetição entre janelas e fontes)`);
  console.log(`Contratos de empresa que citam uma ata: ${num(contratosComAta)}, ligando ${num(ligacoes.size)} atas a fornecedor`);
  console.log(`Elegíveis: ${num(candidatas.size)} · fora do radar: ${num(foraDoRadar.size)}`);
  for (const [grupo, n] of [...gruposFora.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${grupo}: ${num(n)}`);
  console.log(
    `Atas ${verbo} gravadas: ${num(mantidas.length)} (${num(criar.length)} novas, ${num(atualizar.length)} atualizadas)` +
      (cortadas > 0
      ? ` · CORTADAS pelo limite de ${num(LIMITE_ATAS_RADAR)}: ${num(cortadas)}${mantidas.length ? ` (a menor pontuação mantida é ${mantidas[mantidas.length - 1].pontuacao})` : ""}`
      : ""),
  );
  console.log(`Atas ${verbo} apagadas (deixaram de ser elegíveis ou de existir): ${num(apagar.length)}`);
  console.log(
    `No radar: ${num(comFornecedor)} com fornecedor CNPJ · ${num(semCategoria)} sem categoria · ${num(comDemanda)} com algum município com demanda`,
  );

  console.log("\nPor categoria (10 maiores):");
  for (const { categoria, quantidade } of contarPorCategoria(mantidas).slice(0, 10)) {
    const demandaCat = categoria ? demanda.get(categoria)?.size ?? 0 : 0;
    console.log(`  ${String(num(quantidade)).padStart(7)}  ${nomeCategoria(categoria)}${categoria ? ` · ${num(demandaCat)} municípios com demanda` : ""}`);
  }

  console.log(
    `\nFornecedores (empresas) nas atas do radar: ${num(agregados.length)} · funil: ${num(plano.criar.length)} ${verbo} criados (de até ${num(LIMITE_FORNECEDORES)}), ${num(atualizadosSemZerar)} atualizados, ${num(plano.zerados)} sem ata vigente (zerados) · já existiam: ${num(prospeccoes.length)}`,
  );

  if (mostrar) {
    console.log("\n20 melhores atas:");
    mantidas.slice(0, 20).forEach((a, i) => {
      console.log(
        `${String(i + 1).padStart(2)}. ${a.pontuacao} pts · ${nomeCategoria(a.categoria)} · demanda ${a.municipiosComDemanda} municípios · ${a.municipioNome}/${a.uf} · ${resumir(a.orgaoNome, 50)}`,
      );
      console.log(
        `    vigência até ${fmtData(a.vigenciaFim)} (${a.diasRestantes} dias) · ${a.numeroControlePncpAta} · fornecedor: ${a.fornecedorNome ?? "não identificado"}${a.fornecedorCnpj ? ` (${a.fornecedorCnpj})` : ""}`,
      );
      console.log(`    ${resumir(a.objeto, 140)}`);
    });
    console.log("\n20 melhores fornecedores:");
    agregados.slice(0, 20).forEach((f, i) => {
      console.log(
        `${String(i + 1).padStart(2)}. ${f.pontuacao} pts · ${f.razaoSocial} (${f.cnpj}) · ${f.atasVigentes} atas · ${f.ufs.join(",")} · ${f.categorias.map(rotuloDaCategoria).join("; ") || "sem categoria"}`,
      );
    });
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
