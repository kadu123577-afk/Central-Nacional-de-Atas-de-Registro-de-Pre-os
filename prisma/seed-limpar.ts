/**
 * Apaga só os dados criados por `npm run seed` (tudo marcado isSeed: true
 * em algum ponto da cadeia), na ordem certa de dependência de chave
 * estrangeira. Não recria o banco, não mexe em schema, não toca em dado
 * real (admin criado por seed-admin.ts, fornecedor/órgão que já usaram o
 * sistema de verdade) — só limpa o cenário fictício pra rodar
 * `npm run seed` de novo do zero.
 *
 * Uso: npm run seed:limpar
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const faturamentos = await prisma.faturamento.deleteMany({
    where: { adesao: { isSeed: true } },
  });
  const historico = await prisma.adesaoHistorico.deleteMany({
    where: { adesao: { isSeed: true } },
  });
  const adesoes = await prisma.adesao.deleteMany({ where: { isSeed: true } });
  const saldos = await prisma.saldo.deleteMany({ where: { item: { isSeed: true } } });
  const itens = await prisma.item.deleteMany({ where: { isSeed: true } });
  const documentos = await prisma.documentoAta.deleteMany({ where: { ata: { isSeed: true } } });
  const atas = await prisma.ata.deleteMany({ where: { isSeed: true } });
  const fornecedores = await prisma.fornecedor.deleteMany({ where: { isSeed: true } });
  const orgaos = await prisma.orgao.deleteMany({ where: { isSeed: true } });
  const admins = await prisma.admin.deleteMany({ where: { isSeed: true } });

  console.log("Dados de demonstração removidos:");
  console.log(`  faturamentos: ${faturamentos.count}`);
  console.log(`  histórico de adesão: ${historico.count}`);
  console.log(`  adesões: ${adesoes.count}`);
  console.log(`  saldos: ${saldos.count}`);
  console.log(`  itens: ${itens.count}`);
  console.log(`  documentos anexados: ${documentos.count}`);
  console.log(`  atas: ${atas.count}`);
  console.log(`  fornecedores: ${fornecedores.count}`);
  console.log(`  órgãos: ${orgaos.count}`);
  console.log(`  admins: ${admins.count}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
