/**
 * Cria (ou atualiza a senha de) o primeiro usuário administrador.
 * Não existe cadastro público de admin por segurança — só este script.
 *
 * Uso: ADMIN_EMAIL=voce@tech10.com.br ADMIN_SENHA=algosecreto npx tsx prisma/seed-admin.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const senha = process.env.ADMIN_SENHA;
  const nome = process.env.ADMIN_NOME ?? "Administrador";

  if (!email || !senha || senha.length < 8) {
    console.error(
      "Defina ADMIN_EMAIL e ADMIN_SENHA (mín. 8 caracteres) nas variáveis de ambiente.",
    );
    process.exit(1);
  }

  const senhaHash = await bcrypt.hash(senha, 12);
  const admin = await prisma.admin.upsert({
    where: { email },
    update: { senhaHash, nome },
    create: { email, senhaHash, nome },
  });

  console.log(`Admin pronto: ${admin.email} (id ${admin.id})`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
