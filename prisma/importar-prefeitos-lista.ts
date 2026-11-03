/**
 * Importação da lista de prefeitos eleitos 2025-2028 (2026-11-03) — lê o JSON gerado por
 * scripts/coleta/prefeitos-lista.mjs (que converte o PDF "Relação de prefeitos eleitos",
 * atualizada em 28/10/2024) e cria o `PontoFocal` do prefeito(a) em cada `EntidadeAlvo`
 * municipal, casando pelo código IBGE.
 *
 * O JSON já vem sem CPF, data de nascimento e dados de cônjuge (minimização, LGPD); este
 * script só lê nome, partido, telefone da prefeitura, celular e e-mail.
 *
 * Regras:
 *  - Sem `--aplicar` é só simulação: mostra o que faria e não grava nada.
 *  - Nunca sobrescreve dado existente. Se já há um prefeito(a) com o mesmo nome, só completa
 *    telefone/e-mail que estiverem vazios. Se o nome for outro, NÃO cria nem altera: lista a
 *    divergência para revisão humana (o contato antigo pode estar certo e a lista de 2024
 *    desatualizada, ou o contrário).
 *  - Contato novo entra com confiança 2 (fonte oficial, mas de 2024) e sem `verificadoEm`.
 *
 *  - Com `--criar-municipios`, os municípios da lista que ainda não estão na base (fora dos
 *    1.073 alvos por faixa de população) são cadastrados como `EntidadeAlvo` municipal.
 *
 * Rodar com: npx tsx --env-file=.env prisma/importar-prefeitos-lista.ts <caminho-do-json> [--criar-municipios] [--aplicar]
 */
import fs from "fs";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

interface PrefeitoLista {
  municipio: string;
  uf: string;
  reeleito: boolean;
  nomeUrna: string | null;
  nomeCompleto: string | null;
  telefonePrefeitura: string | null;
  celular: string | null;
  email: string | null;
  partido: string | null;
  ibge: string | null;
}

interface ArquivoLista {
  fonte: string;
  atualizadaEm: string;
  prefeitos: PrefeitoLista[];
}

const CARGO = "Prefeito(a)";
const AREA = "Gabinete do Prefeito";
const FONTE = "Relação de prefeitos eleitos 2025-2028 (atualizada em 28/10/2024)";
const CONFIANCA = 2;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Mesmo prefeito se um nome contém o outro (nome de urna x nome completo) ou se compartilham
// pelo menos o primeiro e o último nome.
function mesmaPessoa(a: string, b: string): boolean {
  const x = normalizar(a);
  const y = normalizar(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const px = x.split(" ");
  const py = y.split(" ");
  return px[0] === py[0] && px[px.length - 1] === py[py.length - 1];
}

async function main() {
  const caminho = process.argv[2];
  const aplicar = process.argv.includes("--aplicar");
  const criarMunicipios = process.argv.includes("--criar-municipios");
  if (!caminho) {
    console.error("Uso: npx tsx prisma/importar-prefeitos-lista.ts <caminho-do-json> [--criar-municipios] [--aplicar]");
    process.exit(1);
  }
  const arquivo = JSON.parse(fs.readFileSync(caminho, "utf8")) as ArquivoLista;
  const doAlvo = arquivo.prefeitos.filter((p) => p.ibge);
  console.log(`${arquivo.prefeitos.length} prefeitos na lista; ${doAlvo.length} em municípios-alvo (com IBGE).`);
  console.log(aplicar ? "MODO APLICAR: gravando no banco." : "SIMULAÇÃO: nada será gravado (use --aplicar).");

  const entidades = await prisma.entidadeAlvo.findMany({
    where: { tipo: "municipal", codigoIbgeMunicipio: { in: doAlvo.map((p) => p.ibge as string) } },
    select: { id: true, codigoIbgeMunicipio: true, contatos: { where: { cargo: CARGO, ativo: true }, select: { id: true, nomeContato: true, telefone: true, email: true } } },
  });
  type EntidadeComContatos = (typeof entidades)[number];
  const porIbge = new Map<string, EntidadeComContatos>(entidades.map((e) => [e.codigoIbgeMunicipio as string, e]));

  let municipiosCriados = 0;
  let criados = 0;
  let completados = 0;
  let iguaisSemMudanca = 0;
  const semEntidade: string[] = [];
  const divergencias: string[] = [];

  for (const p of doAlvo) {
    const nome = p.nomeCompleto ?? p.nomeUrna;
    let ent = porIbge.get(p.ibge as string);
    if (!nome) continue;
    if (!ent) {
      if (!criarMunicipios) {
        semEntidade.push(`${p.uf}/${p.municipio}`);
        continue;
      }
      // Município fora dos 1.073 alvos: entra na base como os demais (ver seed-municipios-alvo.ts),
      // sem contato além do prefeito, sem CNPJ e sem raio-X (o enriquecimento de CNPJ roda depois).
      const nova = aplicar
        ? await prisma.entidadeAlvo.create({
            data: {
              nome: `Prefeitura de ${p.municipio}`,
              tipo: "municipal",
              esfera: "municipal",
              uf: p.uf,
              municipio: p.municipio,
              codigoIbgeMunicipio: p.ibge as string,
            },
            select: { id: true },
          })
        : { id: "(novo)" };
      ent = { id: nova.id, codigoIbgeMunicipio: p.ibge as string, contatos: [] };
      municipiosCriados += 1;
    }

    const telefone = p.telefonePrefeitura;
    const particularidades = [
      p.partido ? `Partido: ${p.partido}.` : null,
      p.reeleito ? "Reeleito(a) em 2024." : null,
      p.nomeUrna && p.nomeUrna !== nome ? `Nome de urna: ${p.nomeUrna}.` : null,
      p.celular ? `Celular: ${p.celular}.` : null,
      `Fonte: ${FONTE}. Confirmar se continua no cargo antes de usar.`,
    ]
      .filter(Boolean)
      .join(" ");

    if (ent.contatos.length === 0) {
      if (aplicar) {
        await prisma.pontoFocal.create({
          data: {
            entidadeAlvoId: ent.id,
            cargo: CARGO,
            area: AREA,
            nomeContato: nome,
            telefone,
            email: p.email,
            particularidades,
            fonte: FONTE,
            confianca: CONFIANCA,
            isSeed: false,
          },
        });
      }
      criados += 1;
      continue;
    }

    const igual = ent.contatos.find((c) => mesmaPessoa(c.nomeContato, nome) || (p.nomeUrna ? mesmaPessoa(c.nomeContato, p.nomeUrna) : false));
    if (!igual) {
      divergencias.push(`${p.uf}/${p.municipio}: banco tem "${ent.contatos.map((c) => c.nomeContato).join('", "')}", lista traz "${nome}"`);
      continue;
    }
    const dados: { telefone?: string; email?: string } = {};
    if (!igual.telefone && telefone) dados.telefone = telefone;
    if (!igual.email && p.email) dados.email = p.email;
    if (Object.keys(dados).length === 0) {
      iguaisSemMudanca += 1;
      continue;
    }
    if (aplicar) await prisma.pontoFocal.update({ where: { id: igual.id }, data: dados });
    completados += 1;
  }

  console.log("\n=== Resumo ===");
  console.log(`Municípios novos na base ${aplicar ? "criados" : "a criar"}: ${municipiosCriados}${criarMunicipios ? "" : " (use --criar-municipios para cadastrar os que não estão na base)"}`);
  console.log(`Prefeitos novos ${aplicar ? "criados" : "a criar"}: ${criados}`);
  console.log(`Prefeitos já cadastrados, telefone/e-mail ${aplicar ? "completados" : "a completar"}: ${completados}`);
  console.log(`Já cadastrados e completos (sem mudança): ${iguaisSemMudanca}`);
  console.log(`Municípios da lista sem entidade na base: ${semEntidade.length}${semEntidade.length ? " — " + semEntidade.join(", ") : ""}`);
  console.log(`Divergências de nome (nada foi alterado; revisar): ${divergencias.length}`);
  for (const d of divergencias) console.log(`  - ${d}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
