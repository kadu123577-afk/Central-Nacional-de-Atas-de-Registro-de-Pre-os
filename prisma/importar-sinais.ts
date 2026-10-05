/**
 * Importador em lote de sinais de compra por município (fase 2 de design,
 * etapa 4, 2026-10-05) — é por onde os coletores futuros (PCA/PNCP,
 * licitações abertas, diários oficiais) vão alimentar o "por que agora" do
 * card. Também serve pra carga manual de uma pesquisa feita à mão.
 *
 * Formato da tabela markdown (uma linha por sinal):
 *   | UF | Município | Tipo | Título | Detalhe | Fonte | URL | Categoria | Valor | Data | Expira |
 * - Tipo: um de licitacao_aberta, contrato_vencendo, pca, troca_gestao,
 *   convenio, orcamento, noticia, outro (ver src/lib/sinais.ts).
 * - Categoria: slug de src/lib/categorias.ts (opcional; vazio = vale pra
 *   qualquer categoria). Valor: número (opcional). Data/Expira: aaaa-mm-dd
 *   ou dd/mm/aaaa (Expira opcional).
 * - Município casa por UF + nome (aceita "Prefeitura de X").
 * - Idempotente: não duplica (município + tipo + título + data).
 *
 * Rodar com: npx tsx --env-file=.env prisma/importar-sinais.ts <caminho-do-md> [--dry-run]
 */
import fs from "fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { CATEGORIAS_ATAS } from "../src/lib/categorias";
import { tipoSinalValido } from "../src/lib/sinais";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^prefeitura (municipal )?de /, "")
    .trim();
}

function parseData(texto: string): Date | null {
  const t = texto.trim();
  if (!t) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (br) return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
  return null;
}

function linhasDaTabela(md: string): string[][] {
  const linhas: string[][] = [];
  for (const bruta of md.split(/\r?\n/)) {
    const l = bruta.trim();
    if (!l.startsWith("|")) continue;
    const celulas = l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (celulas.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separador
    linhas.push(celulas);
  }
  return linhas;
}

async function main() {
  const caminho = process.argv[2];
  if (!caminho || caminho.startsWith("--")) {
    console.error("Uso: npx tsx --env-file=.env prisma/importar-sinais.ts <caminho-do-md> [--dry-run]");
    process.exit(1);
  }
  const tabela = linhasDaTabela(fs.readFileSync(caminho, "utf8"));
  if (tabela.length < 2) {
    console.error("Nenhuma linha de dados encontrada.");
    process.exit(1);
  }
  const [, ...dados] = tabela; // primeira linha = cabeçalho

  const entidades = await prisma.entidadeAlvo.findMany({
    where: { tipo: "municipal" },
    select: { id: true, uf: true, municipio: true },
  });
  const indice = new Map(entidades.map((e) => [`${e.uf}|${normalizar(e.municipio ?? "")}`, e.id]));
  const categoriasValidas = new Set(CATEGORIAS_ATAS.map((c) => c.slug));

  let criados = 0;
  let duplicados = 0;
  const problemas: string[] = [];

  for (const [i, c] of dados.entries()) {
    const [uf, municipio, tipo, titulo, detalhe, fonte, url, categoria, valor, data, expira] = c;
    const rotulo = `linha ${i + 2} (${uf}/${municipio})`;

    const entidadeId = indice.get(`${uf?.toUpperCase()}|${normalizar(municipio ?? "")}`);
    if (!entidadeId) {
      problemas.push(`${rotulo}: município não encontrado`);
      continue;
    }
    if (!tipoSinalValido(tipo ?? "")) {
      problemas.push(`${rotulo}: tipo inválido "${tipo}"`);
      continue;
    }
    if (!titulo || !fonte) {
      problemas.push(`${rotulo}: título e fonte são obrigatórios`);
      continue;
    }
    const dataSinal = parseData(data ?? "");
    if (!dataSinal) {
      problemas.push(`${rotulo}: data inválida "${data}"`);
      continue;
    }
    const expiraEm = expira ? parseData(expira) : null;
    if (expira && !expiraEm) {
      problemas.push(`${rotulo}: data de expiração inválida "${expira}"`);
      continue;
    }
    if (categoria && !categoriasValidas.has(categoria)) {
      problemas.push(`${rotulo}: categoria desconhecida "${categoria}"`);
      continue;
    }
    const valorNumero = valor ? Number(valor.replace(/\./g, "").replace(",", ".")) : null;
    if (valor && !Number.isFinite(valorNumero)) {
      problemas.push(`${rotulo}: valor inválido "${valor}"`);
      continue;
    }

    const jaExiste = await prisma.sinalMunicipio.findFirst({
      where: { entidadeAlvoId: entidadeId, tipo, titulo, dataSinal },
    });
    if (jaExiste) {
      duplicados += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.sinalMunicipio.create({
        data: {
          entidadeAlvoId: entidadeId,
          tipo,
          titulo,
          detalhe: detalhe || null,
          fonte,
          fonteUrl: url || null,
          categoria: categoria || null,
          valorEstimado: valorNumero != null ? String(valorNumero) : null,
          dataSinal,
          expiraEm,
        },
      });
    }
    criados += 1;
  }

  console.log(`${dryRun ? "[dry-run] " : ""}sinais criados: ${criados} · já existiam: ${duplicados} · com problema: ${problemas.length}`);
  for (const p of problemas) console.log(" - " + p);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
