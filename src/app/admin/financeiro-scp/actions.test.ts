import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As ações do financeiro da SCP, testadas sem banco: a sessão, o Prisma, a
 * auditoria e o redirect/notFound são trocados por dublês, mas a TRAVA DE ACESSO
 * (src/lib/acesso-financeiro.ts) roda de verdade, para provar a ligação: sem
 * sessão, sem permissão do financeiro ou sem 2FA, nenhuma ação lê o formulário
 * nem toca no banco do financeiro. O que se confere depois é o que cada ação
 * valida, grava e audita. Só dados fictícios ("Sócio A", "Sócio B", 60% e 40%,
 * valores redondos de teste, ids de mentira).
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
  adminFindUnique: vi.fn(),
  logFindFirst: vi.fn(),
  socioFindFirst: vi.fn(),
  socioFindUnique: vi.fn(),
  socioFindMany: vi.fn(),
  socioCreate: vi.fn(),
  socioUpdateMany: vi.fn(),
  socioDeleteMany: vi.fn(),
  partFindFirst: vi.fn(),
  partFindMany: vi.fn(),
  partCount: vi.fn(),
  partUpdate: vi.fn(),
  partCreateMany: vi.fn(),
  despCreate: vi.fn(),
  despFindUnique: vi.fn(),
  despUpdateMany: vi.fn(),
  despDeleteMany: vi.fn(),
  despCount: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: dobles.redirect, notFound: dobles.notFound }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: { findUnique: dobles.adminFindUnique },
    logAuditoria: { findFirst: dobles.logFindFirst },
    socioScp: {
      findFirst: dobles.socioFindFirst,
      findUnique: dobles.socioFindUnique,
      findMany: dobles.socioFindMany,
      create: dobles.socioCreate,
      updateMany: dobles.socioUpdateMany,
      deleteMany: dobles.socioDeleteMany,
    },
    participacaoScp: {
      findFirst: dobles.partFindFirst,
      findMany: dobles.partFindMany,
      count: dobles.partCount,
      update: dobles.partUpdate,
      createMany: dobles.partCreateMany,
    },
    despesaScp: {
      create: dobles.despCreate,
      findUnique: dobles.despFindUnique,
      updateMany: dobles.despUpdateMany,
      deleteMany: dobles.despDeleteMany,
      count: dobles.despCount,
    },
    $transaction: dobles.transaction,
  },
}));

import {
  alternarSocio,
  atualizarDespesa,
  criarDespesa,
  criarSocio,
  definirParticipacoes,
  removerDespesa,
  removerSocio,
} from "./actions";

const SOCIO_A = "csocioaaaaaaaaaaaaaaaaaa";
const SOCIO_B = "csociobbbbbbbbbbbbbbbbbb";
const SOCIO_C = "csocioccccccccccccccccc";
const DESPESA = "cdespesaaaaaaaaaaaaaaaaa";
const INICIAL = {};
const CAMINHOS = ["/admin/financeiro-scp", "/admin/financeiro-scp/demonstrativo"];

type Acao = (estado: unknown, formData: FormData) => Promise<unknown>;

function formulario(campos: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

/** Formulário da divisão: um par socioId/percentual por sócio, na ordem dada. */
function formularioDivisao(desde: string, pares: [string, string][]): FormData {
  const f = new FormData();
  f.set("vigenteDesde", desde);
  for (const [id, percentual] of pares) {
    f.append("socioId", id);
    f.append("percentual", percentual);
  }
  return f;
}

/** Decimal do Prisma: só expõe toString. */
const decimal = (texto: string) => ({ toString: () => texto });
const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);

/** Nada do financeiro foi consultado nem gravado, e nada foi auditado além do que a trava faz. */
function nenhumaConsultaFinanceira() {
  for (const nome of [
    "socioFindFirst",
    "socioFindUnique",
    "socioFindMany",
    "socioCreate",
    "socioUpdateMany",
    "socioDeleteMany",
    "partFindFirst",
    "partFindMany",
    "partCount",
    "partUpdate",
    "partCreateMany",
    "despCreate",
    "despFindUnique",
    "despUpdateMany",
    "despDeleteMany",
    "despCount",
    "transaction",
  ] as const) {
    expect(dobles[nome], nome).not.toHaveBeenCalled();
  }
}

function nenhumaEscrita() {
  for (const nome of [
    "socioCreate",
    "socioUpdateMany",
    "socioDeleteMany",
    "partUpdate",
    "partCreateMany",
    "despCreate",
    "despUpdateMany",
    "despDeleteMany",
  ] as const) {
    expect(dobles[nome], nome).not.toHaveBeenCalled();
  }
  expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  expect(dobles.revalidatePath).not.toHaveBeenCalled();
}

function telasAtualizadas() {
  for (const caminho of CAMINHOS) expect(dobles.revalidatePath).toHaveBeenCalledWith(caminho);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Como no Next: redirect e notFound interrompem a execução lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.notFound.mockImplementation(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  });
  dobles.adminIdLogado.mockResolvedValue("admin1");
  dobles.adminFindUnique.mockResolvedValue({ acessoFinanceiro: true, totpAtivo: true });
  // Já há uma visualização na última hora: a trava não grava "financeiro.visualizou" e a auditoria dos testes fica limpa.
  dobles.logFindFirst.mockResolvedValue({ id: "visualizacao-recente" });
  dobles.registrarAuditoria.mockResolvedValue(undefined);

  dobles.socioFindFirst.mockResolvedValue(null);
  dobles.socioFindUnique.mockResolvedValue({ ativo: true });
  dobles.socioFindMany.mockResolvedValue([]);
  dobles.socioCreate.mockResolvedValue({ id: SOCIO_A });
  dobles.socioUpdateMany.mockResolvedValue({ count: 1 });
  dobles.socioDeleteMany.mockResolvedValue({ count: 1 });
  dobles.partFindFirst.mockResolvedValue(null);
  dobles.partFindMany.mockResolvedValue([]);
  dobles.partCount.mockResolvedValue(0);
  dobles.partUpdate.mockResolvedValue({});
  dobles.partCreateMany.mockResolvedValue({ count: 0 });
  dobles.despCreate.mockResolvedValue({ id: DESPESA });
  dobles.despFindUnique.mockResolvedValue({
    data: dia("2026-11-05"),
    descricao: "Despesa de teste",
    categoria: null,
    valor: decimal("1234.56"),
    pagaPorSocioId: null,
  });
  dobles.despUpdateMany.mockResolvedValue({ count: 1 });
  dobles.despDeleteMany.mockResolvedValue({ count: 1 });
  dobles.despCount.mockResolvedValue(0);
  // A transação interativa roda a função com um "tx" que usa os mesmos dublês.
  dobles.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      socioScp: { findMany: dobles.socioFindMany },
      participacaoScp: { findMany: dobles.partFindMany, update: dobles.partUpdate, createMany: dobles.partCreateMany },
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

// ───────────────────────────── trava de acesso ─────────────────────────────

const ACOES: [string, Acao][] = [
  ["criarSocio", criarSocio as unknown as Acao],
  ["alternarSocio", alternarSocio as unknown as Acao],
  ["removerSocio", removerSocio as unknown as Acao],
  ["definirParticipacoes", definirParticipacoes as unknown as Acao],
  ["criarDespesa", criarDespesa as unknown as Acao],
  ["atualizarDespesa", atualizarDespesa as unknown as Acao],
  ["removerDespesa", removerDespesa as unknown as Acao],
];

describe("trava de acesso: vale para TODAS as ações, antes de ler o formulário e o banco", () => {
  it.each(ACOES)("%s sem sessão manda para /entrar (e nem lê o formulário: aceita até um objeto sem FormData)", async (_n, acao) => {
    dobles.adminIdLogado.mockResolvedValue(null);
    await expect(acao(INICIAL, {} as FormData)).rejects.toThrow("NEXT_REDIRECT:/entrar");
    nenhumaConsultaFinanceira();
    expect(dobles.adminFindUnique).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it.each(ACOES)("%s sem a permissão do financeiro responde 404, registra a tentativa e não toca no banco do financeiro", async (_n, acao) => {
    dobles.adminFindUnique.mockResolvedValue({ acessoFinanceiro: false, totpAtivo: true });
    await expect(acao(INICIAL, {} as FormData)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    nenhumaConsultaFinanceira();
    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "financeiro.acesso_negado",
      detalhe: "sem permissão",
    });
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(ACOES)("%s com a permissão mas sem 2FA manda para o perfil e não toca no banco do financeiro", async (_n, acao) => {
    dobles.adminFindUnique.mockResolvedValue({ acessoFinanceiro: true, totpAtivo: false });
    await expect(acao(INICIAL, {} as FormData)).rejects.toThrow("NEXT_REDIRECT:/admin/perfil");
    nenhumaConsultaFinanceira();
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "financeiro.acesso_negado",
      detalhe: "2FA não ativado",
    });
  });
});

// ───────────────────────────── sócios ─────────────────────────────

describe("criarSocio", () => {
  it("cadastra o sócio ativo, na ordem seguinte, e audita só o tipo (nunca o nome)", async () => {
    dobles.socioFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ ordem: 2 });
    const r = await criarSocio(INICIAL, formulario({ nome: "  Sócio   A ", tipo: "ostensivo" }));

    expect(r).toEqual({ ok: true });
    expect(dobles.socioFindFirst).toHaveBeenNthCalledWith(1, {
      where: { nome: { equals: "Sócio A", mode: "insensitive" } },
      select: { id: true },
    });
    expect(dobles.socioCreate).toHaveBeenCalledWith({
      data: { nome: "Sócio A", tipo: "ostensivo", ativo: true, ordem: 3 },
      select: { id: true },
    });
    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "financeiro.socio_criado",
      alvo: SOCIO_A,
      detalhe: "tipo: ostensivo",
    });
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).not.toContain("Sócio A");
    telasAtualizadas();
  });

  it("o primeiro sócio ganha a ordem 0", async () => {
    await criarSocio(INICIAL, formulario({ nome: "Sócio A", tipo: "participante" }));
    expect(dobles.socioCreate.mock.calls[0][0].data.ordem).toBe(0);
  });

  it("nome repetido (sem diferenciar maiúsculas): recusa, repõe o digitado e não grava", async () => {
    dobles.socioFindFirst.mockResolvedValueOnce({ id: SOCIO_B });
    const r = (await criarSocio(INICIAL, formulario({ nome: "sócio a", tipo: "participante" }))) as {
      erro?: string;
      valores?: unknown;
    };
    expect(r.erro).toBe("Já existe um sócio com esse nome.");
    expect(r.valores).toEqual({ nome: "sócio a", tipo: "participante" });
    nenhumaEscrita();
  });

  it.each([
    ["nome vazio", { nome: "   ", tipo: "participante" }, /nome do sócio/],
    ["nome de 121 caracteres", { nome: "x".repeat(121), tipo: "participante" }, /limite é 120/],
    ["tipo desconhecido", { nome: "Sócio A", tipo: "gerente" }, /ostensivo ou participante/],
    ["tipo ausente", { nome: "Sócio A" }, /ostensivo ou participante/],
    ["arquivo no lugar do nome", { nome: new File(["x"], "n.txt"), tipo: "participante" }, /nome do sócio/],
  ])("%s é recusado antes de consultar o banco", async (_n, campos, mensagem) => {
    const r = (await criarSocio(INICIAL, formulario(campos))) as { erro?: string; ok?: boolean };
    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(mensagem);
    expect(dobles.socioFindFirst).not.toHaveBeenCalled();
    nenhumaEscrita();
  });
});

describe("alternarSocio", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T15:00:00Z"));
  });

  it("desativa um sócio sem participação em vigor, só se ele ainda estiver ativo, e audita", async () => {
    const r = await alternarSocio(INICIAL, formulario({ id: SOCIO_A, ativar: "0" }));
    expect(r).toEqual({ ok: true });
    // "Em vigor" = sem fim, ou fim de hoje em diante (o dia de hoje é o de Brasília).
    expect(dobles.partFindFirst).toHaveBeenCalledWith({
      where: { socioId: SOCIO_A, OR: [{ vigenteAte: null }, { vigenteAte: { gte: dia("2026-10-26") } }] },
      select: { id: true },
    });
    expect(dobles.socioUpdateMany).toHaveBeenCalledWith({ where: { id: SOCIO_A, ativo: true }, data: { ativo: false } });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "financeiro.socio_desativado",
      alvo: SOCIO_A,
    });
    telasAtualizadas();
  });

  it("recusa desativar quem ainda tem participação em vigor (a partilha continuaria contando com ele)", async () => {
    dobles.partFindFirst.mockResolvedValue({ id: "p1" });
    const r = (await alternarSocio(INICIAL, formulario({ id: SOCIO_A, ativar: "0" }))) as { erro?: string };
    expect(r.erro).toMatch(/ainda tem participação em vigor/);
    nenhumaEscrita();
  });

  it("ativa um sócio inativo sem consultar participações", async () => {
    dobles.socioFindUnique.mockResolvedValue({ ativo: false });
    const r = await alternarSocio(INICIAL, formulario({ id: SOCIO_A, ativar: "1" }));
    expect(r).toEqual({ ok: true });
    expect(dobles.partFindFirst).not.toHaveBeenCalled();
    expect(dobles.socioUpdateMany).toHaveBeenCalledWith({ where: { id: SOCIO_A, ativo: false }, data: { ativo: true } });
    expect(dobles.registrarAuditoria.mock.calls[0][0].acao).toBe("financeiro.socio_ativado");
  });

  it("já estava no estado pedido (duplo clique, duas abas): não grava nem audita", async () => {
    const r = await alternarSocio(INICIAL, formulario({ id: SOCIO_A, ativar: "1" }));
    expect(r).toEqual({ ok: true, aviso: "O sócio já estava ativo." });
    nenhumaEscrita();

    dobles.socioFindUnique.mockResolvedValue({ ativo: false });
    const r2 = await alternarSocio(INICIAL, formulario({ id: SOCIO_A, ativar: "0" }));
    expect(r2).toEqual({ ok: true, aviso: "O sócio já estava inativo." });
    nenhumaEscrita();
  });

  it("o estado mudou no meio do caminho (nenhuma linha atualizada): avisa e não audita", async () => {
    dobles.socioUpdateMany.mockResolvedValue({ count: 0 });
    const r = (await alternarSocio(INICIAL, formulario({ id: SOCIO_A, ativar: "0" }))) as { erro?: string };
    expect(r.erro).toMatch(/mudou enquanto/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("sócio que não existe mais: avisa e não grava", async () => {
    dobles.socioFindUnique.mockResolvedValue(null);
    const r = (await alternarSocio(INICIAL, formulario({ id: SOCIO_A, ativar: "0" }))) as { erro?: string };
    expect(r.erro).toMatch(/não existe mais/);
    nenhumaEscrita();
  });

  it.each([
    ["id vazio", { ativar: "0" }],
    ["id com aspas", { id: "x'; DROP--", ativar: "0" }],
    ["destino ausente", { id: SOCIO_A }],
    ["destino em texto livre", { id: SOCIO_A, ativar: "true" }],
    ["arquivo no lugar do destino", { id: SOCIO_A, ativar: new File(["1"], "a.txt") }],
  ])("%s é recusado antes de consultar o banco", async (_n, campos) => {
    const r = (await alternarSocio(INICIAL, formulario(campos))) as { erro?: string };
    expect(r.erro).toBeTruthy();
    expect(dobles.socioFindUnique).not.toHaveBeenCalled();
    nenhumaEscrita();
  });
});

describe("removerSocio", () => {
  it("remove quem nunca teve participação nem despesa e audita", async () => {
    const r = await removerSocio(INICIAL, formulario({ id: SOCIO_A }));
    expect(r).toEqual({ ok: true });
    expect(dobles.partCount).toHaveBeenCalledWith({ where: { socioId: SOCIO_A } });
    expect(dobles.despCount).toHaveBeenCalledWith({ where: { pagaPorSocioId: SOCIO_A } });
    expect(dobles.socioDeleteMany).toHaveBeenCalledWith({ where: { id: SOCIO_A } });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "financeiro.socio_removido",
      alvo: SOCIO_A,
    });
    telasAtualizadas();
  });

  it.each([
    ["com participação", () => dobles.partCount.mockResolvedValue(1)],
    ["com despesa paga por ele", () => dobles.despCount.mockResolvedValue(1)],
  ])("sócio %s não pode ser removido (só desativado)", async (_n, preparar) => {
    dobles.socioFindUnique.mockResolvedValue({ id: SOCIO_A });
    preparar();
    const r = (await removerSocio(INICIAL, formulario({ id: SOCIO_A }))) as { erro?: string };
    expect(r.erro).toMatch(/não pode ser removido.*desative-o/);
    nenhumaEscrita();
  });

  it("participação criada no meio do caminho: a chave estrangeira do banco (P2003) vira a mesma mensagem, sem auditar", async () => {
    dobles.socioFindUnique.mockResolvedValue({ id: SOCIO_A });
    dobles.socioDeleteMany.mockRejectedValue(Object.assign(new Error("Foreign key constraint failed"), { code: "P2003" }));
    const r = (await removerSocio(INICIAL, formulario({ id: SOCIO_A }))) as { erro?: string };
    expect(r.erro).toMatch(/não pode ser removido/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("outro erro do banco não é engolido", async () => {
    dobles.socioFindUnique.mockResolvedValue({ id: SOCIO_A });
    dobles.socioDeleteMany.mockRejectedValue(new Error("conexão caiu"));
    await expect(removerSocio(INICIAL, formulario({ id: SOCIO_A }))).rejects.toThrow("conexão caiu");
  });

  it("sócio que já não existe (ou foi removido por outra pessoa): responde sem erro e não audita", async () => {
    dobles.socioFindUnique.mockResolvedValue(null);
    expect(await removerSocio(INICIAL, formulario({ id: SOCIO_A }))).toEqual({ ok: true, aviso: "Este sócio já não existe." });
    expect(dobles.socioDeleteMany).not.toHaveBeenCalled();

    dobles.socioFindUnique.mockResolvedValue({ id: SOCIO_A });
    dobles.socioDeleteMany.mockResolvedValue({ count: 0 });
    expect(await removerSocio(INICIAL, formulario({ id: SOCIO_A }))).toEqual({ ok: true, aviso: "Este sócio já não existe." });
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("id inválido é recusado antes de consultar o banco", async () => {
    const r = (await removerSocio(INICIAL, formulario({ id: "x'; DROP--" }))) as { erro?: string };
    expect(r.erro).toMatch(/inválido/);
    expect(dobles.socioFindUnique).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── divisão da partilha ─────────────────────────────

describe("definirParticipacoes", () => {
  /** Situação de partida: A 60% e B 40%, em vigor desde 01/01/2026. */
  function partirDe60e40() {
    dobles.socioFindMany.mockResolvedValue([
      { id: SOCIO_A, nome: "Sócio A", ativo: true },
      { id: SOCIO_B, nome: "Sócio B", ativo: true },
    ]);
    dobles.partFindMany.mockResolvedValue([
      { id: "p1", socioId: SOCIO_A, percentual: decimal("0.6000"), vigenteDesde: dia("2026-01-01"), vigenteAte: null },
      { id: "p2", socioId: SOCIO_B, percentual: decimal("0.4000"), vigenteDesde: dia("2026-01-01"), vigenteAte: null },
    ]);
  }

  it("60/40 → 50/50: encerra as duas no dia anterior, abre as novas, tudo numa transação serializável, e audita cada sócio", async () => {
    partirDe60e40();
    const r = await definirParticipacoes(
      INICIAL,
      formularioDivisao("2026-11-01", [
        [SOCIO_A, "50"],
        [SOCIO_B, "50"],
      ]),
    );

    expect(r).toEqual({ ok: true });
    expect(dobles.transaction).toHaveBeenCalledTimes(1);
    expect(dobles.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
    expect(dobles.partUpdate).toHaveBeenCalledTimes(2);
    expect(dobles.partUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { vigenteAte: dia("2026-10-31") } });
    expect(dobles.partUpdate).toHaveBeenCalledWith({ where: { id: "p2" }, data: { vigenteAte: dia("2026-10-31") } });
    expect(dobles.partCreateMany).toHaveBeenCalledTimes(1);
    expect(dobles.partCreateMany).toHaveBeenCalledWith({
      data: [
        { socioId: SOCIO_A, percentual: "0.5000", vigenteDesde: dia("2026-11-01") },
        { socioId: SOCIO_B, percentual: "0.5000", vigenteDesde: dia("2026-11-01") },
      ],
    });
    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(2);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "financeiro.participacao_alterada",
      alvo: SOCIO_A,
      detalhe: "a partir de 01/11/2026: 60% → 50%",
    });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "financeiro.participacao_alterada",
      alvo: SOCIO_B,
      detalhe: "a partir de 01/11/2026: 40% → 50%",
    });
    telasAtualizadas();
  });

  it("primeira divisão (nada cadastrado): abre as participações; em branco fica fora", async () => {
    dobles.socioFindMany.mockResolvedValue([
      { id: SOCIO_A, nome: "Sócio A", ativo: true },
      { id: SOCIO_B, nome: "Sócio B", ativo: true },
    ]);
    const r = await definirParticipacoes(
      INICIAL,
      formularioDivisao("2026-01-01", [
        [SOCIO_A, "100"],
        [SOCIO_B, ""],
      ]),
    );
    expect(r).toEqual({ ok: true });
    expect(dobles.partUpdate).not.toHaveBeenCalled();
    expect(dobles.partCreateMany).toHaveBeenCalledWith({
      data: [{ socioId: SOCIO_A, percentual: "1.0000", vigenteDesde: dia("2026-01-01") }],
    });
    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe("a partir de 01/01/2026: sem participação → 100%");
  });

  it("aceita vírgula e % no percentual (33,33 e 66,67%)", async () => {
    dobles.socioFindMany.mockResolvedValue([
      { id: SOCIO_A, nome: "Sócio A", ativo: true },
      { id: SOCIO_B, nome: "Sócio B", ativo: true },
    ]);
    const r = await definirParticipacoes(
      INICIAL,
      formularioDivisao("2026-01-01", [
        [SOCIO_A, "33,33"],
        [SOCIO_B, "66,67%"],
      ]),
    );
    expect(r).toEqual({ ok: true });
    const { data } = dobles.partCreateMany.mock.calls[0][0];
    expect(data.map((d: { percentual: string }) => d.percentual)).toEqual(["0.3333", "0.6667"]);
  });

  it("a soma não fecha 100% (60 + 30): recusa com a soma no texto, repõe o digitado e não grava nem audita", async () => {
    partirDe60e40();
    const r = (await definirParticipacoes(
      INICIAL,
      formularioDivisao("2026-11-01", [
        [SOCIO_A, "60"],
        [SOCIO_B, "30"],
      ]),
    )) as { erro?: string; valores?: unknown; ok?: boolean };

    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(/exatamente 100%.*90%/);
    expect(r.valores).toEqual({ vigenteDesde: "2026-11-01", percentuais: { [SOCIO_A]: "60", [SOCIO_B]: "30" } });
    expect(dobles.partUpdate).not.toHaveBeenCalled();
    expect(dobles.partCreateMany).not.toHaveBeenCalled();
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
  });

  it("nada mudou: avisa, não grava, não audita e não atualiza as telas", async () => {
    partirDe60e40();
    const r = await definirParticipacoes(
      INICIAL,
      formularioDivisao("2026-11-01", [
        [SOCIO_A, "60,00"],
        [SOCIO_B, "40%"],
      ]),
    );
    expect(r).toEqual({ ok: true, aviso: "Nada mudou." });
    nenhumaEscrita();
  });

  it("data que não vem depois da divisão mais recente é recusada", async () => {
    partirDe60e40();
    const r = (await definirParticipacoesComo("2026-01-01", "50", "50")) as { erro?: string };
    expect(r.erro).toContain("depois de 01/01/2026");
    nenhumaEscrita();
  });

  it("sócio inativo não ganha participação nova", async () => {
    dobles.socioFindMany.mockResolvedValue([
      { id: SOCIO_A, nome: "Sócio A", ativo: true },
      { id: SOCIO_B, nome: "Sócio B", ativo: false },
    ]);
    const r = (await definirParticipacoesComo("2026-11-01", "50", "50")) as { erro?: string };
    expect(r.erro).toBe("Sócio B está inativo. Reative o sócio antes de dar participação a ele.");
    nenhumaEscrita();
  });

  it.each([
    ["texto ilegível", "abc"],
    ["zero", "0"],
    ["acima de 100%", "100,01"],
    ["3 casas decimais", "33,333"],
    ["negativo", "-10"],
  ])("percentual com %s é recusado antes de abrir a transação", async (_n, texto) => {
    const r = (await definirParticipacoes(
      INICIAL,
      formularioDivisao("2026-11-01", [
        [SOCIO_A, texto],
        [SOCIO_B, "40"],
      ]),
    )) as { erro?: string; valores?: { percentuais: Record<string, string> } };
    expect(r.erro).toMatch(/entre 0,01 e 100/);
    expect(r.valores?.percentuais[SOCIO_A]).toBe(texto);
    expect(dobles.transaction).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it.each([
    ["data vazia", "", [[SOCIO_A, "100"]], /data em que a nova divisão começa/],
    ["data inexistente", "2026-02-30", [[SOCIO_A, "100"]], /data em que a nova divisão começa/],
    ["data depois de 2100", "2101-01-01", [[SOCIO_A, "100"]], /data em que a nova divisão começa/],
    ["nenhum sócio no formulário", "2026-11-01", [], /Formulário inválido/],
    ["id de sócio com aspas", "2026-11-01", [["x'; DROP--", "100"]], /Formulário inválido/],
    ["o mesmo sócio duas vezes", "2026-11-01", [[SOCIO_A, "50"], [SOCIO_A, "50"]], /Formulário inválido/],
  ] as [string, string, [string, string][], RegExp][])("%s é recusado antes de abrir a transação", async (_n, desde, pares, mensagem) => {
    const r = (await definirParticipacoes(INICIAL, formularioDivisao(desde, pares))) as { erro?: string };
    expect(r.erro).toMatch(mensagem);
    expect(dobles.transaction).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it("pares desencontrados (mais ids que percentuais) são recusados", async () => {
    const f = formularioDivisao("2026-11-01", [[SOCIO_A, "100"]]);
    f.append("socioId", SOCIO_B);
    const r = (await definirParticipacoes(INICIAL, f)) as { erro?: string };
    expect(r.erro).toMatch(/Formulário inválido/);
    expect(dobles.transaction).not.toHaveBeenCalled();
  });

  it("sócio que não existe no banco é recusado", async () => {
    dobles.socioFindMany.mockResolvedValue([{ id: SOCIO_A, nome: "Sócio A", ativo: true }]);
    const r = (await definirParticipacoes(INICIAL, formularioDivisao("2026-11-01", [[SOCIO_C, "100"]]))) as { erro?: string };
    expect(r.erro).toMatch(/Sócio não encontrado/);
    nenhumaEscrita();
  });

  it("duas pessoas ao mesmo tempo (P2034): mensagem clara, sem auditar; outro erro do banco não é engolido", async () => {
    partirDe60e40();
    dobles.transaction.mockRejectedValueOnce(Object.assign(new Error("Transaction failed"), { code: "P2034" }));
    const r = (await definirParticipacoesComo("2026-11-01", "50", "50")) as { erro?: string };
    expect(r.erro).toMatch(/Outra alteração aconteceu ao mesmo tempo/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();

    dobles.transaction.mockRejectedValueOnce(new Error("conexão caiu"));
    await expect(definirParticipacoesComo("2026-11-01", "50", "50")).rejects.toThrow("conexão caiu");
  });

  function definirParticipacoesComo(desde: string, a: string, b: string) {
    return definirParticipacoes(
      INICIAL,
      formularioDivisao(desde, [
        [SOCIO_A, a],
        [SOCIO_B, b],
      ]),
    );
  }
});

// ───────────────────────────── despesas ─────────────────────────────

const DESPESA_VALIDA = {
  data: "2026-11-05",
  valor: "1.234,56",
  descricao: "Despesa de teste",
  categoria: "",
  pagaPorSocioId: "",
};

describe("criarDespesa", () => {
  it("grava a despesa com o valor em texto exato, a data só-dia e quem lançou, e audita data e valor (sem a descrição)", async () => {
    const r = await criarDespesa(INICIAL, formulario(DESPESA_VALIDA));

    expect(r).toEqual({ ok: true });
    expect(dobles.despCreate).toHaveBeenCalledTimes(1);
    expect(dobles.despCreate).toHaveBeenCalledWith({
      data: {
        data: dia("2026-11-05"),
        descricao: "Despesa de teste",
        categoria: null,
        valor: "1234.56",
        pagaPorSocioId: null,
        criadoPorId: "admin1",
      },
      select: { id: true },
    });
    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "financeiro.despesa_criada",
      alvo: DESPESA,
      detalhe: "despesa de 05/11/2026: R$ 1.234,56",
    });
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).not.toContain("Despesa de teste");
    expect(dobles.socioFindUnique).not.toHaveBeenCalled();
    telasAtualizadas();
  });

  it("com categoria e quem pagou: confere se o sócio existe e grava", async () => {
    dobles.socioFindUnique.mockResolvedValue({ id: SOCIO_A });
    const r = await criarDespesa(INICIAL, formulario({ ...DESPESA_VALIDA, categoria: " Cat  X ", pagaPorSocioId: SOCIO_A }));
    expect(r).toEqual({ ok: true });
    expect(dobles.socioFindUnique).toHaveBeenCalledWith({ where: { id: SOCIO_A }, select: { id: true } });
    const { data } = dobles.despCreate.mock.calls[0][0];
    expect(data).toMatchObject({ categoria: "Cat X", pagaPorSocioId: SOCIO_A });
  });

  it("sócio escolhido que não existe mais: recusa e não grava", async () => {
    dobles.socioFindUnique.mockResolvedValue(null);
    const r = (await criarDespesa(INICIAL, formulario({ ...DESPESA_VALIDA, pagaPorSocioId: SOCIO_A }))) as { erro?: string };
    expect(r.erro).toMatch(/sócio escolhido não existe mais/);
    nenhumaEscrita();
  });

  it.each([
    ["valor zero", { valor: "0" }, /maior que zero/],
    ["valor negativo", { valor: "-5" }, /Valor inválido/],
    ["valor ilegível", { valor: "muito" }, /Valor inválido/],
    ["valor com 3 casas", { valor: "1,005" }, /Valor inválido/],
    ["valor vazio", { valor: "" }, /Informe o valor/],
    ["valor de R$ 100 bilhões", { valor: "100.000.000.000,00" }, /grande demais/],
    ["data inexistente", { data: "2026-02-30" }, /data válida/],
    ["data vazia", { data: "" }, /data válida/],
    ["descrição vazia", { descricao: "  " }, /Descreva/],
    ["descrição de 201 caracteres", { descricao: "x".repeat(201) }, /limite é 200/],
    ["categoria de 61 caracteres", { categoria: "x".repeat(61) }, /categoria tem 61/],
    ["quem pagou com aspas", { pagaPorSocioId: "x'; DROP--" }, /Sócio inválido/],
    ["arquivo no lugar do valor", { valor: new File(["10"], "v.txt") }, /Informe o valor/],
  ])("%s é recusado, repõe o digitado e não grava", async (_n, extra, mensagem) => {
    const r = (await criarDespesa(INICIAL, formulario({ ...DESPESA_VALIDA, ...extra }))) as {
      erro?: string;
      ok?: boolean;
      valores?: { descricao: string };
    };
    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(mensagem);
    expect(r.valores).toBeDefined();
    expect(dobles.socioFindUnique).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it("o teto passa (R$ 99.999.999.999,99) e o piso também (R$ 0,01)", async () => {
    expect(await criarDespesa(INICIAL, formulario({ ...DESPESA_VALIDA, valor: "99.999.999.999,99" }))).toEqual({ ok: true });
    expect(await criarDespesa(INICIAL, formulario({ ...DESPESA_VALIDA, valor: "0,01" }))).toEqual({ ok: true });
    expect(dobles.despCreate.mock.calls[0][0].data.valor).toBe("99999999999.99");
    expect(dobles.despCreate.mock.calls[1][0].data.valor).toBe("0.01");
  });
});

describe("atualizarDespesa", () => {
  const COM_ID = { ...DESPESA_VALIDA, id: DESPESA };

  it("muda só o valor: grava só o campo que mudou e audita o antes e o depois (valor e data)", async () => {
    const r = await atualizarDespesa(INICIAL, formulario({ ...COM_ID, valor: "1.500,00" }));
    expect(r).toEqual({ ok: true });
    expect(dobles.despUpdateMany).toHaveBeenCalledWith({ where: { id: DESPESA }, data: { valor: "1500.00" } });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "financeiro.despesa_alterada",
      alvo: DESPESA,
      detalhe: "despesa de 05/11/2026: valor R$ 1.234,56 → R$ 1.500,00",
    });
    telasAtualizadas();
  });

  it("muda data, descrição, categoria e quem pagou: tudo no mesmo update, e a trilha lista o que mudou sem copiar o texto", async () => {
    dobles.socioFindUnique.mockResolvedValue({ id: SOCIO_A });
    const r = await atualizarDespesa(
      INICIAL,
      formulario({ ...COM_ID, data: "2026-11-07", descricao: "Outra descrição", categoria: "Cat", pagaPorSocioId: SOCIO_A }),
    );
    expect(r).toEqual({ ok: true });
    expect(dobles.despUpdateMany).toHaveBeenCalledWith({
      where: { id: DESPESA },
      data: { data: dia("2026-11-07"), descricao: "Outra descrição", categoria: "Cat", pagaPorSocioId: SOCIO_A },
    });
    const detalhe = dobles.registrarAuditoria.mock.calls[0][0].detalhe as string;
    expect(detalhe).toBe(
      "despesa de 05/11/2026: data 05/11/2026 → 07/11/2026; descrição alterada; categoria alterada; quem pagou alterado",
    );
    expect(detalhe).not.toContain("Outra descrição");
  });

  it("nada mudou (mesmo valor escrito de outro jeito): não grava, não audita e não atualiza as telas", async () => {
    const r = await atualizarDespesa(INICIAL, formulario({ ...COM_ID, valor: "1234,56", descricao: "  Despesa   de teste " }));
    expect(r).toEqual({ ok: true, aviso: "Nada mudou." });
    nenhumaEscrita();
  });

  it("despesa que não existe mais: avisa e não grava", async () => {
    dobles.despFindUnique.mockResolvedValue(null);
    const r = (await atualizarDespesa(INICIAL, formulario({ ...COM_ID, valor: "10,00" }))) as { erro?: string };
    expect(r.erro).toMatch(/não existe mais/);
    nenhumaEscrita();
  });

  it("apagada no meio do caminho (nenhuma linha atualizada): avisa e não audita", async () => {
    dobles.despUpdateMany.mockResolvedValue({ count: 0 });
    const r = (await atualizarDespesa(INICIAL, formulario({ ...COM_ID, valor: "10,00" }))) as { erro?: string };
    expect(r.erro).toMatch(/não existe mais/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("sócio escolhido que não existe: recusa e não grava", async () => {
    dobles.socioFindUnique.mockResolvedValue(null);
    const r = (await atualizarDespesa(INICIAL, formulario({ ...COM_ID, pagaPorSocioId: SOCIO_A }))) as { erro?: string };
    expect(r.erro).toMatch(/sócio escolhido não existe mais/);
    nenhumaEscrita();
  });

  it.each([
    ["valor zero", { valor: "0" }, /maior que zero/],
    ["descrição longa demais", { descricao: "x".repeat(300) }, /limite é 200/],
    ["data inexistente", { data: "2026-13-01" }, /data válida/],
  ])("%s é recusado, repõe o digitado e não consulta o banco", async (_n, extra, mensagem) => {
    const r = (await atualizarDespesa(INICIAL, formulario({ ...COM_ID, ...extra }))) as { erro?: string; valores?: unknown };
    expect(r.erro).toMatch(mensagem);
    expect(r.valores).toBeDefined();
    expect(dobles.despFindUnique).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it.each([
    ["vazio", {}],
    ["com aspas", { id: "x'; DROP--" }],
    ["arquivo no lugar do texto", { id: new File([DESPESA], "id.txt") }],
  ])("id %s é recusado antes de consultar o banco", async (_n, extra) => {
    const r = (await atualizarDespesa(INICIAL, formulario({ ...DESPESA_VALIDA, ...extra }))) as { erro?: string };
    expect(r.erro).toMatch(/inválido/);
    expect(dobles.despFindUnique).not.toHaveBeenCalled();
    nenhumaEscrita();
  });
});

describe("removerDespesa", () => {
  it("remove e audita a data e o valor que foram apagados", async () => {
    const r = await removerDespesa(INICIAL, formulario({ id: DESPESA }));
    expect(r).toEqual({ ok: true });
    expect(dobles.despDeleteMany).toHaveBeenCalledWith({ where: { id: DESPESA } });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "financeiro.despesa_removida",
      alvo: DESPESA,
      detalhe: "despesa de 05/11/2026 removida: R$ 1.234,56",
    });
    telasAtualizadas();
  });

  it("despesa que já não existe: responde sem erro e não audita", async () => {
    dobles.despFindUnique.mockResolvedValue(null);
    expect(await removerDespesa(INICIAL, formulario({ id: DESPESA }))).toEqual({ ok: true, aviso: "Esta despesa já não existe." });
    expect(dobles.despDeleteMany).not.toHaveBeenCalled();
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("apagada por outra pessoa no meio do caminho (nenhuma linha removida): não audita", async () => {
    dobles.despDeleteMany.mockResolvedValue({ count: 0 });
    const r = await removerDespesa(INICIAL, formulario({ id: DESPESA }));
    expect(r).toEqual({ ok: true, aviso: "Esta despesa já não existe." });
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it.each([
    ["vazio", {}],
    ["com aspas", { id: "x'; DROP--" }],
    ["maiúsculas", { id: DESPESA.toUpperCase() }],
  ])("id %s é recusado antes de consultar o banco", async (_n, campos) => {
    const r = (await removerDespesa(INICIAL, formulario(campos))) as { erro?: string };
    expect(r.erro).toMatch(/inválido/);
    expect(dobles.despFindUnique).not.toHaveBeenCalled();
    nenhumaEscrita();
  });
});
