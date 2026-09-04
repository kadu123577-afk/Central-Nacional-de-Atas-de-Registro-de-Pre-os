/**
 * Corrige, em lote, itens já gravados no banco com um código numérico
 * solto colado no final da descrição (ex.: "Máscara cirúrgica descartável
 * 75336346") — o mesmo problema que limparDescricaoPncp (src/lib/pncp.ts)
 * já evita em importações novas. Este script varre todo item existente e
 * corrige quem bate no mesmo padrão, não só um registro específico —
 * a causa raiz é a mesma em todos.
 *
 * Script versionado, não edição manual — repetível em qualquer ambiente
 * (staging, produção) e o que mudou fica registrado no log de saída.
 *
 * Uso: npx tsx prisma/corrigir-descricoes-pncp.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { limparDescricaoPncp } from "../src/lib/pncp";

const prisma = new PrismaClient();

async function main() {
  const itens = await prisma.item.findMany({ select: { id: true, descricao: true } });

  const corrigidos: { id: string; antes: string; depois: string }[] = [];

  for (const item of itens) {
    const descricaoCorrigida = limparDescricaoPncp(item.descricao);
    if (descricaoCorrigida !== item.descricao) {
      corrigidos.push({ id: item.id, antes: item.descricao, depois: descricaoCorrigida });
    }
  }

  if (corrigidos.length === 0) {
    console.log("Nenhum item com número colado na descrição encontrado.");
    return;
  }

  for (const c of corrigidos) {
    await prisma.item.update({ where: { id: c.id }, data: { descricao: c.depois } });
    console.log(`  "${c.antes}" -> "${c.depois}"`);
  }

  console.log(`\n${corrigidos.length} item(ns) corrigido(s).`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
