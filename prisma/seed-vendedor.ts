/**
 * Cria (ou atualiza a senha de) um usuário vendedor.
 * Não existe cadastro público de vendedor por segurança — só este script.
 *
 * Uso: VENDEDOR_EMAIL=voce@tech10.com.br VENDEDOR_SENHA=algosecreto VENDEDOR_NOME="Seu Nome" npx tsx prisma/seed-vendedor.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.VENDEDOR_EMAIL;
  const senha = process.env.VENDEDOR_SENHA;
  const nome = process.env.VENDEDOR_NOME ?? "Vendedor";

  if (!email || !senha || senha.length < 8) {
    console.error(
      "Defina VENDEDOR_EMAIL e VENDEDOR_SENHA (mín. 8 caracteres) nas variáveis de ambiente.",
    );
    process.exit(1);
  }

  const senhaHash = await bcrypt.hash(senha, 12);
  const vendedor = await prisma.vendedor.upsert({
    where: { email },
    update: { senhaHash, nome },
    create: { email, senhaHash, nome },
  });

  console.log(`Vendedor pronto: ${vendedor.email} (id ${vendedor.id})`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
