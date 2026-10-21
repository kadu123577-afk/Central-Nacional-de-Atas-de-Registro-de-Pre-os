/**
 * Gera os sinais preditivos ("contrato vencendo", "compra prevista no PCA" e
 * "orçamento") dos municípios-alvo a partir dos dados públicos coletados em
 * dados-coletados/ (scripts/coleta) e grava em SinalMunicipio — 2026-10-12,
 * Projeto RNA §9 (inteligência preditiva). Não usa o Claude.
 *
 * Idempotente: cada sinal tem chaveExterna; rodar de novo atualiza o que
 * mudou, cria o que surgiu e apaga os automáticos que deixaram de valer
 * (ex.: contrato prorrogado saiu da janela). Sinais manuais e dos dossiês
 * (sem chaveExterna) nunca são tocados.
 *
 * Uso: npx tsx scripts/inteligencia/gerar-sinais-preditivos.ts [--dry-run] [--ibge=5208707,...]
 * Opções: --contratos=25 --pca=20 (máximo por município) --dias=150 --mostrar (lista os sinais)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  maisRelevantes,
  OPCOES_CONTRATO_PADRAO,
  sinalDeContratoVencendo,
  sinaisDeOrcamento,
  sinaisDePca,
  type ContratoPncp,
  type LinhaDca,
  type PcaPncp,
  type SinalCandidato,
} from "../../src/lib/sinais-preditivos";

const prisma = new PrismaClient();
const DADOS = process.env.COLETA_DIR ? path.resolve(process.env.COLETA_DIR) : path.resolve("dados-coletados");
const opcoes = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? "1"];
  }),
);
const dryRun = Boolean(opcoes["dry-run"]);
const MAX_CONTRATOS = Number(opcoes.contratos ?? 25);
const MAX_PCA = Number(opcoes.pca ?? 20);
const DIAS = Number(opcoes.dias ?? OPCOES_CONTRATO_PADRAO.dias);
const PREFIXOS_AUTOMATICOS = ["pncp-contrato:", "pncp-pca:", "siconfi-dca:"];

function* linhas(arquivo: string): Generator<{ chave: string; dado: unknown }> {
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    if (!linha) continue;
    try {
      yield JSON.parse(linha);
    } catch {
      // linha truncada (processo interrompido no meio da escrita): ignora
    }
  }
}

function candidatosDoMunicipio(uf: string, ibge: string, hoje: Date): SinalCandidato[] {
  const contratos = new Map<string, ContratoPncp>();
  const pcas: PcaPncp[] = [];
  for (const fonte of ["pncp", "pncp-orgaos"]) {
    for (const { chave, dado } of linhas(path.join(DADOS, fonte, uf, `${ibge}.ndjson`))) {
      if (chave.startsWith("contratos")) {
        const c = dado as ContratoPncp;
        const atual = contratos.get(c.numeroControlePNCP);
        if (!atual || (c.dataAtualizacao ?? "") > (atual.dataAtualizacao ?? "")) contratos.set(c.numeroControlePNCP, c);
      } else if (chave.startsWith("pca")) {
        pcas.push(dado as PcaPncp);
      }
    }
  }
  const dca: LinhaDca[] = [];
  for (const { chave, dado } of linhas(path.join(DADOS, "siconfi", uf, `${ibge}.ndjson`))) {
    if (chave.includes("DCA-Anexo I-E")) dca.push(dado as LinhaDca);
  }

  const doContrato = [...contratos.values()]
    .map((c) => sinalDeContratoVencendo(c, hoje, { ...OPCOES_CONTRATO_PADRAO, dias: DIAS }))
    .filter((s): s is SinalCandidato => s !== null);
  const doPca = pcas.flatMap((p) => sinaisDePca(p, hoje));
  return [
    ...maisRelevantes(doContrato, MAX_CONTRATOS),
    ...maisRelevantes(doPca, MAX_PCA),
    ...sinaisDeOrcamento(ibge, dca),
  ];
}

async function main() {
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  const filtroIbge = opcoes.ibge ? new Set(String(opcoes.ibge).split(",")) : null;
  const entidades = await prisma.entidadeAlvo.findMany({
    where: { isSeed: false, codigoIbgeMunicipio: { not: null }, uf: { not: null } },
    select: { id: true, nome: true, uf: true, codigoIbgeMunicipio: true },
    orderBy: { nome: "asc" },
  });

  const total = { municipios: 0, comSinal: 0, criados: 0, atualizados: 0, apagados: 0, porTipo: {} as Record<string, number> };

  for (const e of entidades) {
    const ibge = e.codigoIbgeMunicipio!;
    if (filtroIbge && !filtroIbge.has(ibge)) continue;
    total.municipios++;
    const desejados = candidatosDoMunicipio(e.uf!, ibge, hoje);
    if (desejados.length) total.comSinal++;
    for (const s of desejados) total.porTipo[s.tipo] = (total.porTipo[s.tipo] ?? 0) + 1;
    if (opcoes.mostrar) {
      console.log(`\n## ${e.nome}/${e.uf} (${desejados.length} sinais)`);
      for (const x of desejados) {
        console.log(`- [${x.tipo}${x.categoria ? " · " + x.categoria : ""}] ${x.titulo}\n    ${x.detalhe}`);
      }
    }

    const existentes = await prisma.sinalMunicipio.findMany({
      where: { entidadeAlvoId: e.id, OR: PREFIXOS_AUTOMATICOS.map((p) => ({ chaveExterna: { startsWith: p } })) },
      select: { id: true, chaveExterna: true },
    });
    const porChave = new Map(existentes.map((x) => [x.chaveExterna!, x.id]));
    const chavesDesejadas = new Set(desejados.map((s) => s.chaveExterna));
    const apagar = existentes.filter((x) => !chavesDesejadas.has(x.chaveExterna!)).map((x) => x.id);
    const novos = desejados.filter((s) => !porChave.has(s.chaveExterna));
    const atualizar = desejados.filter((s) => porChave.has(s.chaveExterna));
    total.criados += novos.length;
    total.atualizados += atualizar.length;
    total.apagados += apagar.length;
    if (dryRun) continue;

    const campos = (s: SinalCandidato) => ({
      tipo: s.tipo,
      titulo: s.titulo,
      detalhe: s.detalhe,
      fonte: s.fonte,
      fonteUrl: s.fonteUrl,
      categoria: s.categoria,
      valorEstimado: s.valorEstimado,
      expiraEm: s.expiraEm,
    });
    await prisma.$transaction([
      prisma.sinalMunicipio.deleteMany({ where: { id: { in: apagar } } }),
      prisma.sinalMunicipio.createMany({
        data: novos.map((s) => ({ ...campos(s), entidadeAlvoId: e.id, chaveExterna: s.chaveExterna, dataSinal: hoje })),
        skipDuplicates: true,
      }),
      // dataSinal fica a da primeira detecção: o "há X dias" mostra há quanto tempo o sinal existe.
      ...atualizar.map((s) => prisma.sinalMunicipio.update({ where: { chaveExterna: s.chaveExterna }, data: campos(s) })),
    ]);
  }

  console.log(dryRun ? "SIMULAÇÃO (nada gravado)" : "Sinais gravados");
  console.log(total);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
