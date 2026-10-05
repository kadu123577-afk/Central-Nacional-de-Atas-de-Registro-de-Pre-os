/**
 * Enriquecimento de contatos (2026-10-01) — diferente de
 * `importar-contatos-prefeituras.ts` (que lê uma linha por MUNICÍPIO,
 * com um único telefone/e-mail "de gabinete"), este script lê uma linha
 * por CONTATO (prefeito OU secretário, cada um com seu próprio
 * telefone/e-mail) — formato normalizado, necessário porque o
 * levantamento original nunca tinha telefone/e-mail de secretário, só
 * de prefeito. Achado real (2026-10-01): 0 dos 370 secretários
 * cadastrados tinham telefone ou e-mail.
 *
 * Formato da tabela markdown:
 *   | UF | Município | Cargo | Nome | Telefone | E-mail | Fonte | Confiança |
 * Cargo tem que ser exatamente um de:
 *   "Prefeito(a)", "Secretário(a) de Administração/Finanças",
 *   "Secretário(a) de Saúde", "Secretário(a) de Educação"
 *
 * Regra: só PREENCHE telefone/e-mail que hoje está faltando (nunca
 * sobrescreve um valor já salvo) — é enriquecimento, não correção. Se o
 * contato (entidade + cargo) ainda não existir, cria.
 *
 * Rodar com: npx tsx prisma/enriquecer-contatos-prefeituras.ts <caminho-do-md>
 */
import fs from "fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { extrairConfianca } from "../src/lib/contatos-fonte";

const prisma = new PrismaClient();

const CARGOS_VALIDOS = [
  "Prefeito(a)",
  "Secretário(a) de Administração/Finanças",
  "Secretário(a) de Saúde",
  "Secretário(a) de Educação",
] as const;

const AREA_POR_CARGO: Record<string, string> = {
  "Prefeito(a)": "Gabinete do Prefeito",
  "Secretário(a) de Administração/Finanças": "Secretaria de Administração/Finanças",
  "Secretário(a) de Saúde": "Secretaria de Saúde",
  "Secretário(a) de Educação": "Secretaria de Educação",
};

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function limparValor(valor: string | undefined): string | null {
  if (!valor) return null;
  let v = valor.trim();
  v = v.replace(/\*+$/, "").trim();
  if (!v) return null;
  const semDado = /^(não encontrado|nao encontrado|\(buscar\)|n\/a|não possui)/i;
  if (semDado.test(v)) return null;
  return v;
}

interface LinhaContato {
  uf: string;
  municipio: string;
  cargo: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  fonte: string | null;
  confianca: string | null;
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
    const proxima = linhasArquivo[i + 1] ?? "";
    if (!/^\|[\s:-]+\|/.test(proxima.trim())) {
      i++;
      continue;
    }
    const cabecalho = separarCelulas(linha).map(normalizar);
    const idxUf = cabecalho.indexOf("uf");
    const idxMunicipio = cabecalho.findIndex((c) => c.includes("municipio"));
    const idxCargo = cabecalho.indexOf("cargo");
    const idxNome = cabecalho.indexOf("nome");
    const idxTelefone = cabecalho.indexOf("telefone");
    const idxEmail = cabecalho.findIndex((c) => c.includes("mail"));
    const idxFonte = cabecalho.indexOf("fonte");
    const idxConfianca = cabecalho.findIndex((c) => c.includes("confianc"));

    i += 2;
    if (idxUf === -1 || idxMunicipio === -1 || idxCargo === -1) {
      while (i < linhasArquivo.length && linhasArquivo[i].trim().startsWith("|")) i++;
      continue;
    }

    while (i < linhasArquivo.length && linhasArquivo[i].trim().startsWith("|")) {
      const celulas = separarCelulas(linhasArquivo[i]);
      resultado.push({
        uf: (celulas[idxUf] ?? "").trim(),
        municipio: (celulas[idxMunicipio] ?? "").trim(),
        cargo: (celulas[idxCargo] ?? "").trim(),
        nome: limparValor(celulas[idxNome]),
        telefone: limparValor(celulas[idxTelefone]),
        email: idxEmail >= 0 ? limparValor(celulas[idxEmail]) : null,
        fonte: idxFonte >= 0 ? limparValor(celulas[idxFonte]) : null,
        confianca: idxConfianca >= 0 ? limparValor(celulas[idxConfianca]) : null,
      });
      i++;
    }
  }

  return resultado;
}

async function main() {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error("Uso: npx tsx prisma/enriquecer-contatos-prefeituras.ts <caminho-do-md>");
    process.exit(1);
  }
  const md = fs.readFileSync(caminho, "utf8");
  const linhas = parsearMarkdown(md);
  console.log(`${linhas.length} linhas de contato encontradas no markdown.`);

  const entidades = await prisma.entidadeAlvo.findMany({
    where: { tipo: "municipal" },
    select: { id: true, uf: true, municipio: true },
  });
  const indice = new Map<string, string>();
  for (const e of entidades) {
    indice.set(`${e.uf}|${normalizar(e.municipio ?? "")}`, e.id);
  }

  let semCorrespondencia = 0;
  let semCargoValido = 0;
  let semNadaNovo = 0;
  let atualizados = 0;
  let criados = 0;
  const naoEncontrados: string[] = [];

  for (const linha of linhas) {
    if (!(CARGOS_VALIDOS as readonly string[]).includes(linha.cargo)) {
      semCargoValido += 1;
      continue;
    }
    const chave = `${linha.uf}|${normalizar(linha.municipio)}`;
    const entidadeId = indice.get(chave);
    if (!entidadeId) {
      semCorrespondencia += 1;
      naoEncontrados.push(`${linha.uf}/${linha.municipio}`);
      continue;
    }
    if (!linha.telefone && !linha.email && !linha.nome) {
      semNadaNovo += 1;
      continue;
    }

    const particularidadesPartes = [
      linha.fonte ? `Fonte: ${linha.fonte}.` : null,
      linha.confianca ? `Confiança: ${linha.confianca}.` : null,
    ].filter(Boolean);
    const particularidades = particularidadesPartes.length > 0 ? particularidadesPartes.join(" ") : null;
    // Campos estruturados de qualidade do dado (2026-10-05): o texto livre
    // continua em particularidades, mas o card lê estes.
    const confiancaNivel = extrairConfianca(particularidades, linha.cargo);

    const existente = await prisma.pontoFocal.findFirst({
      where: { entidadeAlvoId: entidadeId, cargo: linha.cargo },
    });

    if (!existente) {
      if (!linha.nome) {
        semNadaNovo += 1;
        continue;
      }
      await prisma.pontoFocal.create({
        data: {
          entidadeAlvoId: entidadeId,
          cargo: linha.cargo,
          area: AREA_POR_CARGO[linha.cargo],
          nomeContato: linha.nome,
          telefone: linha.telefone,
          email: linha.email,
          particularidades,
          fonte: linha.fonte,
          confianca: confiancaNivel,
          isSeed: false,
        },
      });
      criados += 1;
      continue;
    }

    const dadosNovos: { telefone?: string; email?: string; fonte?: string; confianca?: number } = {};
    if (!existente.fonte && linha.fonte) dadosNovos.fonte = linha.fonte;
    if (existente.confianca == null && confiancaNivel != null) dadosNovos.confianca = confiancaNivel;
    if (!existente.telefone && linha.telefone) dadosNovos.telefone = linha.telefone;
    if (!existente.email && linha.email) dadosNovos.email = linha.email;

    if (Object.keys(dadosNovos).length === 0) {
      semNadaNovo += 1;
      continue;
    }

    await prisma.pontoFocal.update({
      where: { id: existente.id },
      data: dadosNovos,
    });
    atualizados += 1;
  }

  console.log("\n=== Resumo do enriquecimento ===");
  console.log(`Municípios sem correspondência na base: ${semCorrespondencia}`);
  if (naoEncontrados.length > 0) {
    console.log("Sem correspondência:", naoEncontrados.join(", "));
  }
  console.log(`Linhas com cargo inválido (ignoradas): ${semCargoValido}`);
  console.log(`Contatos atualizados (telefone/e-mail preenchido): ${atualizados}`);
  console.log(`Contatos novos criados: ${criados}`);
  console.log(`Sem nada de novo pra adicionar: ${semNadaNovo}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
