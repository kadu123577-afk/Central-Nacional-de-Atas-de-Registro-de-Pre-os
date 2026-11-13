import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Conferência de permissão no banco: o Prisma, a auditoria e o redirect do
 * Next são trocados por dublês. O que se confere é a decisão (deixa passar,
 * recusa e audita, ou manda para o login) e que a lista é lida do banco a
 * cada chamada.
 */
const dobles = vi.hoisted(() => ({
  adminFindUnique: vi.fn(),
  registrarAuditoria: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: dobles.redirect }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("@/lib/prisma", () => ({ prisma: { admin: { findUnique: dobles.adminFindUnique } } }));

import {
  ACAO_PERMISSAO_NEGADA,
  CAMINHO_SEM_PERMISSAO,
  adminTemPermissao,
  exigirPermissaoDe,
  permissoesDoAdmin,
} from "./permissoes-db";

beforeEach(() => {
  vi.clearAllMocks();
  // Como o redirect de verdade: interrompe lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
});

function conta(permissoes: string[], ativo = true) {
  dobles.adminFindUnique.mockResolvedValue({ permissoes, ativo });
}

describe("permissoesDoAdmin", () => {
  it("devolve a lista limpa (só chaves conhecidas)", async () => {
    conta(["atas.conformidade", "lixo", "base.editar"]);
    await expect(permissoesDoAdmin("adm1")).resolves.toEqual(["atas.conformidade", "base.editar"]);
    expect(dobles.adminFindUnique).toHaveBeenCalledWith({
      where: { id: "adm1" },
      select: { permissoes: true, ativo: true },
    });
  });

  it("conta desativada ou inexistente volta null", async () => {
    conta(["atas.conformidade"], false);
    await expect(permissoesDoAdmin("adm1")).resolves.toBeNull();
    dobles.adminFindUnique.mockResolvedValue(null);
    await expect(permissoesDoAdmin("adm2")).resolves.toBeNull();
  });

  it("lê do banco a cada chamada: revogar vale na hora", async () => {
    conta(["atas.conformidade"]);
    await permissoesDoAdmin("adm1");
    conta([]);
    await expect(permissoesDoAdmin("adm1")).resolves.toEqual([]);
    expect(dobles.adminFindUnique).toHaveBeenCalledTimes(2);
  });
});

describe("exigirPermissaoDe", () => {
  it("com a permissão, passa sem auditar nem redirecionar", async () => {
    conta(["atas.conformidade"]);
    await expect(exigirPermissaoDe("adm1", "atas.conformidade")).resolves.toBeUndefined();
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    expect(dobles.redirect).not.toHaveBeenCalled();
  });

  it("sem a permissão, audita a negativa (com a ação) e leva ao painel", async () => {
    conta(["atas.captar"]);
    await expect(exigirPermissaoDe("adm1", "atas.conformidade", "admin.analisarAta")).rejects.toThrow(
      `NEXT_REDIRECT:${CAMINHO_SEM_PERMISSAO}`,
    );
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:adm1",
      acao: ACAO_PERMISSAO_NEGADA,
      detalhe: "atas.conformidade admin.analisarAta",
    });
  });

  it("lista vazia não tem nenhuma permissão", async () => {
    conta([]);
    await expect(exigirPermissaoDe("adm1", "base.editar")).rejects.toThrow("NEXT_REDIRECT");
  });

  it("com várias permissões aceitas, basta uma", async () => {
    conta(["atas.conformidade"]);
    await expect(exigirPermissaoDe("adm1", ["atas.conformidade", "atas.contrato"])).resolves.toBeUndefined();
    conta(["base.editar"]);
    await expect(exigirPermissaoDe("adm1", ["atas.conformidade", "atas.contrato"])).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe("atas.conformidade|atas.contrato");
  });

  it("conta desativada ou apagada volta ao login, sem auditar como negativa de permissão", async () => {
    conta(["atas.conformidade"], false);
    await expect(exigirPermissaoDe("adm1", "atas.conformidade")).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe("adminTemPermissao", () => {
  it("responde sem redirecionar", async () => {
    conta(["atas.conformidade"]);
    await expect(adminTemPermissao("adm1", "atas.conformidade")).resolves.toBe(true);
    await expect(adminTemPermissao("adm1", "atas.contrato")).resolves.toBe(false);
    conta(["atas.conformidade"], false);
    await expect(adminTemPermissao("adm1", "atas.conformidade")).resolves.toBe(false);
    expect(dobles.redirect).not.toHaveBeenCalled();
  });
});
