/**
 * Desativa o 2FA de um admin que perdeu o acesso ao app autenticador.
 * Rode no servidor, com acesso ao banco — é o único caminho de recuperação
 * (o painel exige o código para desativar). Fica registrado na auditoria.
 *
 * Uso: ADMIN_EMAIL=voce@empresa.com.br npx tsx prisma/reset-admin-2fa.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) {
    console.error("Defina ADMIN_EMAIL.");
    process.exit(1);
  }

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) {
    console.error("Admin não encontrado.");
    process.exit(1);
  }

  await prisma.$transaction([
    prisma.admin.update({
      where: { id: admin.id },
      data: {
        totpAtivo: false,
        totpSegredo: null,
        totpUltimoPasso: null,
        // derruba as sessões abertas dessa conta
        sessaoVersao: { increment: 1 },
      },
    }),
    prisma.logAuditoria.create({
      data: { ator: "script", acao: "admin.2fa_resetado_por_script", alvo: `admin:${admin.id}` },
    }),
  ]);

  console.log(`2FA desativado para ${admin.email}. Peça para ativar de novo em /admin/perfil.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());