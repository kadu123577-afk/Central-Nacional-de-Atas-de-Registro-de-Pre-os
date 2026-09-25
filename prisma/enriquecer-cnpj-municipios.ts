/**
 * Enriquece as `EntidadeAlvo` do tipo "municipal" com o CNPJ real da
 * prefeitura, puxado da API pública do SICONFI (Tesouro Nacional) —
 * cruzado por `codigoIbgeMunicipio`, que já é salvo desde o lote 1 do
 * levantamento (ver seed-municipios-alvo.ts).
 *
 * Confirmado ao vivo em 2026-09-25: `GET .../tt/entes` devolve, numa
 * chamada só, todos os ~5.598 entes (municípios + estados) com
 * `cod_ibge` e `cnpj` — cobre 5.496 dos 5.570 municípios do Brasil
 * (os que faltam não têm dado enviado ao SICONFI, situação documentada
 * pelo próprio Tesouro). Sem esse CNPJ não dá pra consultar o histórico
 * de contratos no PNCP (`/v1/contratos?cnpjOrgao=...`) — é o pré-
 * requisito do raio-X de consumo.
 *
 * Rodar com: npx tsx prisma/enriquecer-cnpj-municipios.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();
const URL_SICONFI_ENTES = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/entes";
const TIMEOUT_MS = 30_000;

interface EnteSiconfi {
  cod_ibge: number;
  ente: string;
  cnpj: string;
  esfera: string;
}

async function main() {
  const resposta = await fetch(URL_SICONFI_ENTES, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resposta.ok) {
    throw new Error(`SICONFI respondeu ${resposta.status}`);
  }
  const corpo = (await resposta.json()) as { items: EnteSiconfi[] };

  const cnpjPorCodigoIbge = new Map<string, string>();
  for (const ente of corpo.items) {
    if (ente.esfera === "M") {
      cnpjPorCodigoIbge.set(String(ente.cod_ibge), ente.cnpj);
    }
  }
  console.log(`SICONFI devolveu ${cnpjPorCodigoIbge.size} municípios com CNPJ.`);

  const entidades = await prisma.entidadeAlvo.findMany({
    where: { tipo: "municipal", codigoIbgeMunicipio: { not: null }, cnpj: null },
    select: { id: true, codigoIbgeMunicipio: true, nome: true },
  });

  let atualizados = 0;
  let semCnpjNoSiconfi = 0;

  for (const entidade of entidades) {
    const cnpj = cnpjPorCodigoIbge.get(entidade.codigoIbgeMunicipio!);
    if (!cnpj) {
      semCnpjNoSiconfi += 1;
      continue;
    }
    await prisma.entidadeAlvo.update({ where: { id: entidade.id }, data: { cnpj } });
    atualizados += 1;
  }

  console.log(`Enriquecidas: ${atualizados}. Sem CNPJ no SICONFI: ${semCnpjNoSiconfi}.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
