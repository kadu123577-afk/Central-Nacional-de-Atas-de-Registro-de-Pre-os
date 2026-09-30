/**
 * Importação de contatos de prefeituras (2026-09-30) — lê o markdown
 * gerado por outra sessão de levantamento manual (prefeito, secretários
 * de Administração/Finanças, Saúde e Educação, telefone, e-mail, site
 * oficial, fonte, confiança) e cria `PontoFocal` pra cada `EntidadeAlvo`
 * municipal correspondente.
 *
 * As tabelas markdown têm colunas variáveis entre lotes (algumas têm
 * Telefone/E-mail/Fonte/Confiança, outras não) — o parser lê o cabeçalho
 * de cada tabela e mapeia por nome de coluna, não por posição fixa.
 *
 * "não encontrado" (e variações como "(buscar)", "(sem site oficial)")
 * vira ausência de dado — nunca inventa um contato. Idempotente: pula
 * quem já tem um PontoFocal com o mesmo cargo e nome (não duplica se
 * rodar de novo).
 *
 * Rodar com: npx tsx prisma/importar-contatos-prefeituras.ts <caminho-do-md>
 */
import fs from "fs";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function limparValor(valor: string | null | undefined): string | null {
  if (!valor) return null;
  let v = valor.trim();
  v = v.replace(/\*+$/, "").trim();
  if (!v) return null;
  const semDado = /^(não encontrado|nao encontrado|\(buscar\)|sem site|não confirmado)/i;
  if (semDado.test(v)) return null;
  return v;
}

interface LinhaContato {
  uf: string;
  municipio: string;
  prefeito: string | null;
  partido: string | null;
  telefone: string | null;
  email: string | null;
  secAdmFinancas: string | null;
  secSaude: string | null;
  secEducacao: string | null;
  siteOficial: string | null;
  fonte: string | null;
  confianca: string | null;
}

function mapearColuna(cabecalho: string): keyof LinhaContato | null {
  const c = normalizar(cabecalho);
  if (c === "uf") return "uf";
  if (c.includes("municipio")) return "municipio";
  if (c.includes("prefeito")) return "prefeito";
  if (c.includes("partido")) return "partido";
  if (c.includes("telefone")) return "telefone";
  if (c.includes("mail")) return "email";
  if (c.includes("adm") && (c.includes("financ") || c.includes("gestao"))) return "secAdmFinancas";
  if (c.includes("saude")) return "secSaude";
  if (c.includes("educacao")) return "secEducacao";
  if (c.includes("site")) return "siteOficial";
  if (c.includes("fonte")) return "fonte";
  if (c.includes("confianc")) return "confianca";
  return null;
}

function separarCelulas(linha: string): string[] {
  return linha
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function parsearMarkdown(md: string): LinhaContato[] {
  const linhasArquivo = md.split("\n");
  const resultado: LinhaContato[] = [];
  let i = 0;

  while (i < linhasArquivo.length) {
    const linha = linhasArquivo[i];
    if (!linha.trim().startsWith("|")) {
      i++;
      continue;
    }
    const cabecalho = separarCelulas(linha);
    // linha seguinte tem que ser o separador markdown (---|---|...)
    const proxima = linhasArquivo[i + 1] ?? "";
    if (!/^\|[\s:-]+\|/.test(proxima.trim())) {
      i++;
      continue;
    }
    const mapaColunas = cabecalho.map(mapearColuna);
    if (!mapaColunas.includes("uf") || !mapaColunas.includes("municipio")) {
      i += 2;
      continue;
    }

    i += 2;
    while (i < linhasArquivo.length && linhasArquivo[i].trim().startsWith("|")) {
      const celulas = separarCelulas(linhasArquivo[i]);
      const linhaObj: Partial<LinhaContato> = {};
      mapaColunas.forEach((campo, idx) => {
        if (campo) (linhaObj as Record<string, string>)[campo] = celulas[idx] ?? "";
      });
      if (linhaObj.uf && linhaObj.municipio) {
        resultado.push({
          uf: linhaObj.uf.trim(),
          municipio: linhaObj.municipio.trim(),
          prefeito: limparValor(linhaObj.prefeito),
          partido: limparValor(linhaObj.partido),
          telefone: limparValor(linhaObj.telefone),
          email: limparValor(linhaObj.email),
          secAdmFinancas: limparValor(linhaObj.secAdmFinancas),
          secSaude: limparValor(linhaObj.secSaude),
          secEducacao: limparValor(linhaObj.secEducacao),
          siteOficial: limparValor(linhaObj.siteOficial),
          fonte: limparValor(linhaObj.fonte),
          confianca: limparValor(linhaObj.confianca),
        });
      }
      i++;
    }
  }

  return resultado;
}

async function main() {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error("Uso: npx tsx prisma/importar-contatos-prefeituras.ts <caminho-do-md>");
    process.exit(1);
  }
  const md = fs.readFileSync(caminho, "utf8");
  const linhas = parsearMarkdown(md);
  console.log(`${linhas.length} linhas de município encontradas no markdown.`);

  const entidades = await prisma.entidadeAlvo.findMany({
    where: { tipo: "municipal" },
    select: { id: true, uf: true, municipio: true },
  });
  const indice = new Map<string, string>();
  for (const e of entidades) {
    indice.set(`${e.uf}|${normalizar(e.municipio ?? "")}`, e.id);
  }

  let semCorrespondencia = 0;
  let contatosCriados = 0;
  let contatosJaExistiam = 0;
  const naoEncontrados: string[] = [];

  for (const linha of linhas) {
    const chave = `${linha.uf}|${normalizar(linha.municipio)}`;
    const entidadeId = indice.get(chave);
    if (!entidadeId) {
      semCorrespondencia += 1;
      naoEncontrados.push(`${linha.uf}/${linha.municipio}`);
      continue;
    }

    const particularidadesPartes = [
      linha.partido ? `Partido: ${linha.partido}.` : null,
      linha.siteOficial ? `Site oficial: ${linha.siteOficial}.` : null,
      linha.fonte ? `Fonte: ${linha.fonte}.` : null,
      linha.confianca ? `Confiança: ${linha.confianca}.` : null,
    ].filter(Boolean);
    const particularidades = particularidadesPartes.length > 0 ? particularidadesPartes.join(" ") : null;

    const candidatos: { cargo: string; area: string; nomeContato: string; comContato: boolean }[] = [];
    if (linha.prefeito) {
      candidatos.push({ cargo: "Prefeito(a)", area: "Gabinete do Prefeito", nomeContato: linha.prefeito, comContato: true });
    }
    if (linha.secAdmFinancas) {
      candidatos.push({
        cargo: "Secretário(a) de Administração/Finanças",
        area: "Secretaria de Administração/Finanças",
        nomeContato: linha.secAdmFinancas,
        comContato: false,
      });
    }
    if (linha.secSaude) {
      candidatos.push({
        cargo: "Secretário(a) de Saúde",
        area: "Secretaria de Saúde",
        nomeContato: linha.secSaude,
        comContato: false,
      });
    }
    if (linha.secEducacao) {
      candidatos.push({
        cargo: "Secretário(a) de Educação",
        area: "Secretaria de Educação",
        nomeContato: linha.secEducacao,
        comContato: false,
      });
    }

    for (const c of candidatos) {
      const existente = await prisma.pontoFocal.findFirst({
        where: { entidadeAlvoId: entidadeId, cargo: c.cargo, nomeContato: c.nomeContato },
      });
      if (existente) {
        contatosJaExistiam += 1;
        continue;
      }
      await prisma.pontoFocal.create({
        data: {
          entidadeAlvoId: entidadeId,
          cargo: c.cargo,
          area: c.area,
          nomeContato: c.nomeContato,
          telefone: c.comContato ? linha.telefone : null,
          email: c.comContato ? linha.email : null,
          particularidades,
          isSeed: false,
        },
      });
      contatosCriados += 1;
    }
  }

  console.log("\n=== Resumo da importação ===");
  console.log(`Municípios sem correspondência na base: ${semCorrespondencia}`);
  if (naoEncontrados.length > 0) {
    console.log("Sem correspondência:", naoEncontrados.join(", "));
  }
  console.log(`Contatos criados: ${contatosCriados}`);
  console.log(`Contatos que já existiam (pulados): ${contatosJaExistiam}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
