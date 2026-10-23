import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O aceite do compromisso de integridade pelo consultor (Projeto RNA, etapa
 * 6), testado sem banco: o Prisma, a sessão e a auditoria são trocados por
 * dublês, e o que se confere é o que a action manda para eles (quem pode
 * chamar, de que status se pode aceitar, o que o `where` exige, o que é
 * gravado e quando a auditoria é escrita).
 */
const dobles = vi.hoisted(() => ({
  vendedorIdLogado: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: dobles.redirect }));
vi.mock("@/lib/auth", () => ({ vendedorIdLogado: dobles.vendedorIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    credenciamentoConsultor: {
      findUnique: dobles.findUnique,
      create: dobles.create,
      updateMany: dobles.updateMany,
    },
  },
}));

import { VERSAO_INTEGRIDADE } from "@/lib/credenciamento";
import { aceitarIntegridade } from "./actions";

const INICIAL = {};

function formulario(campos: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

/** Formulário de um aceite correto. */
function aceite(extra: Record<string, string | File> = {}): FormData {
  return formulario({ aceito: "on", versao: String(VERSAO_INTEGRIDADE), ...extra });
}

function nenhumaEscrita() {
  expect(dobles.create).not.toHaveBeenCalled();
  expect(dobles.updateMany).not.toHaveBeenCalled();
  expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  expect(dobles.revalidatePath).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.vendedorIdLogado.mockResolvedValue("vend1");
  // Como o redirect de verdade: interrompe a action lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.findUnique.mockResolvedValue(null);
  dobles.create.mockResolvedValue({});
  dobles.updateMany.mockResolvedValue({ count: 1 });
});

describe("sem vendedor logado nada acontece", () => {
  it("manda para o login e não toca no banco", async () => {
    dobles.vendedorIdLogado.mockResolvedValue(null);
    await expect(aceitarIntegridade(INICIAL, aceite())).rejects.toThrow("NEXT_REDIRECT:/vendedor/login");

    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it("confere a sessão antes de ler qualquer coisa do formulário", async () => {
    dobles.vendedorIdLogado.mockResolvedValue(null);
    // Requisição montada à mão, sem FormData: tem de cair no login, não num erro de leitura.
    await expect(aceitarIntegridade(INICIAL, {} as FormData)).rejects.toThrow("NEXT_REDIRECT:/vendedor/login");
  });
});

describe("validação do formulário", () => {
  it("sem a caixa marcada recusa, sem consultar nem gravar", async () => {
    const r = await aceitarIntegridade(INICIAL, formulario({ versao: String(VERSAO_INTEGRIDADE) }));

    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(/Li e aceito/);
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it.each(["", "off", "false", "0", "sim", "ON"])("só o valor da caixa marcada vale (%j)", async (valor) => {
    const r = await aceitarIntegridade(INICIAL, formulario({ aceito: valor, versao: String(VERSAO_INTEGRIDADE) }));

    expect(r.erro).toBeTruthy();
    nenhumaEscrita();
  });

  it("arquivo anexado ao campo da caixa não vale como aceite", async () => {
    const arquivo = new File(["on"], "on.txt", { type: "text/plain" });
    const r = await aceitarIntegridade(INICIAL, formulario({ aceito: arquivo, versao: String(VERSAO_INTEGRIDADE) }));

    expect(r.erro).toBeTruthy();
    nenhumaEscrita();
  });

  it.each([String(VERSAO_INTEGRIDADE + 1), String(VERSAO_INTEGRIDADE - 1), "", "abc"])(
    "versão do texto diferente da atual (%j) pede nova leitura e não grava",
    async (versao) => {
      const r = await aceitarIntegridade(INICIAL, formulario({ aceito: "on", versao }));

      expect(r.ok).toBeUndefined();
      expect(r.erro).toMatch(/texto do compromisso foi atualizado/);
      nenhumaEscrita();
    },
  );

  it("sem o campo da versão também recusa", async () => {
    const r = await aceitarIntegridade(INICIAL, formulario({ aceito: "on" }));

    expect(r.erro).toMatch(/texto do compromisso foi atualizado/);
    nenhumaEscrita();
  });
});

describe("primeiro aceite (sem registro)", () => {
  it("cria o registro como 'aceito' com a data e a versão do texto, e audita", async () => {
    const antes = Date.now();
    const r = await aceitarIntegridade(INICIAL, aceite());

    expect(r).toEqual({ ok: true });
    expect(dobles.updateMany).not.toHaveBeenCalled();
    expect(dobles.create).toHaveBeenCalledTimes(1);
    const { data } = dobles.create.mock.calls[0][0];
    expect(data).toMatchObject({ vendedorId: "vend1", status: "aceito", integridadeVersao: VERSAO_INTEGRIDADE });
    expect(data.integridadeAceitaEm).toBeInstanceOf(Date);
    expect(data.integridadeAceitaEm.getTime()).toBeGreaterThanOrEqual(antes);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "vendedor:vend1",
      acao: "vendedor.aceitarIntegridade",
      alvo: "vend1",
      detalhe: `Texto versão ${VERSAO_INTEGRIDADE}: pendente → aceito`,
    });
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/vendedor/credenciamento");
  });

  it("lê o registro do vendedor logado, não de um id vindo do formulário", async () => {
    await aceitarIntegridade(INICIAL, aceite({ vendedorId: "outro" }));

    expect(dobles.findUnique.mock.calls[0][0].where).toEqual({ vendedorId: "vend1" });
    expect(dobles.create.mock.calls[0][0].data.vendedorId).toBe("vend1");
  });

  it("campos extras no formulário não mudam o status gravado", async () => {
    await aceitarIntegridade(INICIAL, aceite({ status: "credenciado", credenciadoPorId: "admin1" }));

    const { data } = dobles.create.mock.calls[0][0];
    expect(data.status).toBe("aceito");
    expect(data).not.toHaveProperty("credenciadoPorId");
    expect(data).not.toHaveProperty("credenciadoEm");
  });

  it("status desconhecido no banco conta como pendente e aceita", async () => {
    dobles.findUnique.mockResolvedValue({ status: "qualquer" });
    const r = await aceitarIntegridade(INICIAL, aceite());

    expect(r.ok).toBe(true);
    expect(dobles.updateMany.mock.calls[0][0].where).toEqual({ vendedorId: "vend1", status: "qualquer" });
  });

  it("outra aba criou o registro no meio (chave única): nada é duplicado e a pessoa é avisada", async () => {
    dobles.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    const r = await aceitarIntegridade(INICIAL, aceite());

    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(/mudou enquanto você olhava a tela/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("qualquer outro erro do banco sobe, sem auditar como se tivesse dado certo", async () => {
    dobles.create.mockRejectedValue(new Error("banco indisponível"));

    await expect(aceitarIntegridade(INICIAL, aceite())).rejects.toThrow("banco indisponível");
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe("novo aceite depois de uma suspensão", () => {
  it("volta de 'suspenso' para 'aceito' (não para credenciado), só se o status ainda for o mesmo", async () => {
    dobles.findUnique.mockResolvedValue({ status: "suspenso" });
    const r = await aceitarIntegridade(INICIAL, aceite());

    expect(r).toEqual({ ok: true });
    expect(dobles.create).not.toHaveBeenCalled();
    expect(dobles.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = dobles.updateMany.mock.calls[0][0];
    expect(where).toEqual({ vendedorId: "vend1", status: "suspenso" });
    expect(data).toMatchObject({ status: "aceito", integridadeVersao: VERSAO_INTEGRIDADE });
    expect(data.integridadeAceitaEm).toBeInstanceOf(Date);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "vendedor:vend1",
      acao: "vendedor.aceitarIntegridade",
      alvo: "vend1",
      detalhe: `Texto versão ${VERSAO_INTEGRIDADE}: suspenso → aceito`,
    });
  });

  it("não mexe nos dados da liberação nem da suspensão: quem decide isso é a equipe", async () => {
    dobles.findUnique.mockResolvedValue({ status: "suspenso" });
    await aceitarIntegridade(INICIAL, aceite());

    const { data } = dobles.updateMany.mock.calls[0][0];
    expect(Object.keys(data).sort()).toEqual(["integridadeAceitaEm", "integridadeVersao", "status"]);
  });

  it("o status mudou entre a leitura e a gravação (zero linhas): avisa e não audita", async () => {
    dobles.findUnique.mockResolvedValue({ status: "suspenso" });
    dobles.updateMany.mockResolvedValue({ count: 0 });
    const r = await aceitarIntegridade(INICIAL, aceite());

    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(/mudou enquanto você olhava a tela/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe("quem não precisa aceitar", () => {
  it("já aceito: recusa com a frase do status e não grava nem audita de novo", async () => {
    dobles.findUnique.mockResolvedValue({ status: "aceito" });
    const r = await aceitarIntegridade(INICIAL, aceite());

    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(/aceite já foi registrado/);
    nenhumaEscrita();
  });

  it("já credenciado: recusa e não rebaixa o status", async () => {
    dobles.findUnique.mockResolvedValue({ status: "credenciado" });
    const r = await aceitarIntegridade(INICIAL, aceite());

    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(/já está credenciado/);
    nenhumaEscrita();
  });
});
