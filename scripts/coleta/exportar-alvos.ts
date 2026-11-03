/**
 * Exporta os municípios-alvo (EntidadeAlvo) para dados-coletados/alvos.json,
 * com a população do SICONFI, para os coletores em lote (coletar.mjs) não
 * dependerem do banco enquanto rodam por horas.
 *
 * Uso: npx tsx scripts/coleta/exportar-alvos.ts
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "../../src/generated/prisma/client";

const prisma = new PrismaClient();
const DADOS = process.env.COLETA_DIR ? path.resolve(process.env.COLETA_DIR) : path.resolve("dados-coletados");

async function populacaoPorIbge(): Promise<Map<string, number>> {
  const r = await fetch("https://apidatalake.tesouro.gov.br/ords/siconfi/tt/entes", { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`SICONFI entes: HTTP ${r.status}`);
  const j = (await r.json()) as { items: { cod_ibge: number; esfera: string; populacao: number }[] };
  return new Map(j.items.filter((e) => e.esfera === "M").map((e) => [String(e.cod_ibge), e.populacao]));
}

async function main() {
  const populacao = await populacaoPorIbge();
  const entidades = await prisma.entidadeAlvo.findMany({
    where: { isSeed: false, tipo: "municipal", codigoIbgeMunicipio: { not: null }, cnpj: { not: null } },
    select: { id: true, nome: true, uf: true, codigoIbgeMunicipio: true, cnpj: true },
  });
  const alvos = entidades
    .map((e) => ({
      id: e.id,
      nome: e.nome,
      uf: e.uf,
      ibge: e.codigoIbgeMunicipio!,
      cnpj: e.cnpj!,
      populacao: populacao.get(e.codigoIbgeMunicipio!) ?? null,
    }))
    .sort((a, b) => (b.populacao ?? 0) - (a.populacao ?? 0));

  mkdirSync(DADOS, { recursive: true });
  const destino = path.join(DADOS, "alvos.json");
  writeFileSync(destino, JSON.stringify({ geradoEm: new Date().toISOString(), total: alvos.length, alvos }, null, 1));
  const semPop = alvos.filter((a) => a.populacao == null).length;
  console.log(`${alvos.length} municípios exportados para ${destino} (${semPop} sem população no SICONFI).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
