import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { prisma } from "@/lib/prisma";

/**
 * Trava de acesso ao financeiro da SCP (2026-10-26, Projeto RNA etapa 7).
 * Toda página e toda ação do financeiro chama exigirAcessoFinanceiro() ANTES
 * de ler a entrada ou o banco do financeiro. Ser administrador não basta: o
 * acesso é a flag Admin.acessoFinanceiro, que ninguém tem por padrão e só se
 * liga por script, direto no servidor (prisma/habilitar-financeiro.ts, npm run
 * admin:financeiro), deixando registro na auditoria.
 *
 * Ordem das checagens:
 * 1. Sem sessão de admin: vai para /entrar (como as demais áreas).
 * 2. Admin sem a flag: registra "financeiro.acesso_negado" e responde 404
 *    (notFound), de modo que quem não tem acesso não descobre que a área existe.
 *    A flag é lida do banco a cada chamada: revogar vale na hora, sem esperar
 *    a sessão expirar.
 * 3. 2FA OBRIGATÓRIO: o admin com a flag precisa ter o 2FA ativo (Admin.totpAtivo).
 *    Sem 2FA, registra "financeiro.acesso_negado" e leva à tela de perfil para
 *    ativar. Quem tem 2FA ativo só entra com o código no login (a action de login
 *    exige), e a desativação por script derruba as sessões; então, nesta checagem,
 *    totpAtivo = true significa que o segundo fator está em uso. Quem acabou de
 *    ativar o 2FA na sessão já provou ter o app autenticador ao confirmá-lo.
 *    Como a área já se revelou a quem tem a flag, aqui o destino é o perfil, não 404.
 * 4. Registra "financeiro.visualizou" no máximo uma vez por hora por admin, para
 *    a trilha mostrar quem olhou o financeiro sem encher o log a cada clique.
 *
 * A auditoria é "melhor esforço" (src/lib/auditoria.ts): falha ao gravar o log
 * nunca derruba a página. Não entra dado financeiro nenhum no log.
 *
 * Onde chamar: no topo do page.tsx (e de cada server action), com await, ANTES
 * de qualquer <Suspense> ou loading.tsx que já tenha começado a enviar a página.
 * O notFound() depois do início do streaming mostra a tela de 404, mas a resposta
 * já saiu com status 200 (documentação do Next, "notFound"). Também não coloque
 * link para o financeiro no menu de quem não tem a flag.
 */

export const ACAO_FINANCEIRO_ACESSO_NEGADO = "financeiro.acesso_negado";
export const ACAO_FINANCEIRO_VISUALIZOU = "financeiro.visualizou";

/** Janela em que "financeiro.visualizou" é registrado uma única vez por admin. */
export const JANELA_VISUALIZACAO_MS = 60 * 60 * 1000;

/** Para onde vai quem tem a flag mas ainda não ativou o 2FA. */
export const CAMINHO_ATIVAR_2FA = "/admin/perfil";

/**
 * Garante que o admin logado pode ver e editar o financeiro da SCP e devolve o
 * id dele. Nunca retorna sem acesso: redireciona ou responde 404 (ambos lançam).
 */
export async function exigirAcessoFinanceiro(): Promise<string> {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/entrar");

  const ator = `admin:${adminId}`;
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { acessoFinanceiro: true, totpAtivo: true },
  });

  if (!admin?.acessoFinanceiro) {
    await registrarAuditoria({ ator, acao: ACAO_FINANCEIRO_ACESSO_NEGADO, detalhe: "sem permissão" });
    notFound();
  }

  if (!admin.totpAtivo) {
    await registrarAuditoria({ ator, acao: ACAO_FINANCEIRO_ACESSO_NEGADO, detalhe: "2FA não ativado" });
    redirect(CAMINHO_ATIVAR_2FA);
  }

  await registrarVisualizacaoUmaPorHora(ator);
  return adminId;
}

async function registrarVisualizacaoUmaPorHora(ator: string): Promise<void> {
  try {
    const recente = await prisma.logAuditoria.findFirst({
      where: {
        ator,
        acao: ACAO_FINANCEIRO_VISUALIZOU,
        criadoEm: { gte: new Date(Date.now() - JANELA_VISUALIZACAO_MS) },
      },
      select: { id: true },
    });
    if (!recente) await registrarAuditoria({ ator, acao: ACAO_FINANCEIRO_VISUALIZOU });
  } catch (erro) {
    // Mesma regra da auditoria: o log é melhor esforço e não derruba o acesso.
    console.error("Falha ao conferir a auditoria de visualização do financeiro:", erro);
  }
}
