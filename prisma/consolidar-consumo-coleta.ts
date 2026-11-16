/**
 * Consolida o consumo de cada município no banco (16/11/2026, pedido de Carlos): lê os contratos que a
 * coleta em lote já baixou do PNCP (dados-coletados/pncp e dados-coletados/pncp-orgaos, todos os
 * órgãos do município) e grava, por município e categoria, o consumo detalhado: quanto gastou na
 * janela, quantos contratos, com quantos fornecedores, quando a vigência termina e se já compra por
 * adesão a ata. É o que alimenta o panorama de vendas (/admin/panorama).
 *
 * Não consulta a internet: só lê o que já está em disco. Por padrão só SIMULA e mostra o resumo; com
 * APLICAR=1 grava (atualiza a linha do município e da categoria, nunca apaga categoria que o raio-X
 * simples já tinha achado) e marca o raio-X do município como atualizado. Repetir é seguro.
 *
 * Rodar com (tsx não lê o .env sozinho):
 *   npx tsx --env-file=.env prisma/consolidar-consumo-coleta.ts                (simulação)
 *   APLICAR=1 npx tsx --env-file=.env prisma/consolidar-consumo-coleta.ts
 * Variáveis opcionais: UF=GO,MG (só esses estados), LIMITE=50 (amostra), JANELA=36 (meses) e
 * DADOS=<pasta dados-coletados> (padrão: a pasta irmã Central-Nacional-de-Atas-de-Registro-de-Pre-os).
 */
import { createReadStream, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { PrismaClient } from "../src/generated/prisma/client";
import { JANELA_MESES_PADRAO, lerContratoColetado, resumirConsumo, type ContratoColetado } from "../src/lib/consumo-coleta";

const prisma = new PrismaClient();
const FONTES = ["pncp", "pncp-orgaos"] as const;

async function lerContratos(arquivo: string): Promise<ContratoColetado[]> {
  const contratos: ContratoColetado[] = [];
  const leitor = createInterface({ input: createReadStream(arquivo, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const linha of leitor) {
    if (!linha.trim()) continue;
    let registro: { chave?: unknown; dado?: unknown };
    try {
      registro = JSON.parse(linha);
    } catch {
      continue;
    }
    if (typeof registro.chave !== "string" || !registro.chave.startsWith("contratos")) continue;
    const contrato = lerContratoColetado(registro.dado);
    if (contrato) contratos.push(contrato);
  }
  return contratos;
}

async function main() {
  const aplicar = process.env.APLICAR === "1";
  const dados = resolve(process.env.DADOS ?? join(__dirname, "..", "..", "Central-Nacional-de-Atas-de-Registro-de-Pre-os", "dados-coletados"));
  const limite = process.env.LIMITE ? Number(process.env.LIMITE) : undefined;
  const janela = process.env.JANELA ? Number(process.env.JANELA) : JANELA_MESES_PADRAO;
  const ufs = process.env.UF ? process.env.UF.split(",").map((u) => u.trim().toUpperCase()) : undefined;
  if (!existsSync(dados)) {
    console.error(`Pasta de dados não encontrada: ${dados}. Informe DADOS=<caminho de dados-coletados>.`);
    process.exit(1);
  }

  const entidades = await prisma.entidadeAlvo.findMany({
    where: { tipo: "municipal", codigoIbgeMunicipio: { not: null }, ...(ufs ? { uf: { in: ufs } } : {}) },
    select: { id: true, uf: true, municipio: true, codigoIbgeMunicipio: true },
    orderBy: [{ uf: "asc" }, { municipio: "asc" }],
    ...(limite ? { take: limite } : {}),
  });

  const hoje = new Date();
  let semArquivo = 0;
  let comConsumo = 0;
  let linhasGravadas = 0;
  const porCategoria = new Map<string, number>();

  for (const e of entidades) {
    const arquivos = FONTES.map((f) => join(dados, f, e.uf ?? "", `${e.codigoIbgeMunicipio}.ndjson`)).filter(existsSync);
    if (arquivos.length === 0) {
      semArquivo += 1;
      continue;
    }
    const contratos = (await Promise.all(arquivos.map(lerContratos))).flat();
    const resumos = resumirConsumo(contratos, hoje, janela);
    if (resumos.length > 0) comConsumo += 1;
    for (const r of resumos) porCategoria.set(r.categoria, (porCategoria.get(r.categoria) ?? 0) + 1);
    if (!aplicar) continue;

    for (const r of resumos) {
      const campos = {
        ultimaContratacao: r.ultimaContratacao,
        valorUltimaContratacao: r.valorUltimaContratacao,
        quantidadeContratosNaJanela: r.quantidadeContratos,
        objetoUltimaContratacao: r.objetoUltimaContratacao,
        valorTotalNaJanela: r.valorTotalNaJanela,
        janelaMeses: r.janelaMeses,
        primeiraContratacao: r.primeiraContratacao,
        vigenciaFimMaisRecente: r.vigenciaFimMaisRecente,
        fornecedoresDistintos: r.fornecedoresDistintos,
        orgaosDistintos: r.orgaosDistintos,
        contratosPorAdesao: r.contratosPorAdesao,
        origemDados: "coleta-pncp",
      };
      await prisma.historicoConsumoCategoria.upsert({
        where: { entidadeAlvoId_categoria: { entidadeAlvoId: e.id, categoria: r.categoria } },
        update: campos,
        create: { entidadeAlvoId: e.id, categoria: r.categoria, ...campos },
      });
      linhasGravadas += 1;
    }
    await prisma.entidadeAlvo.update({ where: { id: e.id }, data: { raioXAtualizadoEm: hoje } });
  }

  const top = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`Municípios lidos: ${entidades.length} (${semArquivo} sem arquivo de coleta, ${comConsumo} com consumo nas categorias conhecidas).`);
  console.log(`Categorias mais presentes (municípios): ${top.map(([c, n]) => `${c} ${n}`).join(", ") || "nenhuma"}.`);
  console.log(aplicar ? `Gravado: ${linhasGravadas} linha(s) de consumo.` : "Simulação: nada foi gravado. Rode de novo com APLICAR=1 para gravar.");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
