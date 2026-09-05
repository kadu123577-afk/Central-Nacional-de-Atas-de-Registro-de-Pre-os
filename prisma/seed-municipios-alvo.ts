/**
 * Levantamento de dados de municípios (2026-09-05) — primeiro lote do
 * banco de prospecção comercial: "a gente já vai entregar o sistema
 * alimentado", não vai ser o parceiro nem o município que cadastra.
 *
 * Fonte: API de dados agregados do IBGE (tabela 6579 — População
 * residente estimada, /v3/agregados/6579), consultada ao vivo em
 * 2026-09-05 para os municípios de GO, TO, MT, MS, BA, PA, AM, MA, PI e
 * de MG e PR (as duas maiores, por isso "interior" — a ideia aqui é focar
 * nos estados/regiões pedidos, não cobrir o Brasil inteiro de uma vez).
 *
 * Critério de porte ("nem astronômico nem minúsculo"): população
 * estimada 2026 entre 15.000 e 250.000 habitantes, excluída a capital de
 * cada estado (que tem porte muito maior e já é tratada à parte). Esse
 * filtro deu 1.073 municípios — o pedido foi "uns mil", ficou um pouco
 * acima pra manter representação de todos os 11 estados/regiões pedidos
 * (Tocantins, o mais esparsamente povoado deles, tem só 14 municípios
 * nessa faixa; forçar exatamente 1.000 cortaria justamente os estados
 * menores).
 *
 * Cada município vira uma `EntidadeAlvo` (tipo "municipal") — SEM
 * nenhum contato ainda. Contatos (prefeito, secretários) são o que o
 * time comercial vai levantando rodada a rodada e cadastrando em
 * `/admin/entidades/[id]`. `codigoIbgeMunicipio` é a chave de upsert —
 * rodar este script de novo não duplica quem já foi cadastrado.
 *
 * Rodar com: npx tsx prisma/seed-municipios-alvo.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

interface MunicipioAlvo {
  uf: string;
  municipio: string;
  codigo_ibge: string;
  populacao_2026: number;
}

async function main() {
  const caminho = join(__dirname, "data", "municipios-alvo-lote1.json");
  const municipios: MunicipioAlvo[] = JSON.parse(readFileSync(caminho, "utf-8"));

  let criados = 0;
  let jaExistiam = 0;

  for (const m of municipios) {
    const existente = await prisma.entidadeAlvo.findUnique({
      where: { codigoIbgeMunicipio: m.codigo_ibge },
      select: { id: true },
    });
    if (existente) {
      jaExistiam += 1;
      continue;
    }

    await prisma.entidadeAlvo.create({
      data: {
        nome: `Prefeitura de ${m.municipio}`,
        tipo: "municipal",
        esfera: "municipal",
        uf: m.uf,
        municipio: m.municipio,
        codigoIbgeMunicipio: m.codigo_ibge,
      },
    });
    criados += 1;
  }

  console.log(`Lote 1 do levantamento de municípios: ${criados} criados, ${jaExistiam} já existiam.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
