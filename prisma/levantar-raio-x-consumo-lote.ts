/**
 * Raio-X de consumo em lote (2026-09-25) — roda `calcularRaioXConsumo`
 * pra TODOS os municípios já enriquecidos com CNPJ (ver
 * enriquecer-cnpj-municipios.ts), não só um de cada vez pela tela.
 *
 * Pedido explícito do usuário: "eu queria criar essa ressonância,
 * tomografia, raio-x dos 1000 municípios que estou levantando os dados
 * de prefeito e secretários" — o levantamento de contato e o de consumo
 * são o mesmo lote de municípios, andam juntos.
 *
 * Idempotente e resumível: pula município que já foi atualizado há
 * menos de `DIAS_PARA_REVALIDAR` dias (não reconsulta o PNCP à toa se o
 * script for interrompido e rodado de novo). Uma falha num município
 * (timeout, CNPJ não encontrado no PNCP, etc.) não derruba o lote
 * inteiro — fica registrada no resumo final e o script segue pro
 * próximo.
 *
 * Rodar com: npx tsx prisma/levantar-raio-x-consumo-lote.ts
 * Variável opcional: LIMITE=50 pra rodar só uma amostra primeiro.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { calcularRaioXConsumo } from "../src/lib/raio-x-consumo";

const prisma = new PrismaClient();
const DIAS_PARA_REVALIDAR = 30;
const PAUSA_ENTRE_MUNICIPIOS_MS = 800;

async function main() {
  const limite = process.env.LIMITE ? Number(process.env.LIMITE) : undefined;

  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - DIAS_PARA_REVALIDAR);

  const entidades = await prisma.entidadeAlvo.findMany({
    where: {
      tipo: "municipal",
      cnpj: { not: null },
      OR: [{ raioXAtualizadoEm: null }, { raioXAtualizadoEm: { lt: dataLimite } }],
    },
    select: { id: true, nome: true, cnpj: true },
    orderBy: { nome: "asc" },
    take: limite,
  });

  console.log(`${entidades.length} municípios pra processar neste lote.`);

  let processados = 0;
  let comCategoria = 0;
  let semCategoria = 0;
  const falhas: { nome: string; erro: string }[] = [];

  for (const entidade of entidades) {
    try {
      const resultado = await calcularRaioXConsumo(entidade.cnpj!);
      if (resultado.erro) {
        falhas.push({ nome: entidade.nome, erro: resultado.erro });
      } else {
        await prisma.$transaction([
          prisma.historicoConsumoCategoria.deleteMany({ where: { entidadeAlvoId: entidade.id } }),
          prisma.historicoConsumoCategoria.createMany({
            data: resultado.categoriasIdentificadas.map((c) => ({
              entidadeAlvoId: entidade.id,
              categoria: c.categoria,
              ultimaContratacao: c.ultimaContratacao,
              valorUltimaContratacao: c.valorUltimaContratacao,
              quantidadeContratosNaJanela: c.quantidadeContratosNaJanela,
              objetoUltimaContratacao: c.objetoUltimaContratacao.slice(0, 2000),
            })),
          }),
          prisma.entidadeAlvo.update({
            where: { id: entidade.id },
            data: { raioXAtualizadoEm: new Date() },
          }),
        ]);
        if (resultado.categoriasIdentificadas.length > 0) comCategoria += 1;
        else semCategoria += 1;
      }
    } catch (erro) {
      falhas.push({ nome: entidade.nome, erro: erro instanceof Error ? erro.message : "erro desconhecido" });
    }

    processados += 1;
    if (processados % 25 === 0) {
      console.log(`${processados}/${entidades.length} processados...`);
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSA_ENTRE_MUNICIPIOS_MS));
  }

  console.log("\n=== Resumo do lote ===");
  console.log(`Processados: ${processados}`);
  console.log(`Com ao menos 1 categoria identificada: ${comCategoria}`);
  console.log(`Sem nenhuma categoria identificada: ${semCategoria}`);
  console.log(`Falhas: ${falhas.length}`);
  if (falhas.length > 0) {
    console.log("Municípios com falha:");
    for (const f of falhas.slice(0, 30)) {
      console.log(` - ${f.nome}: ${f.erro}`);
    }
    if (falhas.length > 30) console.log(`   ...e mais ${falhas.length - 30}.`);
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
