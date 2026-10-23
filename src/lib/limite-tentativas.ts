import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Limite de tentativas de login e cadastro (2026-10-20), guardado no banco
 * para valer igualmente em várias instâncias do servidor.
 *
 * Duas chaves por tentativa: uma por conta (e-mail) e uma por IP. A por
 * conta protege uma pessoa específica; a por IP freia quem testa muitas
 * contas de uma só origem. O IP vem do cabeçalho x-forwarded-for, que só é
 * confiável atrás de um proxy que o reescreva (Vercel, Caddy, Nginx) — não
 * exponha o Node direto na internet.
 */

interface Politica {
  maxTentativas: number;
  janelaMs: number;
  bloqueioMs: number;
}

const MINUTO = 60 * 1000;

export const POLITICA_CONTA: Politica = {
  maxTentativas: 5,
  janelaMs: 15 * MINUTO,
  bloqueioMs: 15 * MINUTO,
};
export const POLITICA_IP: Politica = {
  maxTentativas: 30,
  janelaMs: 15 * MINUTO,
  bloqueioMs: 15 * MINUTO,
};
export const POLITICA_CADASTRO_IP: Politica = {
  maxTentativas: 10,
  janelaMs: 60 * MINUTO,
  bloqueioMs: 60 * MINUTO,
};

export async function ipDaRequisicao(): Promise<string> {
  const cabecalhos = await headers();
  const encaminhado = cabecalhos.get("x-forwarded-for");
  if (encaminhado) {
    // O primeiro da lista é o cliente; os seguintes são proxies.
    const primeiro = encaminhado.split(",")[0]?.trim();
    if (primeiro) return primeiro.slice(0, 64);
  }
  return (cabecalhos.get("x-real-ip") ?? "desconhecido").slice(0, 64);
}

function minutosRestantes(ate: Date): number {
  return Math.max(1, Math.ceil((ate.getTime() - Date.now()) / MINUTO));
}

export function mensagemBloqueio(ate: Date): string {
  return `Muitas tentativas. Tente novamente em ${minutosRestantes(ate)} minuto(s).`;
}

/** Retorna até quando a chave está bloqueada, ou null se está liberada. */
export async function bloqueadoAte(chave: string): Promise<Date | null> {
  const linha = await prisma.tentativaLogin.findUnique({ where: { chave } });
  if (linha?.bloqueadoAte && linha.bloqueadoAte.getTime() > Date.now()) {
    return linha.bloqueadoAte;
  }
  return null;
}

export async function registrarFalha(chave: string, politica: Politica): Promise<void> {
  const agora = new Date();
  const linha = await prisma.tentativaLogin.findUnique({ where: { chave } });

  const janelaExpirou =
    !linha || agora.getTime() - linha.janelaInicio.getTime() > politica.janelaMs;
  const tentativas = janelaExpirou ? 1 : linha.tentativas + 1;
  const bloquear = tentativas >= politica.maxTentativas;

  await prisma.tentativaLogin.upsert({
    where: { chave },
    create: {
      chave,
      tentativas,
      janelaInicio: agora,
      bloqueadoAte: bloquear ? new Date(agora.getTime() + politica.bloqueioMs) : null,
    },
    update: {
      tentativas,
      ...(janelaExpirou ? { janelaInicio: agora } : {}),
      bloqueadoAte: bloquear ? new Date(agora.getTime() + politica.bloqueioMs) : null,
    },
  });
}

export async function limparFalhas(chave: string): Promise<void> {
  await prisma.tentativaLogin.deleteMany({ where: { chave } });
}

function chaveConta(tipo: string, email: string): string {
  return `login:${tipo}:${email.trim().toLowerCase()}`;
}
function chaveIp(ip: string): string {
  return `login-ip:${ip}`;
}

/** Antes de conferir a senha: mensagem de erro se conta ou IP estão bloqueados. */
export async function checarBloqueioLogin(tipo: string, email: string): Promise<string | null> {
  const ip = await ipDaRequisicao();
  const [conta, porIp] = await Promise.all([
    bloqueadoAte(chaveConta(tipo, email)),
    bloqueadoAte(chaveIp(ip)),
  ]);
  const ate = conta ?? porIp;
  return ate ? mensagemBloqueio(ate) : null;
}

export async function registrarFalhaLogin(tipo: string, email: string): Promise<void> {
  const ip = await ipDaRequisicao();
  await Promise.all([
    registrarFalha(chaveConta(tipo, email), POLITICA_CONTA),
    registrarFalha(chaveIp(ip), POLITICA_IP),
  ]);
}

export async function registrarSucessoLogin(tipo: string, email: string): Promise<void> {
  await limparFalhas(chaveConta(tipo, email));
}

/**
 * Versões para a entrada única (/entrar), quando o mesmo e-mail pode ter
 * conta em mais de um perfil e a senha é conferida contra todas de uma vez.
 * Cada conta mantém a SUA chave (a mesma que o login do perfil usa, então o
 * limite de 5 falhas por conta não se multiplica por mais um caminho), e o IP
 * conta uma falha só por envio, não uma por perfil.
 */
export async function checarBloqueioLoginContas(
  tipos: string[],
  email: string,
): Promise<string | null> {
  const ip = await ipDaRequisicao();
  const bloqueios = await Promise.all([
    ...tipos.map((tipo) => bloqueadoAte(chaveConta(tipo, email))),
    bloqueadoAte(chaveIp(ip)),
  ]);
  const ate = bloqueios.reduce<Date | null>(
    (maior, atual) => (atual && (!maior || atual > maior) ? atual : maior),
    null,
  );
  return ate ? mensagemBloqueio(ate) : null;
}

export async function registrarFalhaLoginContas(tipos: string[], email: string): Promise<void> {
  const ip = await ipDaRequisicao();
  await Promise.all([
    ...tipos.map((tipo) => registrarFalha(chaveConta(tipo, email), POLITICA_CONTA)),
    registrarFalha(chaveIp(ip), POLITICA_IP),
  ]);
}

/** Limite por IP para telas de cadastro público (freia criação em massa). */
export async function checarLimiteCadastro(): Promise<string | null> {
  const ip = await ipDaRequisicao();
  const chave = `cadastro-ip:${ip}`;
  const ate = await bloqueadoAte(chave);
  if (ate) return mensagemBloqueio(ate);
  await registrarFalha(chave, POLITICA_CADASTRO_IP);
  return null;
}
