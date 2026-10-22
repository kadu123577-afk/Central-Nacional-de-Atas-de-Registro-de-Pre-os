import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As duas ações do funil de prospecção, testadas sem banco: o Prisma, a
 * sessão e a auditoria são trocados por dublês, e o que se confere é o que a
 * action manda para eles (quem pode chamar, o que o `where` exige, o que é
 * gravado e quando a auditoria é escrita).
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
  prisma: { prospeccaoFornecedor: { findUnique: dobles.findUnique, updateMany: dobles.updateMany } },
}));

import { atualizarProspeccao, moverEstagioProspeccao } from "./actions";

const ID = "cm1abc23d0000xyz98765432";
const CNPJ = "11222333000181";
const INICIAL = {};

function formulario(campos: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

function nenhumaEscritaNoBanco() {
  expect(dobles.updateMany).not.toHaveBeenCalled();
  expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
}

function linha(extra: Partial<{ estagio: string; proximoContatoEm: Date | null; observacoes: string | null }> = {}) {
  return { cnpj: CNPJ, estagio: "identificado", proximoContatoEm: null, observacoes: null, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.adminIdLogado.mockResolvedValue("admin1");
  // Como o redirect de verdade: interrompe a action lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.findUnique.mockResolvedValue(linha());
  dobles.updateMany.mockResolvedValue({ count: 1 });
});

describe("sem admin logado nada acontece", () => {
  it.each([
    ["moverEstagioProspeccao", moverEstagioProspeccao, { id: ID, estagio: "contatado" }],
    ["atualizarProspeccao", atualizarProspeccao, { id: ID, observacoes: "x" }],
  ])("%s manda para o login e não toca no banco", async (_nome, acao, campos) => {
    dobles.adminIdLogado.mockResolvedValue(null);
    await expect(acao(INICIAL, formulario(campos))).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["moverEstagioProspeccao", moverEstagioProspeccao],
    ["atualizarProspeccao", atualizarProspeccao],
  ])("%s confere a sessão antes de ler qualquer coisa do formulário", async (_nome, acao) => {
    dobles.adminIdLogado.mockResolvedValue(null);
    // Requisição montada à mão, sem FormData: tem de cair no login, não num erro de leitura.
    await expect(acao(INICIAL, {} as FormData)).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });
});

describe("moverEstagioProspeccao", () => {
  it("avança um passo, grava quem mexeu, só se o estágio ainda for o mesmo, e audita", async () => {
    const r = await moverEstagioProspeccao(INICIAL, formulario({ id: ID, estagio: "contatado" }));

    expect(r).toEqual({ ok: true });
    expect(dobles.updateMany).toHaveBeenCalledTimes(1);
    expect(dobles.updateMany).toHaveBeenCalledWith({
      where: { id: ID, estagio: "identificado" },
      data: { estagio: "contatado", atualizadoPorTipo: "admin", atualizadoPorId: "admin1" },
    });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "admin.moverEstagioProspeccao",
      alvo: ID,
      detalhe: `CNPJ ${CNPJ}: identificado → contatado`,
    });
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/prospeccao-fornecedores");
  });

  it("qualquer estágio pode ir para 'recusou'", async () => {
    dobles.findUnique.mockResolvedValue(linha({ estagio: "interessado" }));
    const r = await moverEstagioProspeccao(INICIAL, formulario({ id: ID, estagio: "recusou" }));
    expect(r.ok).toBe(true);
    expect(dobles.updateMany.mock.calls[0][0].data.estagio).toBe("recusou");
  });

  it("transição proibida (identificado → credenciado) volta erro e não grava nem audita", async () => {
    const r = await moverEstagioProspeccao(INICIAL, formulario({ id: ID, estagio: "credenciado" }));
    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(/Interessado/);
    nenhumaEscritaNoBanco();
  });

  it.each([
    ["identificado", "interessado"],
    ["contatado", "credenciado"],
    ["credenciado", "contatado"],
    ["credenciado", "identificado"],
    ["recusou", "interessado"],
    ["recusou", "credenciado"],
  ])("não pula etapa nem contorna a fila: %s → %s é recusado sem gravar", async (de, para) => {
    dobles.findUnique.mockResolvedValue(linha({ estagio: de }));
    const r = await moverEstagioProspeccao(INICIAL, formulario({ id: ID, estagio: para }));
    expect(r.ok).toBeUndefined();
    expect(r.erro).toBeTruthy();
    nenhumaEscritaNoBanco();
  });

  it.each([
    ["identificado", "contatado"],
    ["contatado", "identificado"],
    ["contatado", "interessado"],
    ["interessado", "contatado"],
    ["interessado", "credenciado"],
    ["credenciado", "interessado"],
    ["identificado", "recusou"],
    ["credenciado", "recusou"],
    ["recusou", "identificado"],
  ])("um passo de cada vez: %s → %s é gravado só se o estágio ainda for o de origem", async (de, para) => {
    dobles.findUnique.mockResolvedValue(linha({ estagio: de }));
    const r = await moverEstagioProspeccao(INICIAL, formulario({ id: ID, estagio: para }));
    expect(r.ok).toBe(true);
    expect(dobles.updateMany).toHaveBeenCalledTimes(1);
    expect(dobles.updateMany.mock.calls[0][0].where).toEqual({ id: ID, estagio: de });
    expect(dobles.updateMany.mock.calls[0][0].data.estagio).toBe(para);
  });

  it("estágio atual desconhecido no banco não deixa mover nem grava", async () => {
    dobles.findUnique.mockResolvedValue(linha({ estagio: "ganho" }));
    const r = await moverEstagioProspeccao(INICIAL, formulario({ id: ID, estagio: "contatado" }));
    expect(r.erro).toBeTruthy();
    nenhumaEscritaNoBanco();
  });

  it("quem recusou só volta para 'identificado'", async () => {
    dobles.findUnique.mockResolvedValue(linha({ estagio: "recusou" }));
    const proibida = await moverEstagioProspeccao(INICIAL, formulario({ id: ID, estagio: "contatado" }));
    expect(proibida.erro).toBeTruthy();
    nenhumaEscritaNoBanco();

    const permitida = await moverEstagioProspeccao(INICIAL, formulario({ id: ID, estagio: "identificado" }));
    expect(permitida.ok).toBe(true);
    expect(dobles.updateMany).toHaveBeenCalledTimes(1);
  });

  it("ficar no mesmo estágio não grava nem audita", async () => {
    dobles.findUnique.mockResolvedValue(linha({ estagio: "contatado" }));
    const r = await moverEstagioProspeccao(INICIAL, formulario({ id: ID, estagio: "contatado" }));
    expect(r.ok).toBe(true);
    expect(r.aviso).toBeTruthy();
    nenhumaEscritaNoBanco();
  });

  it("se o estágio mudou no meio do caminho (nenhuma linha atualizada), avisa e não audita", async () => {
    dobles.updateMany.mockResolvedValue({ count: 0 });
    const r = await moverEstagioProspeccao(INICIAL, formulario({ id: ID, estagio: "contatado" }));
    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(/mudou/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("fornecedor que não existe não grava nada", async () => {
    dobles.findUnique.mockResolvedValue(null);
    const r = await moverEstagioProspeccao(INICIAL, formulario({ id: ID, estagio: "contatado" }));
    expect(r.erro).toBeTruthy();
    nenhumaEscritaNoBanco();
  });

  it.each([
    ["vazio", { estagio: "contatado" }],
    ["só espaços", { id: "   ", estagio: "contatado" }],
    ["com espaço no meio", { id: "cm1abc23d0000 xyz98765432", estagio: "contatado" }],
    ["com aspas e ponto e vírgula", { id: "x'; DROP TABLE prospeccao_fornecedores;--", estagio: "contatado" }],
    ["maiúsculas", { id: "CM1ABC23D0000XYZ98765432", estagio: "contatado" }],
    ["curto demais", { id: "cm1", estagio: "contatado" }],
    ["longo demais", { id: `c${"a".repeat(60)}`, estagio: "contatado" }],
    ["arquivo no lugar do texto", { id: new File([ID], "id.txt"), estagio: "contatado" }],
  ])("id %s é recusado antes de consultar o banco", async (_descricao, campos) => {
    const r = await moverEstagioProspeccao(INICIAL, formulario(campos));
    expect(r.erro).toBeTruthy();
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });

  it.each([
    ["vazio", {}],
    ["desconhecido", { estagio: "ganho" }],
    ["com outra caixa", { estagio: "Contatado" }],
    ["arquivo no lugar do texto", { estagio: new File(["contatado"], "e.txt") }],
  ])("estágio %s é recusado antes de consultar o banco", async (_descricao, extra) => {
    const r = await moverEstagioProspeccao(INICIAL, formulario({ id: ID, ...extra }));
    expect(r.erro).toBeTruthy();
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });
});

describe("atualizarProspeccao", () => {
  it("grava a data e as observações, marca quem mexeu e audita sem o texto das observações", async () => {
    const r = await atualizarProspeccao(
      INICIAL,
      formulario({ id: ID, proximoContatoEm: "2026-11-05", observacoes: "Pediu a lista de itens da ata." }),
    );

    expect(r).toEqual({ ok: true });
    expect(dobles.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = dobles.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: ID });
    expect(data.proximoContatoEm.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(data.observacoes).toBe("Pediu a lista de itens da ata.");
    expect(data.atualizadoPorTipo).toBe("admin");
    expect(data.atualizadoPorId).toBe("admin1");

    const evento = dobles.registrarAuditoria.mock.calls[0][0];
    expect(evento).toEqual({
      ator: "admin:admin1",
      acao: "admin.atualizarProspeccao",
      alvo: ID,
      detalhe: `CNPJ ${CNPJ}: próximo contato 2026-11-05; observações atualizadas`,
    });
    expect(evento.detalhe).not.toContain("lista de itens");
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/prospeccao-fornecedores");
  });

  it("limpa a data e as observações quando o campo vem vazio", async () => {
    dobles.findUnique.mockResolvedValue(
      linha({ proximoContatoEm: new Date("2026-11-05T00:00:00Z"), observacoes: "anotação antiga" }),
    );
    const r = await atualizarProspeccao(INICIAL, formulario({ id: ID, proximoContatoEm: "", observacoes: "   " }));
    expect(r.ok).toBe(true);
    const { data } = dobles.updateMany.mock.calls[0][0];
    expect(data.proximoContatoEm).toBeNull();
    expect(data.observacoes).toBeNull();
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe(
      `CNPJ ${CNPJ}: próximo contato removido; observações removidas`,
    );
  });

  it("muda só a data: não toca nas observações e audita só a data", async () => {
    dobles.findUnique.mockResolvedValue(linha({ observacoes: "igual" }));
    await atualizarProspeccao(INICIAL, formulario({ id: ID, proximoContatoEm: "2026-12-01", observacoes: "igual" }));
    const { data } = dobles.updateMany.mock.calls[0][0];
    expect(data).not.toHaveProperty("observacoes");
    expect(data.proximoContatoEm).toBeInstanceOf(Date);
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe(`CNPJ ${CNPJ}: próximo contato 2026-12-01`);
  });

  it("muda só as observações: não toca na data", async () => {
    dobles.findUnique.mockResolvedValue(linha({ proximoContatoEm: new Date("2026-11-05T00:00:00Z") }));
    await atualizarProspeccao(INICIAL, formulario({ id: ID, proximoContatoEm: "2026-11-05", observacoes: "nova" }));
    const { data } = dobles.updateMany.mock.calls[0][0];
    expect(data).not.toHaveProperty("proximoContatoEm");
    expect(data.observacoes).toBe("nova");
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe(`CNPJ ${CNPJ}: observações atualizadas`);
  });

  it("nada mudou: não grava e não audita", async () => {
    dobles.findUnique.mockResolvedValue(
      linha({ proximoContatoEm: new Date("2026-11-05T00:00:00Z"), observacoes: "mesma anotação" }),
    );
    const r = await atualizarProspeccao(
      INICIAL,
      formulario({ id: ID, proximoContatoEm: "2026-11-05", observacoes: "  mesma anotação \r\n" }),
    );
    expect(r).toEqual({ ok: true, aviso: "Nada mudou." });
    nenhumaEscritaNoBanco();
  });

  it("tudo vazio num fornecedor sem data nem anotação também não muda nada", async () => {
    const r = await atualizarProspeccao(INICIAL, formulario({ id: ID, proximoContatoEm: "", observacoes: "" }));
    expect(r.aviso).toBe("Nada mudou.");
    nenhumaEscritaNoBanco();
  });

  it.each([
    ["data que não existe", "2026-02-31"],
    ["mês 13", "2026-13-01"],
    ["formato brasileiro", "05/11/2026"],
    ["texto", "amanhã"],
    ["com hora", "2026-11-05T10:00:00Z"],
    ["ano fora do intervalo", "1999-01-01"],
  ])("data inválida (%s) volta erro, repõe o que foi digitado e não grava", async (_nome, data) => {
    const r = await atualizarProspeccao(INICIAL, formulario({ id: ID, proximoContatoEm: data, observacoes: "ligar" }));
    expect(r.erro).toMatch(/Data/);
    expect(r.valores).toEqual({ proximoContatoEm: data, observacoes: "ligar" });
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });

  it("observação com mais de 500 caracteres volta erro e não grava", async () => {
    const r = await atualizarProspeccao(INICIAL, formulario({ id: ID, observacoes: "a".repeat(501) }));
    expect(r.erro).toMatch(/501/);
    expect(r.erro).toMatch(/500/);
    expect(r.valores?.observacoes).toHaveLength(501);
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });

  it("observação com exatamente 500 caracteres é aceita", async () => {
    const r = await atualizarProspeccao(INICIAL, formulario({ id: ID, observacoes: "a".repeat(500) }));
    expect(r.ok).toBe(true);
    expect(dobles.updateMany.mock.calls[0][0].data.observacoes).toHaveLength(500);
  });

  it("o limite vale depois de aparar os espaços das pontas", async () => {
    // 500 letras com espaços nas pontas: depois de aparar, cabe.
    const r = await atualizarProspeccao(INICIAL, formulario({ id: ID, observacoes: `   ${"a".repeat(500)}   ` }));
    expect(r.ok).toBe(true);
  });

  it("tira caracteres de controle das observações antes de gravar", async () => {
    await atualizarProspeccao(INICIAL, formulario({ id: ID, observacoes: "ligar\u0000 de\u0007pois" }));
    expect(dobles.updateMany.mock.calls[0][0].data.observacoes).toBe("ligar depois");
  });

  it("fornecedor que não existe não grava nada", async () => {
    dobles.findUnique.mockResolvedValue(null);
    const r = await atualizarProspeccao(INICIAL, formulario({ id: ID, observacoes: "x" }));
    expect(r.erro).toBeTruthy();
    nenhumaEscritaNoBanco();
  });

  it("linha apagada no meio do caminho (nenhuma linha atualizada) não audita", async () => {
    dobles.updateMany.mockResolvedValue({ count: 0 });
    const r = await atualizarProspeccao(INICIAL, formulario({ id: ID, observacoes: "x" }));
    expect(r.erro).toBeTruthy();
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it.each([
    ["vazio", {}],
    ["com barra", { id: "../cm1abc23d0000xyz98765432" }],
    ["arquivo no lugar do texto", { id: new File([ID], "id.txt") }],
  ])("id %s é recusado antes de consultar o banco", async (_descricao, campos) => {
    const r = await atualizarProspeccao(INICIAL, formulario({ observacoes: "x", ...campos }));
    expect(r.erro).toBeTruthy();
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });

  it("arquivo no lugar do texto das observações conta como vazio, não quebra", async () => {
    dobles.findUnique.mockResolvedValue(linha({ observacoes: "antiga" }));
    const r = await atualizarProspeccao(
      INICIAL,
      formulario({ id: ID, proximoContatoEm: "", observacoes: new File(["x"], "obs.txt") }),
    );
    expect(r.ok).toBe(true);
    expect(dobles.updateMany.mock.calls[0][0].data.observacoes).toBeNull();
  });
});
