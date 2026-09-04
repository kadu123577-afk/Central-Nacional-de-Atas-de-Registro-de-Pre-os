/**
 * Limpeza pontual (achado da revisão de telas de 2026-09-04, Prompt 1):
 * o banco deste ambiente acumulou atas/fornecedores/órgãos criados por
 * verificações ao vivo com Playwright em rodadas de prompts anteriores
 * desta mesma sessão de desenvolvimento — nunca houve dado real de
 * produção aqui. Esses registros passaram pelo formulário de verdade
 * (não pelo script de seed), então ficaram com `isSeed: false` e
 * apareceram nas telas públicas junto com o catálogo, com nomes como
 * "Fornecedor Prompt1 1788536704771 LTDA" e número de ata parecido com
 * timestamp Unix (ex.: "P2-1788536796397/2026").
 *
 * Este script apaga TODO dado com isSeed: false, com duas exceções
 * verificadas antes de escrever este script:
 *   1. Admin — nenhum admin de teste existe; o único registro
 *      isSeed:false é a conta real (`admin@tech10.com.br`, criada por
 *      `npm run seed:admin`). Admin nunca é tocado aqui.
 *   2. O fornecedor placeholder "a confirmar" (CNPJ 00000000000000) que
 *      `src/lib/rastreador-pncp.ts` usa de propósito quando o PNCP não
 *      retorna o fornecedor vencedor de uma compra — é infraestrutura
 *      do rastreador, não lixo de teste, mesmo sem atas associadas hoje.
 *
 * Não é o mesmo script que `seed-limpar.ts` (que apaga só isSeed:true,
 * o dataset de demonstração oficial) — os dois são independentes e
 * podem ser rodados em qualquer ordem.
 *
 * Uso: npx tsx prisma/limpar-dados-teste-vazados.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();
const CNPJ_FORNECEDOR_A_CONFIRMAR = "00000000000000";

async function main() {
  const faturamentos = await prisma.faturamento.deleteMany({
    where: { adesao: { isSeed: false } },
  });
  const historico = await prisma.adesaoHistorico.deleteMany({
    where: { adesao: { isSeed: false } },
  });
  const adesoes = await prisma.adesao.deleteMany({ where: { isSeed: false } });
  const saldos = await prisma.saldo.deleteMany({ where: { item: { isSeed: false } } });
  const itens = await prisma.item.deleteMany({ where: { isSeed: false } });
  const atas = await prisma.ata.deleteMany({ where: { isSeed: false } });
  const fornecedores = await prisma.fornecedor.deleteMany({
    where: { isSeed: false, cnpj: { not: CNPJ_FORNECEDOR_A_CONFIRMAR } },
  });
  const orgaos = await prisma.orgao.deleteMany({ where: { isSeed: false } });

  console.log("Dados de teste vazados removidos:");
  console.log(`  faturamentos: ${faturamentos.count}`);
  console.log(`  histórico de adesão: ${historico.count}`);
  console.log(`  adesões: ${adesoes.count}`);
  console.log(`  saldos: ${saldos.count}`);
  console.log(`  itens: ${itens.count}`);
  console.log(`  atas: ${atas.count}`);
  console.log(`  fornecedores: ${fornecedores.count}`);
  console.log(`  órgãos: ${orgaos.count}`);
  console.log("\nAdmin real e o fornecedor placeholder do rastreador PNCP foram preservados.");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
