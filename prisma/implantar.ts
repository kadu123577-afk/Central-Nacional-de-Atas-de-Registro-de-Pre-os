/**
 * Implantação em um comando só (16/11/2026): cria as tabelas, o primeiro administrador e a equipe, a
 * partir de variáveis de ambiente. As senhas e a lista da equipe NÃO ficam no git (o repositório é
 * público): vêm do arquivo de variáveis que a coordenação entrega a quem implanta.
 *
 * Faz, nesta ordem, só o que as variáveis pedem:
 *   1. tabelas (prisma migrate deploy), sempre;
 *   2. o primeiro administrador, se houver ADMIN_EMAIL e ADMIN_SENHA;
 *   3. a equipe, se houver EQUIPE_JSON (ou EQUIPE_ARQUIVO) e SENHA_PROVISORIA.
 * É seguro repetir: conta que já existe não é alterada. Não imprime senha nenhuma.
 *
 * Rodar com o arquivo de variáveis (a DATABASE_URL dele deve ser a do Session pooler, porta 5432):
 *   npx tsx --env-file=variaveis-de-producao.env prisma/implantar.ts
 * Ou, com as variáveis já no ambiente:  npm run implantar
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lerJsonDaEquipe, planejarImplantacao } from "../src/lib/implantacao";

const WINDOWS = process.platform === "win32";

function rodar(comando: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  execFileSync(comando, args, { stdio: "inherit", env, shell: WINDOWS });
}

function main() {
  const plano = planejarImplantacao(process.env);

  for (const aviso of plano.avisos) console.warn(`Aviso: ${aviso}`);
  if (plano.erros.length > 0) {
    console.error("Não deu para implantar:\n" + plano.erros.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }

  console.log("1/3 Criando as tabelas (só aplica o que falta)...");
  rodar("npx", ["prisma", "migrate", "deploy"]);

  if (plano.passos.includes("administrador")) {
    console.log("2/3 Criando o primeiro administrador...");
    rodar("npx", ["tsx", "prisma/seed-admin.ts"]);
  } else {
    console.log("2/3 Primeiro administrador: nada a fazer (sem ADMIN_EMAIL e ADMIN_SENHA).");
  }

  if (plano.passos.includes("equipe")) {
    console.log(`3/3 Criando a equipe${plano.pessoasDaEquipe > 0 ? ` (${plano.pessoasDaEquipe} pessoa(s))` : ""}...`);
    if (process.env.EQUIPE_JSON && process.env.EQUIPE_JSON.trim() !== "") {
      // O script da equipe lê um arquivo: escreve o JSON num arquivo temporário e apaga no fim.
      const pasta = mkdtempSync(join(tmpdir(), "equipe-"));
      const arquivo = join(pasta, "equipe-inicial.json");
      try {
        writeFileSync(arquivo, JSON.stringify(lerJsonDaEquipe(process.env.EQUIPE_JSON)), { mode: 0o600 });
        rodar("npx", ["tsx", "prisma/seed-equipe.ts"], { ...process.env, EQUIPE_ARQUIVO: arquivo });
      } finally {
        rmSync(pasta, { recursive: true, force: true });
      }
    } else {
      rodar("npx", ["tsx", "prisma/seed-equipe.ts"]);
    }
  } else {
    console.log("3/3 Equipe: nada a fazer (sem EQUIPE_JSON e SENHA_PROVISORIA).");
  }

  console.log("\nPronto. Entre em /entrar com o e-mail e a senha do administrador. A equipe troca a senha no primeiro acesso.");
}

main();
