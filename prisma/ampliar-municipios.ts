/**
 * Amplia a base de municípios por estado, rumo ao Brasil todo (15/11/2026, pedido de Carlos).
 *
 * Consulta a população estimada no IBGE (API de agregados, tabela 6579, a mesma do primeiro lote) e
 * cadastra, como `EntidadeAlvo` do tipo "municipal", os municípios que ainda não estão na base. Por
 * padrão só SIMULA: mostra quantos entrariam por estado. Com APLICAR=1 grava. É seguro rodar de novo:
 * a chave é o código IBGE, então município já cadastrado não duplica.
 *
 * Depois de aplicar, siga o ciclo da onda (ver ROBO-DO-RAIO-X.md): CNPJ pelo SICONFI
 * (enriquecer-cnpj-municipios.ts) e raio-X de consumo (levantar-raio-x-consumo-lote.ts).
 *
 * Rodar com (tsx não lê o .env sozinho):
 *   UF=MG npx tsx --env-file=.env prisma/ampliar-municipios.ts            (simulação)
 *   UF=MG,BA APLICAR=1 npx tsx --env-file=.env prisma/ampliar-municipios.ts
 *   UF=todas npx tsx --env-file=.env prisma/ampliar-municipios.ts         (todos os estados, menos o DF)
 * Variáveis opcionais: MIN_POP, MAX_POP (faixa de população) e LIMITE (quantos no máximo, por estado,
 * os mais populosos primeiro).
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { dadosDaEntidade, escolherNovos, lerPopulacaoIbge, resolverUfs, type EstadoIbge } from "../src/lib/ampliar-municipios";

const prisma = new PrismaClient();
const TIMEOUT_MS = 60_000;
const TENTATIVAS = 3;

function numeroDoAmbiente(nome: string): number | undefined {
  const bruto = process.env[nome];
  if (!bruto) return undefined;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`${nome} deve ser um número (recebi "${bruto}").`);
    process.exit(1);
  }
  return n;
}

async function buscarPopulacao(estado: EstadoIbge): Promise<unknown> {
  const url = `https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6%5BN3%5B${estado.codigo}%5D%5D`;
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      return await resposta.json();
    } catch (erro) {
      ultimoErro = erro;
      await new Promise((r) => setTimeout(r, 2000 * tentativa));
    }
  }
  throw new Error(`IBGE não respondeu para ${estado.sigla}: ${ultimoErro instanceof Error ? ultimoErro.message : ultimoErro}`);
}

async function main() {
  const ufs = resolverUfs(process.env.UF);
  if (!ufs.ok) {
    console.error(ufs.erro);
    process.exit(1);
  }
  const aplicar = process.env.APLICAR === "1";
  const opcoes = { minPop: numeroDoAmbiente("MIN_POP"), maxPop: numeroDoAmbiente("MAX_POP"), limite: numeroDoAmbiente("LIMITE") };

  const existentes = await prisma.entidadeAlvo.findMany({ where: { codigoIbgeMunicipio: { not: null } }, select: { codigoIbgeMunicipio: true } });
  const jaNaBase = new Set(existentes.map((e) => e.codigoIbgeMunicipio as string));

  let totalNovos = 0;
  for (const estado of ufs.ufs) {
    const todos = lerPopulacaoIbge(await buscarPopulacao(estado));
    if (todos.length === 0) {
      console.warn(`${estado.sigla}: o IBGE não devolveu municípios (resposta vazia). Nada feito neste estado.`);
      continue;
    }
    const novos = escolherNovos(todos, jaNaBase, opcoes);
    const jaTinha = todos.filter((m) => jaNaBase.has(m.codigo)).length;
    console.log(`${estado.sigla}: ${todos.length} municípios no IBGE, ${jaTinha} já na base, ${novos.length} a cadastrar.`);
    if (!aplicar) {
      for (const m of novos.slice(0, 5)) console.log(`   ex.: ${m.municipio} (${m.populacao.toLocaleString("pt-BR")} hab.)`);
      totalNovos += novos.length;
      continue;
    }

    const { count } = await prisma.entidadeAlvo.createMany({ data: novos.map(dadosDaEntidade), skipDuplicates: true });
    for (const m of novos) jaNaBase.add(m.codigo);
    totalNovos += count;
    console.log(`   gravados: ${count}`);
  }

  console.log(
    aplicar
      ? `\nFeito: ${totalNovos} município(s) cadastrado(s). Próximo passo da onda: CNPJ (enriquecer-cnpj-municipios.ts) e raio-X (levantar-raio-x-consumo-lote.ts).`
      : `\nSimulação: ${totalNovos} município(s) seriam cadastrados. Rode de novo com APLICAR=1 para gravar.`,
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
