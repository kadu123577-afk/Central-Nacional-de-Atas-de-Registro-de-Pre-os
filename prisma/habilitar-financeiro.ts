/**
 * Liga ou desliga o acesso de um admin ao financeiro da SCP (Admin.acessoFinanceiro).
 * Ninguém tem esse acesso por padrão e não existe tela para concedê-lo: só este
 * script, rodado no servidor com acesso ao banco, e cada mudança fica na auditoria.
 * O acesso também exige 2FA ativo (src/lib/acesso-financeiro.ts): quem for
 * habilitado sem 2FA precisa ativá-lo em /admin/perfil antes de entrar.
 *
 * Uso (liga):    ADMIN_EMAIL=voce@empresa.com.br ACAO=on  npx tsx prisma/habilitar-financeiro.ts
 * Uso (desliga): ADMIN_EMAIL=voce@empresa.com.br ACAO=off npx tsx prisma/habilitar-financeiro.ts
 * Ou:            npm run admin:financeiro (com as mesmas variáveis no ambiente)
 *
 * Revogar vale na hora: a trava lê a flag do banco a cada acesso.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const acao = process.env.ACAO?.trim().toLowerCase();
  if (!email || (acao !== "on" && acao !== "off")) {
    console.error("Defina ADMIN_EMAIL e ACAO=on (liga) ou ACAO=off (desliga).");
    process.exit(1);
  }
  const ligar = acao === "on";

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) {
    console.error("Admin não encontrado.");
    process.exit(1);
  }

  // Auditoria só quando muda de fato.
  if (admin.acessoFinanceiro === ligar) {
    console.log(`Nada a fazer: ${admin.email} já está ${ligar ? "com" : "sem"} acesso ao financeiro.`);
    return;
  }

  await prisma.$transaction([
    prisma.admin.update({ where: { id: admin.id }, data: { acessoFinanceiro: ligar } }),
    prisma.logAuditoria.create({
      data: {
        ator: "script",
        acao: ligar ? "financeiro.acesso_habilitado" : "financeiro.acesso_revogado",
        alvo: `admin:${admin.id}`,
      },
    }),
  ]);

  if (ligar) {
    console.log(`Acesso ao financeiro HABILITADO para ${admin.email}.`);
    if (!admin.totpAtivo) {
      console.log(
        "Atenção: este admin ainda não ativou o 2FA. Sem ele o acesso fica bloqueado; peça para ativar em /admin/perfil.",
      );
    }
  } else {
    console.log(`Acesso ao financeiro REVOGADO para ${admin.email}.`);
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
