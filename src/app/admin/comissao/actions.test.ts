import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As ações das faixas de comissão sugerida, testadas sem banco: o Prisma, a
 * sessão e a auditoria são trocados por dublês, e o que se confere é o que a
 * action manda para eles (quem pode chamar, o que é validado, o que é gravado
 * e quando a auditoria é escrita).
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: dobles.redirect }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    faixaComissao: {
      findUnique: dobles.findUnique,
      create: dobles.create,
      updateMany: dobles.updateMany,
      deleteMany: dobles.deleteMany,
    },
  },
}));

import { alternarFaixa, atualizarFaixa, criarFaixa, removerFaixa } from "./actions";

const ID = "cm1abc23d0000xyz98765432";
const INICIAL = {};

function formulario(campos: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

function nenhumaEscritaNoBanco() {
  expect(dobles.create).not.toHaveBeenCalled();
  expect(dobles.updateMany).not.toHaveBeenCalled();
  expect(dobles.deleteMany).not.toHaveBeenCalled();
  expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
}

/** Linha como o Prisma devolve: Decimal vira algo que Number() entende. */
function linha(extra: Partial<{ valorMinimo: string; percentual: string; descricao: string | null; ativo: boolean }> = {}) {
  return { valorMinimo: "100000.00", percentual: "0.0500", descricao: null, ativo: true, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.adminIdLogado.mockResolvedValue("admin1");
  // Como o redirect de verdade: interrompe a action lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.findUnique.mockResolvedValue(linha());
  dobles.create.mockResolvedValue({ id: ID });
  dobles.updateMany.mockResolvedValue({ count: 1 });
  dobles.deleteMany.mockResolvedValue({ count: 1 });
});

describe("sem admin logado nada acontece", () => {
  it.each([
    ["criarFaixa", criarFaixa, { valorMinimo: "100000", percentual: "5" }],
    ["atualizarFaixa", atualizarFaixa, { id: ID, percentual: "5" }],
    ["alternarFaixa", alternarFaixa, { id: ID, ativar: "0" }],
    ["removerFaixa", removerFaixa, { id: ID }],
  ])("%s manda para o login e não toca no banco", async (_nome, acao, campos) => {
    dobles.adminIdLogado.mockResolvedValue(null);
    await expect(acao(INICIAL, formulario(campos))).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["criarFaixa", criarFaixa],
    ["atualizarFaixa", atualizarFaixa],
    ["alternarFaixa", alternarFaixa],
    ["removerFaixa", removerFaixa],
  ])("%s confere a sessão antes de ler qualquer coisa do formulário", async (_nome, acao) => {
    dobles.adminIdLogado.mockResolvedValue(null);
    // Requisição montada à mão, sem FormData: tem de cair no login, não num erro de leitura.
    await expect(acao(INICIAL, {} as FormData)).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });
});

describe("criarFaixa", () => {
  beforeEach(() => {
    // Nenhuma faixa com esse valor ainda.
    dobles.findUnique.mockResolvedValue(null);
  });

  it("cadastra a faixa ativa, com o valor em texto exato e o percentual como fração, e audita", async () => {
    const r = await criarFaixa(
      INICIAL,
      formulario({ valorMinimo: "100.000,50", percentual: "5,25", descricao: "  faixa   de teste " }),
    );

    expect(r).toEqual({ ok: true });
    expect(dobles.findUnique).toHaveBeenCalledWith({ where: { valorMinimo: "100000.50" }, select: { ativo: true } });
    expect(dobles.create).toHaveBeenCalledTimes(1);
    expect(dobles.create).toHaveBeenCalledWith({
      data: {
        valorMinimo: "100000.50",
        percentual: "0.0525",
        descricao: "faixa de teste",
        ativo: true,
        atualizadoPorId: "admin1",
      },
      select: { id: true },
    });
    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "admin.criarFaixaComissao",
      alvo: ID,
      detalhe: "faixa a partir de R$ 100.000,50: 5,25%",
    });
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/comissao");
  });

  it("descrição vazia vira nula; valor zero é aceito (faixa que cobre qualquer ata)", async () => {
    const r = await criarFaixa(INICIAL, formulario({ valorMinimo: "0", percentual: "5", descricao: "   " }));
    expect(r.ok).toBe(true);
    const { data } = dobles.create.mock.calls[0][0];
    expect(data.valorMinimo).toBe("0.00");
    expect(data.descricao).toBeNull();
  });

  it("a auditoria não leva o texto da descrição", async () => {
    await criarFaixa(INICIAL, formulario({ valorMinimo: "1000", percentual: "5", descricao: "texto interno da equipe" }));
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).not.toContain("texto interno");
  });

  it("valor já cadastrado numa faixa ativa: recusa com mensagem clara, repõe o digitado e não grava", async () => {
    dobles.findUnique.mockResolvedValue({ ativo: true });
    const r = await criarFaixa(INICIAL, formulario({ valorMinimo: "100000", percentual: "6" }));
    expect(r.ok).toBeUndefined();
    expect(r.erro).toBe(
      "Já existe uma faixa ativa a partir de R$ 100.000,00. Edite essa faixa na tabela ou escolha outro valor.",
    );
    expect(r.valores).toEqual({ valorMinimo: "100000", percentual: "6", descricao: "" });
    nenhumaEscritaNoBanco();
  });

  it("valor já cadastrado numa faixa INATIVA também é recusado (o valor é único)", async () => {
    dobles.findUnique.mockResolvedValue({ ativo: false });
    const r = await criarFaixa(INICIAL, formulario({ valorMinimo: "100000", percentual: "6" }));
    expect(r.erro).toMatch(/faixa inativa a partir de R\$ 100\.000,00/);
    nenhumaEscritaNoBanco();
  });

  it("corrida: a restrição única do banco (P2002) vira a mesma mensagem, sem auditar", async () => {
    dobles.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    const r = await criarFaixa(INICIAL, formulario({ valorMinimo: "100000", percentual: "6" }));
    expect(r.erro).toMatch(/Já existe uma faixa a partir de R\$ 100\.000,00/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("outro erro do banco não é engolido", async () => {
    dobles.create.mockRejectedValue(new Error("conexão caiu"));
    await expect(criarFaixa(INICIAL, formulario({ valorMinimo: "100000", percentual: "6" }))).rejects.toThrow(
      "conexão caiu",
    );
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it.each([
    ["valor vazio", { percentual: "5" }, /valor da ata/],
    ["valor ilegível", { valorMinimo: "cem mil", percentual: "5" }, /valor da ata/],
    ["valor negativo", { valorMinimo: "-100", percentual: "5" }, /valor da ata/],
    ["valor com 3 casas", { valorMinimo: "100,555", percentual: "5" }, /valor da ata/],
    ["valor grande demais para a coluna", { valorMinimo: "999.999.999.999.999,00", percentual: "5" }, /grande demais/],
    ["percentual vazio", { valorMinimo: "1000" }, /percentual/i],
    ["percentual ilegível", { valorMinimo: "1000", percentual: "cinco" }, /percentual/i],
    ["percentual com 3 casas", { valorMinimo: "1000", percentual: "5,125" }, /percentual/i],
    ["percentual zero", { valorMinimo: "1000", percentual: "0" }, /entre/],
    ["percentual acima do teto", { valorMinimo: "1000", percentual: "30,01" }, /entre/],
    ["percentual negativo", { valorMinimo: "1000", percentual: "-5" }, /percentual/i],
    ["descrição longa demais", { valorMinimo: "1000", percentual: "5", descricao: "x".repeat(161) }, /limite é 160/],
    ["arquivo no lugar do valor", { valorMinimo: new File(["1000"], "v.txt"), percentual: "5" }, /valor da ata/],
    ["arquivo no lugar do percentual", { valorMinimo: "1000", percentual: new File(["5"], "p.txt") }, /percentual/i],
  ])("%s é recusado antes de consultar o banco", async (_descricao, campos, mensagem) => {
    const r = await criarFaixa(INICIAL, formulario(campos));
    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(mensagem);
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });

  it("o teto de 30% e o piso de 0,01% passam", async () => {
    expect((await criarFaixa(INICIAL, formulario({ valorMinimo: "1000", percentual: "30" }))).ok).toBe(true);
    expect((await criarFaixa(INICIAL, formulario({ valorMinimo: "2000", percentual: "0,01" }))).ok).toBe(true);
    expect(dobles.create.mock.calls[0][0].data.percentual).toBe("0.3000");
    expect(dobles.create.mock.calls[1][0].data.percentual).toBe("0.0001");
  });
});

describe("atualizarFaixa", () => {
  it("muda o percentual e a descrição, marca quem mexeu e audita só o que mudou (sem o texto)", async () => {
    const r = await atualizarFaixa(INICIAL, formulario({ id: ID, percentual: "6,5", descricao: "nova descrição" }));

    expect(r).toEqual({ ok: true });
    expect(dobles.updateMany).toHaveBeenCalledTimes(1);
    expect(dobles.updateMany).toHaveBeenCalledWith({
      where: { id: ID },
      data: { percentual: "0.0650", descricao: "nova descrição", atualizadoPorId: "admin1" },
    });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "admin.atualizarFaixaComissao",
      alvo: ID,
      detalhe: "faixa a partir de R$ 100.000,00: percentual 5% → 6,5%; descrição atualizada",
    });
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).not.toContain("nova descrição");
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/comissao");
  });

  it("mudando só a descrição, não toca no percentual", async () => {
    dobles.findUnique.mockResolvedValue(linha({ descricao: "antiga" }));
    await atualizarFaixa(INICIAL, formulario({ id: ID, percentual: "5", descricao: "outra" }));
    const { data } = dobles.updateMany.mock.calls[0][0];
    expect(data).toEqual({ descricao: "outra", atualizadoPorId: "admin1" });
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe(
      "faixa a partir de R$ 100.000,00: descrição atualizada",
    );
  });

  it("descrição em branco apaga a descrição", async () => {
    dobles.findUnique.mockResolvedValue(linha({ descricao: "antiga" }));
    await atualizarFaixa(INICIAL, formulario({ id: ID, percentual: "5", descricao: "  " }));
    expect(dobles.updateMany.mock.calls[0][0].data.descricao).toBeNull();
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toContain("descrição removida");
  });

  it("nada mudou (mesmo percentual escrito de outro jeito): não grava nem audita", async () => {
    dobles.findUnique.mockResolvedValue(linha({ percentual: "0.0525", descricao: "igual" }));
    const r = await atualizarFaixa(INICIAL, formulario({ id: ID, percentual: "5.25%", descricao: " igual " }));
    expect(r).toEqual({ ok: true, aviso: "Nada mudou." });
    nenhumaEscritaNoBanco();
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
  });

  it("faixa que não existe mais: avisa e não grava", async () => {
    dobles.findUnique.mockResolvedValue(null);
    const r = await atualizarFaixa(INICIAL, formulario({ id: ID, percentual: "5" }));
    expect(r.erro).toMatch(/não existe mais/);
    nenhumaEscritaNoBanco();
  });

  it("apagada no meio do caminho (nenhuma linha atualizada): avisa e não audita", async () => {
    dobles.updateMany.mockResolvedValue({ count: 0 });
    const r = await atualizarFaixa(INICIAL, formulario({ id: ID, percentual: "7" }));
    expect(r.erro).toMatch(/não existe mais/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it.each([
    ["percentual ilegível", "abc", /percentual/i],
    ["percentual zero", "0", /entre/],
    ["percentual acima do teto", "31", /entre/],
    ["percentual com 3 casas", "5,555", /percentual/i],
  ])("%s é recusado, repõe o digitado e não grava", async (_descricao, percentual, mensagem) => {
    const r = await atualizarFaixa(INICIAL, formulario({ id: ID, percentual, descricao: "d" }));
    expect(r.erro).toMatch(mensagem);
    expect(r.valores).toEqual({ percentual, descricao: "d" });
    nenhumaEscritaNoBanco();
  });

  it("descrição longa demais é recusada antes de consultar o banco", async () => {
    const r = await atualizarFaixa(INICIAL, formulario({ id: ID, percentual: "5", descricao: "x".repeat(200) }));
    expect(r.erro).toMatch(/limite é 160/);
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });

  it.each([
    ["vazio", {}],
    ["com espaço no meio", { id: "cm1abc23d0000 xyz98765432" }],
    ["com aspas e ponto e vírgula", { id: "x'; DROP TABLE faixas_comissao;--" }],
    ["curto demais", { id: "cm1" }],
    ["arquivo no lugar do texto", { id: new File([ID], "id.txt") }],
  ])("id %s é recusado antes de consultar o banco", async (_descricao, extra) => {
    const r = await atualizarFaixa(INICIAL, formulario({ percentual: "5", ...extra }));
    expect(r.erro).toMatch(/inválida/);
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });
});

describe("alternarFaixa", () => {
  it("desativa uma faixa ativa, só se ela ainda estiver ativa, e audita", async () => {
    const r = await alternarFaixa(INICIAL, formulario({ id: ID, ativar: "0" }));
    expect(r).toEqual({ ok: true });
    expect(dobles.updateMany).toHaveBeenCalledWith({
      where: { id: ID, ativo: true },
      data: { ativo: false, atualizadoPorId: "admin1" },
    });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "admin.desativarFaixaComissao",
      alvo: ID,
      detalhe: "faixa a partir de R$ 100.000,00: desativada",
    });
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/comissao");
  });

  it("ativa uma faixa inativa", async () => {
    dobles.findUnique.mockResolvedValue(linha({ ativo: false }));
    const r = await alternarFaixa(INICIAL, formulario({ id: ID, ativar: "1" }));
    expect(r.ok).toBe(true);
    expect(dobles.updateMany).toHaveBeenCalledWith({
      where: { id: ID, ativo: false },
      data: { ativo: true, atualizadoPorId: "admin1" },
    });
    expect(dobles.registrarAuditoria.mock.calls[0][0].acao).toBe("admin.ativarFaixaComissao");
  });

  it("já estava no estado pedido (duplo clique, duas abas): não grava nem audita", async () => {
    const r = await alternarFaixa(INICIAL, formulario({ id: ID, ativar: "1" }));
    expect(r).toEqual({ ok: true, aviso: "A faixa já estava ativa." });
    nenhumaEscritaNoBanco();

    dobles.findUnique.mockResolvedValue(linha({ ativo: false }));
    const r2 = await alternarFaixa(INICIAL, formulario({ id: ID, ativar: "0" }));
    expect(r2).toEqual({ ok: true, aviso: "A faixa já estava inativa." });
    nenhumaEscritaNoBanco();
  });

  it("o estado mudou no meio do caminho (nenhuma linha atualizada): avisa e não audita", async () => {
    dobles.updateMany.mockResolvedValue({ count: 0 });
    const r = await alternarFaixa(INICIAL, formulario({ id: ID, ativar: "0" }));
    expect(r.erro).toMatch(/mudou enquanto/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("faixa que não existe mais: avisa e não grava", async () => {
    dobles.findUnique.mockResolvedValue(null);
    const r = await alternarFaixa(INICIAL, formulario({ id: ID, ativar: "0" }));
    expect(r.erro).toMatch(/não existe mais/);
    nenhumaEscritaNoBanco();
  });

  it.each([
    ["ausente", {}],
    ["texto livre", { ativar: "true" }],
    ["número fora do par", { ativar: "2" }],
    ["arquivo no lugar do texto", { ativar: new File(["1"], "a.txt") }],
  ])("estado de destino %s é recusado antes de consultar o banco", async (_descricao, extra) => {
    const r = await alternarFaixa(INICIAL, formulario({ id: ID, ...extra }));
    expect(r.erro).toBeTruthy();
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });

  it("id fora da forma de cuid é recusado antes de consultar o banco", async () => {
    const r = await alternarFaixa(INICIAL, formulario({ id: "x'; DROP--", ativar: "0" }));
    expect(r.erro).toMatch(/inválida/);
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });
});

describe("removerFaixa", () => {
  it("apaga a faixa e audita o valor e o percentual removidos", async () => {
    const r = await removerFaixa(INICIAL, formulario({ id: ID }));
    expect(r).toEqual({ ok: true });
    expect(dobles.deleteMany).toHaveBeenCalledWith({ where: { id: ID } });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "admin.removerFaixaComissao",
      alvo: ID,
      detalhe: "faixa a partir de R$ 100.000,00: 5% removida",
    });
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/comissao");
  });

  it("faixa que já não existe: responde sem erro e não audita", async () => {
    dobles.findUnique.mockResolvedValue(null);
    const r = await removerFaixa(INICIAL, formulario({ id: ID }));
    expect(r).toEqual({ ok: true, aviso: "Esta faixa já não existe." });
    expect(dobles.deleteMany).not.toHaveBeenCalled();
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("apagada por outra pessoa no meio do caminho (nenhuma linha removida): não audita", async () => {
    dobles.deleteMany.mockResolvedValue({ count: 0 });
    const r = await removerFaixa(INICIAL, formulario({ id: ID }));
    expect(r.aviso).toBe("Esta faixa já não existe.");
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it.each([
    ["vazio", {}],
    ["com aspas", { id: "x'; DROP TABLE faixas_comissao;--" }],
    ["maiúsculas", { id: "CM1ABC23D0000XYZ98765432" }],
    ["arquivo no lugar do texto", { id: new File([ID], "id.txt") }],
  ])("id %s é recusado antes de consultar o banco", async (_descricao, campos) => {
    const r = await removerFaixa(INICIAL, formulario(campos));
    expect(r.erro).toMatch(/inválida/);
    expect(dobles.findUnique).not.toHaveBeenCalled();
    nenhumaEscritaNoBanco();
  });
});
