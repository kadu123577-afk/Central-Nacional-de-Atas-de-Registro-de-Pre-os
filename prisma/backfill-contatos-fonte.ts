/**
 * Backfill de fonte e confiança dos contatos (fase 2 de design, 2026-10-05):
 * lê o texto livre de `particularidades` (e as anotações no nome) e preenche
 * os campos `fonte`, `fonteUrl` e `confianca` de pontos_focais. Só preenche
 * campo vazio (nunca sobrescreve) e usa SQL direto pra NÃO mexer em
 * `updatedAt` — o "atualizado há X" do card depende dele.
 *
 * Rodar com: npx tsx --env-file=.env prisma/backfill-contatos-fonte.ts [--dry-run]
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { extrairConfianca, extrairFonte } from "../src/lib/contatos-fonte";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const contatos = await prisma.pontoFocal.findMany({
    select: { id: true, cargo: true, particularidades: true, fonte: true, fonteUrl: true, confianca: true },
  });

  let atualizados = 0;
  let semDado = 0;
  for (const c of contatos) {
    const { fonte, fonteUrl } = extrairFonte(c.particularidades);
    const confianca = extrairConfianca(c.particularidades, c.cargo);

    const novaFonte = c.fonte ?? fonte;
    const novaUrl = c.fonteUrl ?? fonteUrl;
    const novaConfianca = c.confianca ?? confianca;
    if (novaFonte === c.fonte && novaUrl === c.fonteUrl && novaConfianca === c.confianca) {
      if (!novaFonte && !novaConfianca) semDado += 1;
      continue;
    }

    atualizados += 1;
    if (!dryRun) {
      await prisma.$executeRaw`
        UPDATE "pontos_focais"
        SET "fonte" = ${novaFonte}, "fonteUrl" = ${novaUrl}, "confianca" = ${novaConfianca}
        WHERE "id" = ${c.id}
      `;
    }
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}contatos: ${contatos.length} · atualizados: ${atualizados} · sem dado de fonte/confiança: ${semDado}`,
  );
}

main().finally(() => prisma.$disconnect());
