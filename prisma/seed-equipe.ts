/**
 * Cria a equipe inicial da Central de Atas (14/11/2026): as pessoas do workflow, cada uma com as
 * permissões da sua atividade, todas com a MESMA senha inicial. A senha é PROVISÓRIA: no primeiro
 * acesso a pessoa é obrigada a trocá-la (/trocar-senha) por uma que cumpra a política do sistema
 * (12 caracteres ou mais), e só então entra.
 *
 * Roda depois do primeiro administrador (npm run seed:admin). Serve para banco novo e para
 * repetir: conta que já existe não é mexida, a não ser com REDEFINIR=sim (aí a senha volta a ser a
 * provisória, a troca volta a ser obrigatória e as sessões abertas caem).
 *
 * A lista de pessoas (e-mails reais) e a senha NÃO ficam no repositório: vêm de fora.
 *
 * Uso:
 *   EQUIPE_ARQUIVO=/caminho/equipe-inicial.json SENHA_PROVISORIA='...' npm run seed:equipe
 *   (acrescente REDEFINIR=sim para refazer a senha de quem já existe)
 *
 * Formato do arquivo: veja prisma/equipe-inicial.exemplo.json.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { lerEquipeInicial } from "../src/lib/equipe-inicial";
import { validarSenhaNova } from "../src/lib/senha";

const prisma = new PrismaClient();
const ATOR = "script:seed-equipe";

async function main() {
  const arquivo = process.env.EQUIPE_ARQUIVO;
  const senha = process.env.SENHA_PROVISORIA;
  const redefinir = process.env.REDEFINIR === "sim";

  if (!arquivo || !senha) {
    console.error("Defina EQUIPE_ARQUIVO (caminho do JSON da equipe) e SENHA_PROVISORIA (a senha inicial de todos).");
    process.exit(1);
  }

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(arquivo, "utf8"));
  } catch (erro) {
    console.error(`Não consegui ler ${arquivo}: ${erro instanceof Error ? erro.message : erro}`);
    process.exit(1);
  }

  const { contas, problemas } = lerEquipeInicial(json);
  if (problemas.length > 0) {
    console.error("O arquivo da equipe tem problemas, e nada foi criado:\n" + problemas.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }

  // A senha provisória pode ser curta: ela só vale até o primeiro acesso, quando a pessoa a troca por
  // uma que cumpre a política. Avisa, mas segue.
  const fraca = validarSenhaNova(senha, "x@x.x");
  if (fraca) {
    console.warn(`Atenção: a senha provisória não cumpriria a política de senha nova (${fraca}) Tudo bem enquanto for provisória:\n  nenhuma conta funciona de verdade até a pessoa trocar a senha. Entregue-a só às pessoas da equipe.`);
  }

  const senhaHash = await bcrypt.hash(senha, 12);
  const resumo: string[] = [];

  for (const c of contas) {
    const existente =
      c.tipo === "equipe"
        ? await prisma.admin.findUnique({ where: { email: c.email }, select: { id: true } })
        : await prisma.vendedor.findUnique({ where: { email: c.email }, select: { id: true } });

    if (existente && !redefinir) {
      // Conta que já existe não é alterada, a não ser para completar o celular que ainda não tinha.
      if (c.telefone) {
        const alvo =
          c.tipo === "equipe"
            ? await prisma.admin.updateMany({ where: { id: existente.id, telefone: null }, data: { telefone: c.telefone } })
            : await prisma.vendedor.updateMany({ where: { id: existente.id, telefone: null }, data: { telefone: c.telefone } });
        resumo.push(`${c.email}: já existia${alvo.count > 0 ? " (completei o celular)" : " (não mexi)"}`);
      } else {
        resumo.push(`${c.email}: já existia (não mexi)`);
      }
      continue;
    }

    let id: string;
    if (c.tipo === "equipe") {
      const dados = { nome: c.nome, cargo: c.cargo, permissoes: c.permissoes, ...(c.telefone ? { telefone: c.telefone } : {}) };
      const salvo = existente
        ? await prisma.admin.update({
            where: { id: existente.id },
            data: { ...dados, senhaHash, senhaProvisoria: true, ativo: true, sessaoVersao: { increment: 1 } },
            select: { id: true },
          })
        : await prisma.admin.create({ data: { ...dados, email: c.email, senhaHash, senhaProvisoria: true }, select: { id: true } });
      id = salvo.id;
    } else {
      const salvo = existente
        ? await prisma.vendedor.update({
            where: { id: existente.id },
            data: { nome: c.nome, tipo: c.tipoVendedor, ...(c.telefone ? { telefone: c.telefone } : {}), senhaHash, senhaProvisoria: true, ativo: true, sessaoVersao: { increment: 1 } },
            select: { id: true },
          })
        : await prisma.vendedor.create({
            data: { nome: c.nome, email: c.email, tipo: c.tipoVendedor, telefone: c.telefone, senhaHash, senhaProvisoria: true },
            select: { id: true },
          });
      id = salvo.id;
    }

    await prisma.logAuditoria.create({
      data: {
        ator: ATOR,
        acao: existente ? "equipe.redefinida" : c.tipo === "equipe" ? "admin.criarMembroEquipe" : "admin.criarVendedorAdmin",
        alvo: id,
        detalhe:
          c.tipo === "equipe"
            ? `cargo ${c.cargo ?? "—"}; permissões: ${c.permissoes.join(", ")}; senha provisória, a trocar no primeiro acesso`
            : `consultor ${c.tipoVendedor}; senha provisória, a trocar no primeiro acesso`,
      },
    });
    resumo.push(`${c.email}: ${existente ? "redefinida" : "criada"} (${c.tipo === "equipe" ? "equipe interna" : "consultor"})`);
  }

  console.log(resumo.join("\n"));
  console.log("\nTodas as contas criadas ou redefinidas têm a senha provisória e exigem a troca no primeiro acesso.");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
