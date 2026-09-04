/**
 * Backfill de Ata.categoria pra atas gravadas antes deste campo existir
 * (Opção A, 2026-09-04). Sem isso, uma ata real cadastrada antes da
 * migração fica com categoria nula e some da home/catálogo agrupado por
 * tema — mesmo tendo itens com Item.categoria preenchido normalmente.
 *
 * Deriva o tema da ata a partir da categoria mais frequente entre os
 * itens dela (empate: a primeira em ordem alfabética de descrição). Só
 * toca ata com `categoria` ainda nula — não sobrescreve nada já
 * classificado manualmente ou por este mesmo script numa execução
 * anterior.
 *
 * Script versionado, não edição manual — repetível em qualquer ambiente.
 *
 * Uso: npx tsx prisma/definir-categoria-atas-existentes.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const atas = await prisma.ata.findMany({
    where: { categoria: null },
    select: { id: true, numero: true, itens: { select: { categoria: true }, orderBy: { descricao: "asc" } } },
  });

  const semItens: string[] = [];
  const atualizadas: { numero: string; categoria: string }[] = [];

  for (const ata of atas) {
    if (ata.itens.length === 0) {
      semItens.push(ata.numero);
      continue;
    }

    const contagemPorCategoria = new Map<string, number>();
    for (const item of ata.itens) {
      contagemPorCategoria.set(item.categoria, (contagemPorCategoria.get(item.categoria) ?? 0) + 1);
    }

    let categoriaMaisFrequente = ata.itens[0].categoria;
    let maiorContagem = 0;
    for (const [categoria, contagem] of contagemPorCategoria) {
      if (contagem > maiorContagem) {
        maiorContagem = contagem;
        categoriaMaisFrequente = categoria;
      }
    }

    await prisma.ata.update({ where: { id: ata.id }, data: { categoria: categoriaMaisFrequente } });
    atualizadas.push({ numero: ata.numero, categoria: categoriaMaisFrequente });
  }

  for (const a of atualizadas) {
    console.log(`  Ata ${a.numero} -> "${a.categoria}"`);
  }
  console.log(`\n${atualizadas.length} ata(s) classificada(s) por herança dos itens.`);

  if (semItens.length > 0) {
    console.log(
      `${semItens.length} ata(s) sem nenhum item ficaram sem categoria (nada pra herdar): ${semItens.join(", ")}`,
    );
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
