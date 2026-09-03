/**
 * Roda o rastreador do PNCP manualmente (fora do cron da Vercel), útil
 * pra testar localmente num ambiente com acesso à internet.
 *
 * Uso: npx tsx scripts/rastreador-pncp.ts [dias-pra-tras]
 */
import "dotenv/config";
import { executarRastreamentoPncp } from "../src/lib/rastreador-pncp";

async function main() {
  const diasParaTras = Number(process.argv[2] ?? "3");
  const agora = new Date();
  const dataInicial = new Date(agora);
  dataInicial.setDate(agora.getDate() - diasParaTras);

  console.log(
    `Buscando atas do PNCP entre ${dataInicial.toISOString().slice(0, 10)} e ${agora
      .toISOString()
      .slice(0, 10)}...`,
  );

  const resultado = await executarRastreamentoPncp({ dataInicial, dataFinal: agora });
  console.log(JSON.stringify(resultado, null, 2));

  if (resultado.erro) {
    process.exit(1);
  }
}

main();
