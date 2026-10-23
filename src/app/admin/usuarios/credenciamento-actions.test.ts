import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Credenciar e suspender consultores (Projeto RNA, etapa 6), testados sem
 * banco: o Prisma, a sessão e a auditoria são trocados por dublês, e o que se
 * confere é o que a action manda para eles (quem pode chamar, de que status se
 * pode sair, o que o `where` exige, o que é gravado e quando a auditoria é
 * escrita).
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: dobles.redirect }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("@/lib/prisma", () => ({
  prisma: { credenciamentoConsultor: { findUnique: dobles.findUnique, updateMany: dobles.updateMany } },
}));

import { credenciarConsultor, suspenderConsultor } from "./credenciamento-actions";

const ID = "cm1abc23d0000xyz98765432";
const INICIAL = {};

function formulario(campos: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

function nenhumaEscrita() {
  expect(dobles.updateMany).not.toHaveBeenCalled();
  expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  expect(dobles.revalidatePath).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.adminIdLogado.mockResolvedValue("admin1");
  // Como o redirect de verdade: interrompe a action lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.findUnique.mockResolvedValue({ status: "aceito" });
  dobles.updateMany.mockResolvedValue({ count: 1 });
});

describe("sem admin logado nada acontece", () => {
  it.each([
    ["credenciarConsultor", credenciarConsultor, { vendedorId: ID }],
    ["suspenderConsultor", suspenderConsultor, { vendedorId: ID, motivo: "x" }],
  ])("%s manda para o login e não toca no banco", async (_nome, acao, campos) => {
    dobles.adminIdLogado.mockResolvedValue(null);
    await expect(acao(INICIAL, formulario(campos))).rejects.toThrow("NEXT_REDIRECT:/admin/login");

    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it.each([
    ["credenciarConsultor", credenciarConsultor],
    ["suspenderConsultor", suspenderConsultor],
  ])("%s confere a sessão antes de ler qualquer coisa do formulário", async (_nome, acao) => {
    dobles.adminIdLogado.mockResolvedValue(null);
    // Requisição montada à mão, sem FormData: tem de cair no login, não num erro de leitura.
    await expect(acao(INICIAL, {} as FormData)).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });
});

describe("id do consultor", () => {
  it.each([
    ["credenciarConsultor", credenciarConsultor],
    ["suspenderConsultor", suspenderConsultor],
  ])("%s recusa id vazio ou com forma estranha, sem consultar o banco", async (_nome, acao) => {
    for (const vendedorId of ["", "   ", "a b", "x".repeat(65), "../../etc", "id;drop"]) {
      const r = await acao(INICIAL, formulario({ vendedorId, motivo: "motivo" }));
      expect(r.erro).toMatch(/Consultor inválido/);
    }
    const semCampo = await acao(INICIAL, formulario({ motivo: "motivo" }));
    expect(semCampo.erro).toMatch(/Consultor inválido/);
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscrita();
  });
});

describe("credenciarConsultor", () => {
  it("credencia quem aceitou: grava quem e quando, limpa a suspensão antiga, só se o status ainda for o mesmo, e audita", async () => {
    const antes = Date.now();
    const r = await credenciarConsultor(INICIAL, formulario({ vendedorId: ID }));

    expect(r).toEqual({ ok: true });
    expect(dobles.findUnique.mock.calls[0][0].where).toEqual({ vendedorId: ID });
    expect(dobles.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = dobles.updateMany.mock.calls[0][0];
    expect(where).toEqual({ vendedorId: ID, status: "aceito" });
    expect(data).toMatchObject({
      status: "credenciado",
      credenciadoPorId: "admin1",
      suspensoEm: null,
      motivo: null,
    });
    expect(data.credenciadoEm).toBeInstanceOf(Date);
    expect(data.credenciadoEm.getTime()).toBeGreaterThanOrEqual(antes);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "admin.credenciarConsultor",
      alvo: ID,
      detalhe: "aceito → credenciado",
    });
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/usuarios");
  });

  it("campos extras no formulário não mudam o que é gravado", async () => {
    await credenciarConsultor(INICIAL, formulario({ vendedorId: ID, status: "suspenso", credenciadoPorId: "outro" }));

    const { data } = dobles.updateMany.mock.calls[0][0];
    expect(data.status).toBe("credenciado");
    expect(data.credenciadoPorId).toBe("admin1");
  });

  it.each([
    ["pendente", /ainda não aceitou/],
    ["credenciado", /já está credenciado/],
    ["suspenso", /precisa aceitar o compromisso de novo/],
  ])("de %s não credencia: erro claro, sem gravar nem auditar", async (status, mensagem) => {
    dobles.findUnique.mockResolvedValue({ status });
    const r = await credenciarConsultor(INICIAL, formulario({ vendedorId: ID }));

    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(mensagem);
    nenhumaEscrita();
  });

  it("consultor sem registro (nunca aceitou) conta como pendente: não credencia", async () => {
    dobles.findUnique.mockResolvedValue(null);
    const r = await credenciarConsultor(INICIAL, formulario({ vendedorId: ID }));

    expect(r.erro).toMatch(/ainda não aceitou/);
    nenhumaEscrita();
  });

  it("status desconhecido no banco conta como pendente: não credencia", async () => {
    dobles.findUnique.mockResolvedValue({ status: "qualquer" });
    const r = await credenciarConsultor(INICIAL, formulario({ vendedorId: ID }));

    expect(r.erro).toMatch(/ainda não aceitou/);
    nenhumaEscrita();
  });

  it("o status mudou entre a leitura e a gravação (zero linhas): avisa e não audita", async () => {
    dobles.updateMany.mockResolvedValue({ count: 0 });
    const r = await credenciarConsultor(INICIAL, formulario({ vendedorId: ID }));

    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(/mudou enquanto você olhava a tela/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/usuarios");
  });
});

describe("suspenderConsultor", () => {
  it.each(["aceito", "credenciado"])("suspende de %s com motivo: grava data e motivo, só se o status ainda for o mesmo, e audita", async (status) => {
    dobles.findUnique.mockResolvedValue({ status });
    const r = await suspenderConsultor(INICIAL, formulario({ vendedorId: ID, motivo: "  Conflito de interesse não declarado  " }));

    expect(r).toEqual({ ok: true });
    const { where, data } = dobles.updateMany.mock.calls[0][0];
    expect(where).toEqual({ vendedorId: ID, status });
    expect(data).toMatchObject({ status: "suspenso", motivo: "Conflito de interesse não declarado" });
    expect(data.suspensoEm).toBeInstanceOf(Date);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "admin.suspenderConsultor",
      alvo: ID,
      detalhe: `${status} → suspenso. Motivo: Conflito de interesse não declarado`,
    });
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/usuarios");
  });

  it("motivo obrigatório: vazio ou só espaços recusa antes de consultar o banco, devolvendo o que foi digitado", async () => {
    for (const motivo of ["", "   ", "\n\t "]) {
      const r = await suspenderConsultor(INICIAL, formulario({ vendedorId: ID, motivo }));
      expect(r.erro).toBe("Informe o motivo da suspensão.");
      expect(r.valores).toEqual({ motivo: "" });
    }
    const semCampo = await suspenderConsultor(INICIAL, formulario({ vendedorId: ID }));
    expect(semCampo.erro).toBe("Informe o motivo da suspensão.");
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it("arquivo anexado ao campo do motivo não vale como texto", async () => {
    const arquivo = new File(["motivo"], "motivo.txt", { type: "text/plain" });
    const r = await suspenderConsultor(INICIAL, formulario({ vendedorId: ID, motivo: arquivo }));

    expect(r.erro).toBe("Informe o motivo da suspensão.");
    nenhumaEscrita();
  });

  it("motivo em várias linhas e com caracteres de controle vira uma linha só", async () => {
    const sujo = "linha um" + String.fromCharCode(13, 10, 13, 10) + "linha" + String.fromCharCode(0) + " dois" + String.fromCharCode(0x202e);
    await suspenderConsultor(INICIAL, formulario({ vendedorId: ID, motivo: sujo }));

    expect(dobles.updateMany.mock.calls[0][0].data.motivo).toBe("linha um linha dois");
  });

  it("motivo acima do limite é recusado com a contagem, sem gravar", async () => {
    const longo = "a".repeat(301);
    const r = await suspenderConsultor(INICIAL, formulario({ vendedorId: ID, motivo: longo }));

    expect(r.erro).toMatch(/301 caracteres; o limite é 300/);
    expect(r.valores).toEqual({ motivo: longo });
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it("motivo no limite exato é aceito", async () => {
    const r = await suspenderConsultor(INICIAL, formulario({ vendedorId: ID, motivo: "a".repeat(300) }));

    expect(r.ok).toBe(true);
  });

  it.each([
    ["pendente", /Só dá para suspender quem já aceitou/],
    ["suspenso", /já está suspenso/],
  ])("de %s não suspende: erro claro, sem gravar nem auditar, e o motivo digitado volta", async (status, mensagem) => {
    dobles.findUnique.mockResolvedValue({ status });
    const r = await suspenderConsultor(INICIAL, formulario({ vendedorId: ID, motivo: "motivo" }));

    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(mensagem);
    expect(r.valores).toEqual({ motivo: "motivo" });
    nenhumaEscrita();
  });

  it("consultor sem registro conta como pendente: não suspende", async () => {
    dobles.findUnique.mockResolvedValue(null);
    const r = await suspenderConsultor(INICIAL, formulario({ vendedorId: ID, motivo: "motivo" }));

    expect(r.erro).toMatch(/Só dá para suspender quem já aceitou/);
    nenhumaEscrita();
  });

  it("o status mudou entre a leitura e a gravação (zero linhas): avisa, devolve o motivo e não audita", async () => {
    dobles.updateMany.mockResolvedValue({ count: 0 });
    const r = await suspenderConsultor(INICIAL, formulario({ vendedorId: ID, motivo: "motivo" }));

    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(/mudou enquanto você olhava a tela/);
    expect(r.valores).toEqual({ motivo: "motivo" });
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("campos extras no formulário não mudam o status gravado", async () => {
    await suspenderConsultor(INICIAL, formulario({ vendedorId: ID, motivo: "motivo", status: "credenciado" }));

    expect(dobles.updateMany.mock.calls[0][0].data.status).toBe("suspenso");
  });
});
