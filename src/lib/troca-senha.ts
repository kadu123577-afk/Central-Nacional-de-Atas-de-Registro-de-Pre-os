import { adminIdLogadoParaTrocarSenha, vendedorIdLogadoParaTrocarSenha } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface ContaParaTrocarSenha {
  tipo: "admin" | "vendedor";
  id: string;
  email: string;
  senhaHash: string;
  provisoria: boolean;
}

/**
 * Conta logada que pode usar /trocar-senha (2026-11-14): admin ou vendedor, inclusive
 * com a senha provisória, que é o caso de uso. Com as duas sessões abertas, vale a que
 * ainda está com senha provisória. Sem sessão, null.
 */
export async function contaParaTrocarSenha(): Promise<ContaParaTrocarSenha | null> {
  const [adminId, vendedorId] = await Promise.all([adminIdLogadoParaTrocarSenha(), vendedorIdLogadoParaTrocarSenha()]);
  const contas: ContaParaTrocarSenha[] = [];

  if (adminId) {
    const a = await prisma.admin.findUnique({
      where: { id: adminId },
      select: { email: true, senhaHash: true, senhaProvisoria: true },
    });
    if (a) contas.push({ tipo: "admin", id: adminId, email: a.email, senhaHash: a.senhaHash, provisoria: a.senhaProvisoria });
  }
  if (vendedorId) {
    const v = await prisma.vendedor.findUnique({
      where: { id: vendedorId },
      select: { email: true, senhaHash: true, senhaProvisoria: true },
    });
    if (v) contas.push({ tipo: "vendedor", id: vendedorId, email: v.email, senhaHash: v.senhaHash, provisoria: v.senhaProvisoria });
  }

  return contas.find((c) => c.provisoria) ?? contas[0] ?? null;
}

export function destinoDaConta(tipo: "admin" | "vendedor"): string {
  return tipo === "admin" ? "/admin" : "/vendedor";
}
