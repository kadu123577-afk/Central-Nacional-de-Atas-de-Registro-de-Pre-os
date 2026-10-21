import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As quatro decisões do gestor sobre contratos detectados, testadas sem banco:
 * o Prisma, a sessão e a auditoria são trocados por dublês, e o que se confere
 * é o que a action manda para eles (quem pode chamar, o que o `where` exige,
 * o que é gravado e quando a auditoria é escrita).
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  vinculoFindUnique: vi.fn(),
  vinculoUpdateMany: vi.fn(),
  termoFindUnique: vi.fn(),
  termoUpdateMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: dobles.redirect }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vinculoContrato: { findUnique: dobles.vinculoFindUnique, updateMany: dobles.vinculoUpdateMany },
    termoContratoPublico: { findUnique: dobles.termoFindUnique, updateMany: dobles.termoUpdateMany },
  },
}));

import {
  confirmarVinculoContrato,
  descartarVinculoContrato,
  marcarTermoLancado,
  marcarTermoSemComissao,
} from "./actions";

const NUMERO_CONTROLE = "14147490000168-2-000216/2026";

function formulario(campos: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

function nenhumaEscritaNoBanco() {
  expect(dobles.vinculoUpdateMany).not.toHaveBeenCalled();
  expect(dobles.termoUpdateMany).not.toHaveBeenCalled();
  expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.adminIdLogado.mockResolvedValue("admin1");
  // Como o redirect de verdade: interrompe a action lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.vinculoFindUnique.mockResolvedValue({ contrato: { numeroControlePncp: NUMERO_CONTROLE } });
  dobles.vinculoUpdateMany.mockResolvedValue({ count: 1 });
  dobles.termoFindUnique.mockResolvedValue({
    tipo: "aditivo_valor",
    contrato: { numeroControlePncp: NUMERO_CONTROLE },
  });
  dobles.termoUpdateMany.mockResolvedValue({ count: 1 });
});

describe("sem admin logado nada acontece", () => {
  it.each([
    ["confirmarVinculoContrato", confirmarVinculoContrato, { vinculoId: "v1" }],
    ["descartarVinculoContrato", descartarVinculoContrato, { vinculoId: "v1", motivo: "x" }],
    ["marcarTermoLancado", marcarTermoLancado, { termoId: "t1" }],
    ["marcarTermoSemComissao", marcarTermoSemComissao, { termoId: "t1" }],
  ])("%s manda para o login e não toca no banco", async (_nome, acao, campos) => {
    dobles.adminIdLogado.mockResolvedValue(null);
    await expect(acao(formulario(campos))).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(dobles.vinculoFindUnique).not.toHaveBeenCalled();
    expect(dobles.termoFindUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });

  it("confere a sessão antes de ler qualquer coisa do formulário", async () => {
    dobles.adminIdLogado.mockResolvedValue(null);
    // Requisição montada à mão, sem FormData: tem de cair no login, não num erro de leitura.
    const semFormData = {} as FormData;
    await expect(descartarVinculoContrato(semFormData)).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });
});

describe("decisão sobre o vínculo", () => {
  it("confirma só o que ainda está sugerido, grava quem e quando, e audita", async () => {
    const antes = Date.now();
    await confirmarVinculoContrato(formulario({ vinculoId: "v1" }));

    expect(dobles.vinculoUpdateMany).toHaveBeenCalledTimes(1);
    const { where, data } = dobles.vinculoUpdateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "v1", status: "sugerido" });
    expect(data.status).toBe("confirmado");
    expect(data.decididoPorId).toBe("admin1");
    expect(data.decididoEm).toBeInstanceOf(Date);
    expect(data.decididoEm.getTime()).toBeGreaterThanOrEqual(antes);

    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "admin.confirmarVinculoContrato",
      alvo: "v1",
      detalhe: `contrato ${NUMERO_CONTROLE}`,
    });
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/contratos-detectados");
  });

  it("descarta com o mesmo cuidado e leva o motivo só para a auditoria", async () => {
    await descartarVinculoContrato(formulario({ vinculoId: "v1", motivo: "  Contrato de outro\nfornecedor\t  " }));

    const { where, data } = dobles.vinculoUpdateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "v1", status: "sugerido" });
    expect(data).toEqual({ status: "descartado", decididoPorId: "admin1", decididoEm: expect.any(Date) });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "admin.descartarVinculoContrato",
      alvo: "v1",
      detalhe: `contrato ${NUMERO_CONTROLE} — motivo: Contrato de outro fornecedor`,
    });
  });

  it("descarte sem motivo não escreve 'motivo' na auditoria", async () => {
    await descartarVinculoContrato(formulario({ vinculoId: "v1", motivo: "   " }));
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe(`contrato ${NUMERO_CONTROLE}`);
  });

  it("corta o motivo em 200 caracteres", async () => {
    await descartarVinculoContrato(formulario({ vinculoId: "v1", motivo: "a".repeat(500) }));
    const detalhe: string = dobles.registrarAuditoria.mock.calls[0][0].detalhe;
    expect(detalhe.endsWith("a".repeat(200))).toBe(true);
    expect(detalhe.endsWith("a".repeat(201))).toBe(false);
  });

  it("confirmar ignora um motivo enviado de propósito", async () => {
    await confirmarVinculoContrato(formulario({ vinculoId: "v1", motivo: "qualquer coisa" }));
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe(`contrato ${NUMERO_CONTROLE}`);
  });

  it("vínculo já decidido (nenhuma linha mudou) não é sobrescrito nem auditado", async () => {
    dobles.vinculoUpdateMany.mockResolvedValue({ count: 0 });
    await descartarVinculoContrato(formulario({ vinculoId: "v1" }));
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    // A tela ainda é atualizada, para mostrar a decisão que já existia.
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/contratos-detectados");
  });

  it("vínculo que não existe não grava nada", async () => {
    dobles.vinculoFindUnique.mockResolvedValue(null);
    await confirmarVinculoContrato(formulario({ vinculoId: "inexistente" }));
    nenhumaEscritaNoBanco();
  });

  it.each([
    ["vazio", {}],
    ["só espaços", { vinculoId: "   " }],
    ["com espaço no meio", { vinculoId: "abc def" }],
    ["com aspas e ponto e vírgula", { vinculoId: "x'; DROP TABLE vinculos_contrato;--" }],
    ["longo demais", { vinculoId: "a".repeat(65) }],
    ["arquivo no lugar do texto", { vinculoId: new File(["v1"], "v1.txt") }],
  ])("id %s é recusado antes de consultar o banco", async (_descricao, campos) => {
    await confirmarVinculoContrato(formulario(campos));
    expect(dobles.vinculoFindUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });

  it("aceita ids no formato cuid", async () => {
    await confirmarVinculoContrato(formulario({ vinculoId: "cm1abc23d0000xyz9876543210" }));
    expect(dobles.vinculoUpdateMany).toHaveBeenCalledTimes(1);
  });
});

describe("decisão sobre o aditivo", () => {
  it("só muda aditivo a acompanhar de contrato com vínculo confirmado, e audita", async () => {
    await marcarTermoLancado(formulario({ termoId: "t1" }));

    expect(dobles.termoUpdateMany).toHaveBeenCalledWith({
      where: { id: "t1", cobrancaStatus: "a_acompanhar", contrato: { vinculo: { status: "confirmado" } } },
      data: { cobrancaStatus: "lancado" },
    });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "admin.marcarTermoLancado",
      alvo: "t1",
      detalhe: `aditivo_valor do contrato ${NUMERO_CONTROLE} → lancado`,
    });
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/contratos-detectados");
  });

  it("'sem comissão' grava o status certo", async () => {
    await marcarTermoSemComissao(formulario({ termoId: "t1" }));
    expect(dobles.termoUpdateMany.mock.calls[0][0].data).toEqual({ cobrancaStatus: "sem_comissao" });
    expect(dobles.registrarAuditoria.mock.calls[0][0].acao).toBe("admin.marcarTermoSemComissao");
  });

  it("aditivo já tratado, ou de vínculo não confirmado, não muda nem é auditado", async () => {
    dobles.termoUpdateMany.mockResolvedValue({ count: 0 });
    await marcarTermoLancado(formulario({ termoId: "t1" }));
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("aditivo que não existe não grava nada", async () => {
    dobles.termoFindUnique.mockResolvedValue(null);
    await marcarTermoSemComissao(formulario({ termoId: "inexistente" }));
    nenhumaEscritaNoBanco();
  });

  it.each([
    ["vazio", {}],
    ["com barra", { termoId: "../t1" }],
    ["arquivo no lugar do texto", { termoId: new File(["t1"], "t1.txt") }],
  ])("id %s é recusado antes de consultar o banco", async (_descricao, campos) => {
    await marcarTermoLancado(formulario(campos));
    expect(dobles.termoFindUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });
});
