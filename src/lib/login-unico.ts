import { prisma } from "@/lib/prisma";

/**
 * Apoio da entrada única (/entrar): descobrir em quais perfis um e-mail tem
 * conta. Só leitura, e só roda no servidor, depois do limite de tentativas.
 * A senha, a sessão, o 2FA, a auditoria e o limite de cada perfil continuam
 * nas actions de login do próprio perfil; aqui só se escolhe qual chamar.
 */

export type PerfilEntrada = "admin" | "vendedor" | "fornecedor" | "orgao";

/** Ordem em que os perfis são tentados e listados. */
export const PERFIS_ENTRADA: readonly PerfilEntrada[] = ["admin", "vendedor", "fornecedor", "orgao"];

/** Só aparecem na tela depois de a senha conferir (vêm na resposta da action). */
export const ROTULO_PERFIL: Record<PerfilEntrada, string> = {
  admin: "Administração",
  vendedor: "Consultor",
  fornecedor: "Fornecedor",
  orgao: "Órgão público",
};

/** Tipo da chave de limite para e-mail sem conta ativa (login:entrar:<e-mail>). */
export const TIPO_LIMITE_ENTRADA = "entrar";

/** A única mensagem para e-mail inexistente, senha errada, conta inativa ou sem acesso. */
export const MENSAGEM_ENTRADA_INVALIDA = "E-mail ou senha incorretos.";

/** Prefixo da mensagem de bloqueio de limite-tentativas.ts (igual para qualquer e-mail). */
const PREFIXO_BLOQUEIO = "Muitas tentativas.";

export function ehMensagemDeBloqueio(mensagem: string | undefined): boolean {
  return typeof mensagem === "string" && mensagem.startsWith(PREFIXO_BLOQUEIO);
}

export interface CandidatoEntrada {
  perfil: PerfilEntrada;
  id: string;
  /** O e-mail como está gravado, que é o que a action do perfil procura. */
  email: string;
  senhaHash: string;
}

/** Minúsculo, sem espaços nas pontas e com limite de tamanho (a chave do limite usa o texto). */
export function normalizarEmailEntrada(valor: FormDataEntryValue | null): string {
  return String(valor ?? "").trim().toLowerCase().slice(0, 254);
}

export function perfilEntradaDe(valor: FormDataEntryValue | null): PerfilEntrada | null {
  return PERFIS_ENTRADA.find((perfil) => perfil === valor) ?? null;
}

/**
 * Contas que podem entrar com este e-mail: só ativas onde existe o campo
 * `ativo`, e só com senha definida. Conta desativada, sem senha ou inexistente
 * não aparece, e quem chama trata os três do mesmo jeito.
 */
export async function buscarCandidatosEntrada(email: string): Promise<CandidatoEntrada[]> {
  const igual = { equals: email, mode: "insensitive" as const };
  const campos = { id: true, email: true, senhaHash: true } as const;

  const [admin, vendedor, fornecedor, orgao] = await Promise.all([
    prisma.admin.findFirst({ where: { email: igual }, select: campos }),
    prisma.vendedor.findFirst({ where: { email: igual, ativo: true }, select: campos }),
    prisma.fornecedor.findFirst({
      where: { email: igual, ativo: true, senhaHash: { not: null } },
      select: campos,
    }),
    prisma.orgao.findFirst({
      where: { email: igual, ativo: true, senhaHash: { not: null } },
      select: campos,
    }),
  ]);

  const candidatos: CandidatoEntrada[] = [];
  const achados = { admin, vendedor, fornecedor, orgao };
  for (const perfil of PERFIS_ENTRADA) {
    const conta = achados[perfil];
    if (conta?.email && conta.senhaHash) {
      candidatos.push({ perfil, id: conta.id, email: conta.email, senhaHash: conta.senhaHash });
    }
  }
  return candidatos;
}
