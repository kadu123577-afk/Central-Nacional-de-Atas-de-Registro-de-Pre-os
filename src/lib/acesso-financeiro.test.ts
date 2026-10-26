import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A trava do financeiro da SCP, testada sem banco nem Next: a sessão, o
 * Prisma, a auditoria e o redirect/notFound são trocados por dublês. O que se
 * confere é a ordem das checagens, o que é gravado na auditoria e que a área
 * nunca se revela a quem não tem acesso. Só ids e flags fictícios.
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  registrarAuditoria: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
  adminFindUnique: vi.fn(),
  logFindFirst: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: dobles.redirect, notFound: dobles.notFound }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: { findUnique: dobles.adminFindUnique },
    logAuditoria: { findFirst: dobles.logFindFirst },
  },
}));

import {
  ACAO_FINANCEIRO_ACESSO_NEGADO,
  ACAO_FINANCEIRO_VISUALIZOU,
  CAMINHO_ATIVAR_2FA,
  exigirAcessoFinanceiro,
  JANELA_VISUALIZACAO_MS,
} from "./acesso-financeiro";

const ID = "admin-teste-1";
const ATOR = `admin:${ID}`;

beforeEach(() => {
  vi.clearAllMocks();
  // Como no Next: redirect e notFound interrompem a execução lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.notFound.mockImplementation(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  });
  dobles.adminIdLogado.mockResolvedValue(ID);
  dobles.adminFindUnique.mockResolvedValue({ acessoFinanceiro: true, totpAtivo: true });
  dobles.logFindFirst.mockResolvedValue(null);
  dobles.registrarAuditoria.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("exigirAcessoFinanceiro", () => {
  it("sem sessão: vai para /entrar sem tocar no banco nem na auditoria", async () => {
    dobles.adminIdLogado.mockResolvedValue(null);

    await expect(exigirAcessoFinanceiro()).rejects.toThrow("NEXT_REDIRECT:/entrar");

    expect(dobles.adminFindUnique).not.toHaveBeenCalled();
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    expect(dobles.notFound).not.toHaveBeenCalled();
  });

  it("admin sem a flag: registra o acesso negado e responde 404 (a área não se revela)", async () => {
    dobles.adminFindUnique.mockResolvedValue({ acessoFinanceiro: false, totpAtivo: true });

    await expect(exigirAcessoFinanceiro()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");

    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: ATOR,
      acao: ACAO_FINANCEIRO_ACESSO_NEGADO,
      detalhe: "sem permissão",
    });
    // Nada de "visualizou", nem consulta de log, nem redirecionamento que revele a área.
    expect(dobles.logFindFirst).not.toHaveBeenCalled();
    expect(dobles.redirect).not.toHaveBeenCalled();
  });

  it("sem a flag, ter 2FA ativo ou não não muda nada: continua 404", async () => {
    dobles.adminFindUnique.mockResolvedValue({ acessoFinanceiro: false, totpAtivo: false });

    await expect(exigirAcessoFinanceiro()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(dobles.redirect).not.toHaveBeenCalled();
  });

  it("admin que sumiu do banco é tratado como sem acesso (404)", async () => {
    dobles.adminFindUnique.mockResolvedValue(null);

    await expect(exigirAcessoFinanceiro()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ acao: ACAO_FINANCEIRO_ACESSO_NEGADO }),
    );
  });

  it("com a flag mas sem 2FA ativo: registra o acesso negado e leva ao perfil para ativar o 2FA", async () => {
    dobles.adminFindUnique.mockResolvedValue({ acessoFinanceiro: true, totpAtivo: false });

    await expect(exigirAcessoFinanceiro()).rejects.toThrow(`NEXT_REDIRECT:${CAMINHO_ATIVAR_2FA}`);

    expect(CAMINHO_ATIVAR_2FA).toBe("/admin/perfil");
    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: ATOR,
      acao: ACAO_FINANCEIRO_ACESSO_NEGADO,
      detalhe: "2FA não ativado",
    });
    expect(dobles.notFound).not.toHaveBeenCalled();
    expect(dobles.logFindFirst).not.toHaveBeenCalled();
  });

  it("com a flag e o 2FA: devolve o id do admin e registra a visualização", async () => {
    await expect(exigirAcessoFinanceiro()).resolves.toBe(ID);

    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({ ator: ATOR, acao: ACAO_FINANCEIRO_VISUALIZOU });
    expect(dobles.redirect).not.toHaveBeenCalled();
    expect(dobles.notFound).not.toHaveBeenCalled();
  });

  it("lê do banco só as duas flags, do admin da sessão (nunca o hash da senha)", async () => {
    await exigirAcessoFinanceiro();

    expect(dobles.adminFindUnique).toHaveBeenCalledWith({
      where: { id: ID },
      select: { acessoFinanceiro: true, totpAtivo: true },
    });
  });

  it("a flag é lida a cada chamada: revogar vale na hora", async () => {
    await expect(exigirAcessoFinanceiro()).resolves.toBe(ID);

    dobles.adminFindUnique.mockResolvedValue({ acessoFinanceiro: false, totpAtivo: true });
    await expect(exigirAcessoFinanceiro()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(dobles.adminFindUnique).toHaveBeenCalledTimes(2);
  });

  describe("registro de visualização (no máximo uma vez por hora por admin)", () => {
    it("procura registro do mesmo admin e da mesma ação na última hora", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-26T15:00:00.000Z"));

      await exigirAcessoFinanceiro();

      expect(dobles.logFindFirst).toHaveBeenCalledWith({
        where: {
          ator: ATOR,
          acao: ACAO_FINANCEIRO_VISUALIZOU,
          criadoEm: { gte: new Date("2026-10-26T14:00:00.000Z") },
        },
        select: { id: true },
      });
      expect(JANELA_VISUALIZACAO_MS).toBe(3_600_000);
    });

    it("já registrou na última hora: não registra de novo", async () => {
      dobles.logFindFirst.mockResolvedValue({ id: "log-1" });

      await expect(exigirAcessoFinanceiro()).resolves.toBe(ID);

      expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    });

    it("falha ao conferir o log não derruba o acesso nem grava duplicado", async () => {
      dobles.logFindFirst.mockRejectedValue(new Error("banco fora do ar"));
      const erro = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(exigirAcessoFinanceiro()).resolves.toBe(ID);

      expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
      expect(erro).toHaveBeenCalled();
      erro.mockRestore();
    });
  });

  it("não coloca dado financeiro nem identificação além do ator na auditoria", async () => {
    await exigirAcessoFinanceiro();
    dobles.adminFindUnique.mockResolvedValue({ acessoFinanceiro: false, totpAtivo: true });
    await expect(exigirAcessoFinanceiro()).rejects.toThrow();

    for (const [evento] of dobles.registrarAuditoria.mock.calls) {
      expect(Object.keys(evento).sort()).toEqual(
        evento.detalhe ? ["acao", "ator", "detalhe"] : ["acao", "ator"],
      );
    }
  });
});
