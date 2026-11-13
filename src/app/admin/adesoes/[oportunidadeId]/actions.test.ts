import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Registro e desfazimento da adesão pelo admin, sem banco: a sessão, a permissão, a leitura dos
 * dados e a transação são trocadas por dublês. Cobre a ordem das checagens (sessão, permissão,
 * estado da oportunidade, limites do art. 86) e a gravação "tudo ou nada".
 */
const d = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  exigirPermissaoDe: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  carregarParaRegistro: vi.fn(),
  transaction: vi.fn(),
  saldoUpdateMany: vi.fn(),
  saldoUpdate: vi.fn(),
  adesaoItemCreate: vi.fn(),
  adesaoItemFindMany: vi.fn(),
  adesaoItemDeleteMany: vi.fn(),
  oportunidadeUpdateMany: vi.fn(),
  oportunidadeUpdate: vi.fn(),
  oportunidadeFindUnique: vi.fn(),
  liquidacaoCount: vi.fn(),
  pontoFocalFindFirst: vi.fn(),
  interacaoCreate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: d.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: d.redirect }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: d.adminIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: d.registrarAuditoria }));
vi.mock("@/lib/permissoes-db", () => ({ exigirPermissaoDe: d.exigirPermissaoDe }));
vi.mock("@/lib/registrar-adesao-db", () => ({ carregarParaRegistro: d.carregarParaRegistro }));
vi.mock("@/lib/feriados-db", () => ({ carregarFeriadosExtras: async () => new Set<string>() }));
vi.mock("@/lib/feriados-db", () => ({ carregarFeriadosExtras: async () => new Set<string>() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: d.transaction } }));

import { desfazerRegistroDeAdesao, registrarAdesaoPeloAdmin } from "./actions";

const OP = "cmop000000000000000001";
const ESTADO = {};

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

function dados(oportunidade: Record<string, unknown> = {}, itens?: unknown[]) {
  return {
    oportunidade: {
      id: OP,
      ataId: "ata1",
      entidadeAlvoId: "ent1",
      estagio: "em_negociacao",
      expirada: false,
      municipio: "Rio Verde",
      uf: "GO",
      ataNumero: "12/2026",
      ataObjeto: "Material de escritório",
      declaradaEm: new Date("2026-11-10T12:00:00Z"),
      percentualContrato: "0.0500",
      valorAderido: null,
      ...oportunidade,
    },
    itens: itens ?? [
      { itemId: "i1", descricao: "Papel sulfite A4", unidade: "Caixa", quantidadeRegistrada: 1000, valorUnitario: "25.90", consumidoNoTotal: 0, consumidoPeloMunicipio: 0 },
      { itemId: "i2", descricao: "Caneta azul", unidade: "Un", quantidadeRegistrada: 2000, valorUnitario: "1.50", consumidoNoTotal: 0, consumidoPeloMunicipio: 0 },
    ],
  };
}

const tx = {
  saldo: { updateMany: d.saldoUpdateMany, update: d.saldoUpdate },
  adesaoItem: { create: d.adesaoItemCreate, findMany: d.adesaoItemFindMany, deleteMany: d.adesaoItemDeleteMany },
  oportunidadeVenda: { updateMany: d.oportunidadeUpdateMany, update: d.oportunidadeUpdate, findUnique: d.oportunidadeFindUnique },
  liquidacao: { count: d.liquidacaoCount },
  pontoFocal: { findFirst: d.pontoFocalFindFirst },
  interacaoPontoFocal: { create: d.interacaoCreate },
};

function nadaGravado() {
  expect(d.transaction).not.toHaveBeenCalled();
  expect(d.registrarAuditoria).not.toHaveBeenCalled();
  expect(d.revalidatePath).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  d.adminIdLogado.mockResolvedValue("adm1");
  d.exigirPermissaoDe.mockResolvedValue(undefined);
  d.carregarParaRegistro.mockResolvedValue(dados());
  d.transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  d.saldoUpdateMany.mockResolvedValue({ count: 1 });
  d.adesaoItemCreate.mockResolvedValue({});
  d.oportunidadeUpdateMany.mockResolvedValue({ count: 1 });
  d.pontoFocalFindFirst.mockResolvedValue({ id: "pf1" });
  d.interacaoCreate.mockResolvedValue({});
  d.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
});

describe("registrarAdesaoPeloAdmin: sessão e permissão primeiro", () => {
  it("sem sessão vai para o login e não lê nada", async () => {
    d.adminIdLogado.mockResolvedValue(null);
    await expect(registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "10" }))).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(d.carregarParaRegistro).not.toHaveBeenCalled();
    nadaGravado();
  });

  it("sem a permissão de registrar para antes de ler a oportunidade", async () => {
    d.exigirPermissaoDe.mockRejectedValue(new Error("NEXT_REDIRECT:/admin?acesso=negado"));
    await expect(registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "10" }))).rejects.toThrow("NEXT_REDIRECT:/admin?acesso=negado");
    expect(d.exigirPermissaoDe).toHaveBeenCalledWith("adm1", "adesao.registrar", "admin.registrarAdesao");
    expect(d.carregarParaRegistro).not.toHaveBeenCalled();
    nadaGravado();
  });
});

describe("registrarAdesaoPeloAdmin: o que precisa estar pronto", () => {
  it.each(["", "x y", "a".repeat(65)])("id inválido (%s) é recusado antes do banco", async (id) => {
    const r = await registrarAdesaoPeloAdmin(id, ESTADO, formulario({ qtd_i1: "10" }));
    expect(r.erros).toEqual(["Oportunidade não encontrada."]);
    expect(d.carregarParaRegistro).not.toHaveBeenCalled();
  });

  it("oportunidade inexistente", async () => {
    d.carregarParaRegistro.mockResolvedValue(null);
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "10" }));
    expect(r.erros).toEqual(["Oportunidade não encontrada."]);
    nadaGravado();
  });

  it("prazo vencido", async () => {
    d.carregarParaRegistro.mockResolvedValue(dados({ expirada: true }));
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "10" }));
    expect(r.erros?.[0]).toMatch(/prazo/);
    nadaGravado();
  });

  it("já registrada: ajuste é com o jurídico", async () => {
    d.carregarParaRegistro.mockResolvedValue(dados({ estagio: "aderiu" }));
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "10" }));
    expect(r.erros?.[0]).toMatch(/já está registrada/);
    nadaGravado();
  });

  it("sem a declaração de conformidade do jurídico não registra", async () => {
    d.carregarParaRegistro.mockResolvedValue(dados({ declaradaEm: null }));
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "10" }));
    expect(r.erros?.[0]).toMatch(/declaração de conformidade do jurídico/);
    nadaGravado();
  });

  it("sem contrato de intermediação na ata não registra", async () => {
    d.carregarParaRegistro.mockResolvedValue(dados({ percentualContrato: null }));
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "10" }));
    expect(r.erros?.[0]).toMatch(/contrato de intermediação/);
    nadaGravado();
  });
});

describe("registrarAdesaoPeloAdmin: quantidades e limites do art. 86", () => {
  it("nenhum item informado", async () => {
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ observacoes: "x" }));
    expect(r.erros).toEqual(["Informe a quantidade aderida de pelo menos um item."]);
    nadaGravado();
  });

  it("quantidade que não é inteiro positivo é recusada", async () => {
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "2,5" }));
    expect(r.erros?.[0]).toMatch(/número inteiro/);
    nadaGravado();
  });

  it("passou de 50% do registrado para o município: recusa e não grava nada", async () => {
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "501", qtd_i2: "10" }));
    expect(r.erros?.[0]).toContain("no máximo 500");
    nadaGravado();
  });

  it("o total de todos os órgãos passa de 200%: recusa", async () => {
    d.carregarParaRegistro.mockResolvedValue(
      dados({}, [{ itemId: "i1", descricao: "Papel", unidade: "Cx", quantidadeRegistrada: 1000, valorUnitario: "25.90", consumidoNoTotal: 1990, consumidoPeloMunicipio: 0 }]),
    );
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "100" }));
    expect(r.erros?.[0]).toContain("200% do registrado");
    nadaGravado();
  });

  it("quando recusa, devolve o que foi digitado para o formulário repor (e só os campos de quantidade e a observação)", async () => {
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "501", qtd_i2: "", observacoes: "anotação", outro: "lixo" }));
    expect(r.erros?.[0]).toContain("no máximo 500");
    expect(r.valores).toEqual({ quantidades: { i1: "501" }, observacoes: "anotação", nonce: expect.any(String) });
    // Cada resposta traz um nonce novo, para a tela remontar os campos.
    const r2 = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "501" }));
    expect(r2.valores?.nonce).not.toBe(r.valores?.nonce);
  });

  it("campo de item que não é da ata é ignorado: só entram os itens da própria ata", async () => {
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "10", qtd_outro: "5" }));
    // O formulário só lê os campos dos itens da ata: "qtd_outro" é ignorado, e o registro segue com o que é da ata.
    expect(r.erros).toBeUndefined();
    expect(d.adesaoItemCreate).toHaveBeenCalledTimes(1);
  });
});

describe("registrarAdesaoPeloAdmin: gravação", () => {
  it("grava tudo numa transação: saldo, quantidades, estágio Aderiu, valor calculado e histórico", async () => {
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "100", qtd_i2: "400", observacoes: "  pedido assinado  " }));

    expect(r).toEqual({ ok: true });
    expect(d.transaction).toHaveBeenCalledTimes(1);
    expect(d.saldoUpdateMany).toHaveBeenCalledTimes(2);
    expect(d.saldoUpdateMany.mock.calls[0][0]).toEqual({
      where: { itemId: "i1", quantidadeConsumida: { lte: 1900 } },
      data: { quantidadeConsumida: { increment: 100 } },
    });
    expect(d.adesaoItemCreate.mock.calls.map((c) => c[0].data)).toEqual([
      { oportunidadeId: OP, itemId: "i1", quantidade: 100, registradoPor: "admin:adm1" },
      { oportunidadeId: OP, itemId: "i2", quantidade: 400, registradoPor: "admin:adm1" },
    ]);
    const { where, data } = d.oportunidadeUpdateMany.mock.calls[0][0];
    expect(where).toEqual({
      id: OP,
      estagio: { not: "aderiu" },
      expiradaEm: null,
      instrucao: { is: { declaracaoEm: { not: null } } },
    });
    // 100 × 25,90 + 400 × 1,50 = 2.590,00 + 600,00
    expect(data).toEqual({
      estagio: "aderiu",
      valorAderido: "3190.00",
      percentualComissao: "0.0500",
      prazoEm: null,
      observacoes: "pedido assinado",
    });
    expect(d.interacaoCreate).toHaveBeenCalledWith({
      data: { pontoFocalId: "pf1", ataId: "ata1", resultado: "Converteu", observacao: "pedido assinado" },
    });
    expect(d.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:adm1",
      acao: "admin.registrarAdesao",
      alvo: OP,
      detalhe: "2 item(ns); valor aderido R$ 3190.00",
    });
    expect(d.revalidatePath).toHaveBeenCalledWith("/admin/adesoes");
    expect(d.revalidatePath).toHaveBeenCalledWith(`/admin/adesoes/${OP}`);
    expect(d.revalidatePath).toHaveBeenCalledWith("/vendedor/atas/ata1");
  });

  it("o valor aderido nunca vem do formulário", async () => {
    await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "10", valorAderido: "999999", percentualComissao: "0.9", estagio: "recusado" }));
    const { data } = d.oportunidadeUpdateMany.mock.calls[0][0];
    expect(data.valorAderido).toBe("259.00");
    expect(data.percentualComissao).toBe("0.0500");
    expect(data.estagio).toBe("aderiu");
  });

  it("sem contato ativo no município registra a adesão e só não cria o histórico de contato", async () => {
    d.pontoFocalFindFirst.mockResolvedValue(null);
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "10" }));
    expect(r).toEqual({ ok: true });
    expect(d.interacaoCreate).not.toHaveBeenCalled();
  });

  it("o saldo mudou entre a leitura e a gravação: nada é registrado e a pessoa é avisada", async () => {
    d.saldoUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "10", qtd_i2: "10" }));
    expect(r.erros?.[0]).toMatch(/Caneta azul.*saldo da ata mudou/);
    // A transação lança: o banco desfaz o que veio antes; auditoria e revalidação não rodam.
    expect(d.registrarAuditoria).not.toHaveBeenCalled();
    expect(d.revalidatePath).not.toHaveBeenCalled();
  });

  it("a oportunidade mudou no meio (declaração revogada, prazo vencido, já aderida): nada é registrado", async () => {
    d.oportunidadeUpdateMany.mockResolvedValue({ count: 0 });
    const r = await registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "10" }));
    expect(r.erros?.[0]).toMatch(/mudou enquanto você registrava/);
    expect(d.interacaoCreate).not.toHaveBeenCalled();
    expect(d.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("erro inesperado do banco não é escondido", async () => {
    d.saldoUpdateMany.mockRejectedValue(new Error("banco indisponível"));
    await expect(registrarAdesaoPeloAdmin(OP, ESTADO, formulario({ qtd_i1: "10" }))).rejects.toThrow("banco indisponível");
  });
});

describe("desfazerRegistroDeAdesao", () => {
  beforeEach(() => {
    d.oportunidadeFindUnique.mockResolvedValue({ id: OP, ataId: "ata1", estagio: "aderiu" });
    d.liquidacaoCount.mockResolvedValue(0);
    d.adesaoItemFindMany.mockResolvedValue([
      { itemId: "i1", quantidade: 100 },
      { itemId: "i2", quantidade: 400 },
    ]);
    d.saldoUpdate.mockResolvedValue({});
    d.adesaoItemDeleteMany.mockResolvedValue({ count: 2 });
    d.oportunidadeUpdate.mockResolvedValue({});
  });

  it("sem sessão vai para o login", async () => {
    d.adminIdLogado.mockResolvedValue(null);
    await expect(desfazerRegistroDeAdesao(OP)).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    nadaGravado();
  });

  it("exige a permissão do jurídico (adesao.declarar), não a de registrar", async () => {
    d.exigirPermissaoDe.mockRejectedValue(new Error("NEXT_REDIRECT:/admin?acesso=negado"));
    await expect(desfazerRegistroDeAdesao(OP)).rejects.toThrow("NEXT_REDIRECT:/admin?acesso=negado");
    expect(d.exigirPermissaoDe).toHaveBeenCalledWith("adm1", "adesao.declarar", "admin.desfazerRegistroAdesao");
    nadaGravado();
  });

  it("devolve ao saldo, apaga as quantidades e volta para Em negociação", async () => {
    const r = await desfazerRegistroDeAdesao(OP);

    expect(r).toEqual({ ok: true });
    expect(d.saldoUpdate.mock.calls.map((c) => c[0])).toEqual([
      { where: { itemId: "i1" }, data: { quantidadeConsumida: { decrement: 100 } } },
      { where: { itemId: "i2" }, data: { quantidadeConsumida: { decrement: 400 } } },
    ]);
    expect(d.adesaoItemDeleteMany).toHaveBeenCalledWith({ where: { oportunidadeId: OP } });
    const { data } = d.oportunidadeUpdate.mock.calls[0][0];
    expect(data).toMatchObject({ estagio: "em_negociacao", valorAderido: null, percentualComissao: null });
    expect(data.prazoEm).toBeInstanceOf(Date);
    expect(d.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:adm1",
      acao: "admin.desfazerRegistroAdesao",
      alvo: OP,
      detalhe: "2 item(ns) devolvido(s) ao saldo",
    });
  });

  it("oportunidade que não está aderida não é mexida", async () => {
    d.oportunidadeFindUnique.mockResolvedValue({ id: OP, ataId: "ata1", estagio: "em_negociacao" });
    const r = await desfazerRegistroDeAdesao(OP);
    expect(r.erros?.[0]).toMatch(/não está registrada/);
    expect(d.saldoUpdate).not.toHaveBeenCalled();
    expect(d.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("com liquidação em cima da adesão não desfaz", async () => {
    d.liquidacaoCount.mockResolvedValue(2);
    const r = await desfazerRegistroDeAdesao(OP);
    expect(r.erros?.[0]).toContain("2 liquidação(ões)");
    expect(d.saldoUpdate).not.toHaveBeenCalled();
    expect(d.adesaoItemDeleteMany).not.toHaveBeenCalled();
    expect(d.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("oportunidade inexistente e id inválido", async () => {
    d.oportunidadeFindUnique.mockResolvedValue(null);
    expect((await desfazerRegistroDeAdesao(OP)).erros).toEqual(["Oportunidade não encontrada."]);
    expect((await desfazerRegistroDeAdesao("x y")).erros).toEqual(["Oportunidade não encontrada."]);
  });
});
