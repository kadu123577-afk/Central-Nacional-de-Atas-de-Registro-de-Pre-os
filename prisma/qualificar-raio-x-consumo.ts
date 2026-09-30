/**
 * Qualificação do raio-X de consumo (2026-09-30) — reclassifica os
 * registros de `HistoricoConsumoCategoria` já existentes usando o
 * classificador atualizado (src/lib/classificador-objeto.ts), sem
 * reconsultar o PNCP. Usa o texto já salvo em `objetoUltimaContratacao`
 * (o objeto do contrato mais recente daquela categoria) como amostra
 * representativa.
 *
 * Três desfechos por registro:
 *   - Categoria não muda: nada a fazer.
 *   - Vira `null` (a nova regra não bate mais nesse texto — falso
 *     positivo corrigido, ex.: "ar-condicionado" que era só amenidade de
 *     espaço alugado): apaga o registro.
 *   - Vira outra categoria (ex.: papelaria que estava em
 *     material-escritorio agora cai em grafica): move pra lá, mesclando
 *     com o registro já existente do município nessa categoria se
 *     houver (mantém a contratação mais recente, soma a quantidade).
 *
 * Rodar com: npx tsx prisma/qualificar-raio-x-consumo.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { classificarObjeto } from "../src/lib/classificador-objeto";

const prisma = new PrismaClient();

async function main() {
  const registros = await prisma.historicoConsumoCategoria.findMany();
  console.log(`${registros.length} registros pra reavaliar.`);

  let semMudanca = 0;
  let removidos = 0;
  let movidos = 0;

  for (const registro of registros) {
    const novaCategoria = classificarObjeto(registro.objetoUltimaContratacao);

    if (novaCategoria === registro.categoria) {
      semMudanca += 1;
      continue;
    }

    if (novaCategoria === null) {
      await prisma.historicoConsumoCategoria.delete({ where: { id: registro.id } });
      removidos += 1;
      continue;
    }

    const existente = await prisma.historicoConsumoCategoria.findUnique({
      where: {
        entidadeAlvoId_categoria: {
          entidadeAlvoId: registro.entidadeAlvoId,
          categoria: novaCategoria,
        },
      },
    });

    if (!existente) {
      await prisma.historicoConsumoCategoria.update({
        where: { id: registro.id },
        data: { categoria: novaCategoria },
      });
    } else {
      const maisRecente = existente.ultimaContratacao >= registro.ultimaContratacao ? existente : registro;
      await prisma.$transaction([
        prisma.historicoConsumoCategoria.update({
          where: { id: existente.id },
          data: {
            ultimaContratacao: maisRecente.ultimaContratacao,
            valorUltimaContratacao: maisRecente.valorUltimaContratacao,
            objetoUltimaContratacao: maisRecente.objetoUltimaContratacao,
            quantidadeContratosNaJanela: existente.quantidadeContratosNaJanela + registro.quantidadeContratosNaJanela,
          },
        }),
        prisma.historicoConsumoCategoria.delete({ where: { id: registro.id } }),
      ]);
    }
    movidos += 1;
  }

  console.log("\n=== Resumo da qualificação ===");
  console.log(`Sem mudança: ${semMudanca}`);
  console.log(`Removidos (falso positivo corrigido): ${removidos}`);
  console.log(`Movidos pra outra categoria: ${movidos}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
