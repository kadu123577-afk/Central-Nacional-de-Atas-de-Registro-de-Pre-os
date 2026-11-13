import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As ações da Captação, testadas sem banco: o Prisma, a sessão e a auditoria são dublês, e o que se
 * confere é o que a ação manda para eles — quem pode chamar, o que o `where` exige, o que é gravado
 * e, em especial, que a trilha de auditoria NUNCA leva o contato de ninguém (LGPD).
 */
const d = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  exigirPermissaoDe: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  radarFindUnique: vi.fn(),
  capFindUnique: vi.fn(),
  capCreate: vi.fn(),
  capUpdateMany: vi.fn(),
  contatoCount: vi.fn(),
  contatoCreate: vi.fn(),
  contatoUpdateMany: vi.fn(),
  contatoDeleteMany: vi.fn(),
  interacaoCreate: vi.fn(),
  adminFindFirst: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: d.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: d.redirect }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: d.adminIdLogado }));
vi.mock("@/lib/permissoes-db", () => ({ exigirPermissaoDe: d.exigirPermissaoDe }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: d.registrarAuditoria }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    radarAta: { findUnique: d.radarFindUnique },
    captacao: { findUnique: d.capFindUnique, create: d.capCreate, updateMany: d.capUpdateMany },
    contatoEmpresa: {
      count: d.contatoCount,
      create: d.contatoCreate,
      updateMany: d.contatoUpdateMany,
      deleteMany: d.contatoDeleteMany,
    },
    interacaoCaptacao: { create: d.interacaoCreate },
    admin: { findFirst: d.adminFindFirst },
  },
}));

import {
  atualizarCaptacao,
  captarAtaDoRadar,
  criarCaptacaoManual,
  definirEmpresaCaptacao,
  excluirContatoDaEmpresa,
  moverEstagioCaptacao,
  registrarInteracaoCaptacao,
  salvarContatoDaEmpresa,
} from "./actions";

const ID = "cm1abc23d0000xyz98765432";
const ID2 = "cm9zzz23d0000xyz98765432";
const CNPJ = "12345678000195";
const INICIAL = {};

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const RADAR = {
  numeroControlePncpAta: "03532661000156-1-000075/2024-000001",
  orgaoNome: "PREFEITURA DE JATAI",
  uf: "GO",
  municipioNome: "Jataí",
  objeto: "Limpeza",
  categoria: "limpeza",
  vigenciaFim: new Date("2027-05-10T00:00:00Z"),
  fornecedorCnpj: CNPJ,
  fornecedorNome: "Limpa Tudo Ltda",
};

function nenhumaEscrita() {
  expect(d.capCreate).not.toHaveBeenCalled();
  expect(d.capUpdateMany).not.toHaveBeenCalled();
  expect(d.contatoCreate).not.toHaveBeenCalled();
  expect(d.contatoUpdateMany).not.toHaveBeenCalled();
  expect(d.contatoDeleteMany).not.toHaveBeenCalled();
  expect(d.interacaoCreate).not.toHaveBeenCalled();
  expect(d.registrarAuditoria).not.toHaveBeenCalled();
}

/** Tudo que a auditoria recebeu, como um texto só, para provar que não vazou dado pessoal. */
function trilha(): string {
  return JSON.stringify(d.registrarAuditoria.mock.calls);
}

beforeEach(() => {
  vi.clearAllMocks();
  d.adminIdLogado.mockResolvedValue("admin1");
  d.exigirPermissaoDe.mockResolvedValue(undefined);
  d.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  d.capUpdateMany.mockResolvedValue({ count: 1 });
  d.capCreate.mockResolvedValue({ id: ID });
  d.contatoCount.mockResolvedValue(0);
  d.contatoCreate.mockResolvedValue({});
  d.contatoUpdateMany.mockResolvedValue({ count: 1 });
  d.contatoDeleteMany.mockResolvedValue({ count: 1 });
  d.interacaoCreate.mockResolvedValue({});
  d.adminFindFirst.mockResolvedValue({ id: ID2 });
});

describe("quem pode chamar", () => {
  const acoes: [string, (f: FormData) => Promise<unknown>, Record<string, string>][] = [
    ["captarAtaDoRadar", (f) => captarAtaDoRadar(f), { radarId: ID }],
    ["criarCaptacaoManual", (f) => criarCaptacaoManual(INICIAL, f), { fornecedorNome: "X", fornecedorCnpj: CNPJ, objeto: "y" }],
    ["moverEstagioCaptacao", (f) => moverEstagioCaptacao(INICIAL, f), { id: ID, estagio: "em_contato" }],
    ["atualizarCaptacao", (f) => atualizarCaptacao(INICIAL, f), { id: ID, nome: "x" }],
    ["definirEmpresaCaptacao", (f) => definirEmpresaCaptacao(INICIAL, f), { id: ID, fornecedorNome: "x", fornecedorCnpj: CNPJ }],
    ["registrarInteracaoCaptacao", (f) => registrarInteracaoCaptacao(INICIAL, f), { id: ID, canal: "telefone", resumo: "x" }],
    ["salvarContatoDaEmpresa", (f) => salvarContatoDaEmpresa(INICIAL, f), { captacaoId: ID, nome: "x" }],
    ["excluirContatoDaEmpresa", (f) => excluirContatoDaEmpresa(f), { captacaoId: ID, contatoId: ID2 }],
  ];

  it.each(acoes)("%s: sem login manda para o login e não toca no banco", async (_n, agir, campos) => {
    d.adminIdLogado.mockResolvedValue(null);
    await expect(agir(form(campos))).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(d.exigirPermissaoDe).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it.each(acoes)("%s: sem a permissão de captar, a ação para antes de ler o formulário", async (_n, agir, campos) => {
    d.exigirPermissaoDe.mockRejectedValue(new Error("NEXT_REDIRECT:/admin?acesso=negado"));
    await expect(agir(form(campos))).rejects.toThrow("acesso=negado");
    expect(d.exigirPermissaoDe).toHaveBeenCalledWith("admin1", "atas.captar");
    nenhumaEscrita();
  });

  it("confere a sessão antes de ler qualquer coisa do formulário", async () => {
    d.adminIdLogado.mockResolvedValue(null);
    await expect(captarAtaDoRadar({} as FormData)).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    await expect(criarCaptacaoManual(INICIAL, {} as FormData)).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });
});

describe("captarAtaDoRadar", () => {
  it("copia a ata do radar para um cartão Identificada no nome de quem clicou, e audita", async () => {
    d.radarFindUnique.mockResolvedValue(RADAR);
    d.capFindUnique.mockResolvedValue(null);
    await expect(captarAtaDoRadar(form({ radarId: ID }))).rejects.toThrow(`NEXT_REDIRECT:/admin/captacao/${ID}`);

    expect(d.capCreate).toHaveBeenCalledTimes(1);
    expect(d.capCreate.mock.calls[0][0].data).toMatchObject({
      origem: "radar",
      estagio: "identificada",
      numeroControlePncpAta: RADAR.numeroControlePncpAta,
      fornecedorCnpj: CNPJ,
      responsavelId: "admin1",
      criadoPorId: "admin1",
    });
    expect(d.capCreate.mock.calls[0][0].data.nome).toContain("Ata de Limpeza e conservação");
    expect(d.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ ator: "admin:admin1", acao: "captacao.captarDoRadar", alvo: ID }),
    );
  });

  it("ata que já está no quadro: leva ao cartão existente e não cria outro", async () => {
    d.radarFindUnique.mockResolvedValue(RADAR);
    d.capFindUnique.mockResolvedValue({ id: ID2 });
    await expect(captarAtaDoRadar(form({ radarId: ID }))).rejects.toThrow(`NEXT_REDIRECT:/admin/captacao/${ID2}`);
    nenhumaEscrita();
  });

  it("dois cliques ao mesmo tempo: o cartão do outro clique vence, sem erro", async () => {
    d.radarFindUnique.mockResolvedValue(RADAR);
    d.capFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: ID2 });
    d.capCreate.mockRejectedValue(new Error("Unique constraint failed"));
    await expect(captarAtaDoRadar(form({ radarId: ID }))).rejects.toThrow(`NEXT_REDIRECT:/admin/captacao/${ID2}`);
  });

  it("id inválido ou ata que sumiu do radar: volta ao radar sem criar nada", async () => {
    await expect(captarAtaDoRadar(form({ radarId: "'; drop" }))).rejects.toThrow("NEXT_REDIRECT:/admin/radar-atas");
    expect(d.radarFindUnique).not.toHaveBeenCalled();
    d.radarFindUnique.mockResolvedValue(null);
    await expect(captarAtaDoRadar(form({ radarId: ID }))).rejects.toThrow("NEXT_REDIRECT:/admin/radar-atas");
    nenhumaEscrita();
  });
});

describe("criarCaptacaoManual", () => {
  const BASE = { fornecedorNome: "Papelaria Exemplo Ltda", fornecedorCnpj: "12.345.678/0001-95", objeto: "Material de escritório" };

  it("cria o cartão Identificada em nome de quem cadastrou, só com o mínimo", async () => {
    await expect(criarCaptacaoManual(INICIAL, form(BASE))).rejects.toThrow(`NEXT_REDIRECT:/admin/captacao/${ID}`);
    expect(d.capCreate.mock.calls[0][0].data).toMatchObject({
      origem: "indicacao",
      estagio: "identificada",
      fornecedorCnpj: CNPJ,
      responsavelId: "admin1",
      criadoPorId: "admin1",
      numeroControlePncpAta: null,
    });
    expect(d.contatoCreate).not.toHaveBeenCalled();
    expect(d.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "captacao.criarManual", alvo: ID, detalhe: `CNPJ ${CNPJ}` }),
    );
  });

  it("com contato: guarda o cartão de contato ligado ao CNPJ e a trilha não leva dado pessoal", async () => {
    await expect(
      criarCaptacaoManual(
        INICIAL,
        form({
          ...BASE,
          contatoNome: "Maria Souza",
          contatoTelefone: "(62) 99999-0000",
          contatoEmail: "maria@papelaria.com.br",
          contatoComoObteve: "Evento do setor",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(d.contatoCreate.mock.calls[0][0].data).toMatchObject({
      cnpj: CNPJ,
      nome: "Maria Souza",
      telefone: "62999990000",
      email: "maria@papelaria.com.br",
      comoObteve: "Evento do setor",
      criadoPorId: "admin1",
    });
    for (const segredo of ["Maria", "99999", "papelaria.com.br", "Evento"]) expect(trilha()).not.toContain(segredo);
  });

  it("dado inválido volta com o erro e o que foi digitado, sem gravar nada", async () => {
    const r = (await criarCaptacaoManual(INICIAL, form({ ...BASE, fornecedorCnpj: "11.111.111/1111-11" }))) as {
      erro?: string;
      valores?: Record<string, string>;
    };
    expect(r.erro).toContain("CNPJ inválido");
    expect(r.valores?.fornecedorNome).toBe("Papelaria Exemplo Ltda");
    nenhumaEscrita();
  });

  it("recusa o contato quando a empresa já tem o máximo", async () => {
    d.contatoCount.mockResolvedValue(10);
    const r = (await criarCaptacaoManual(
      INICIAL,
      form({ ...BASE, contatoNome: "Maria", contatoTelefone: "62999990000", contatoComoObteve: "Site" }),
    )) as { erro?: string };
    expect(r.erro).toContain("10 contatos");
    nenhumaEscrita();
  });
});

describe("moverEstagioCaptacao", () => {
  it("avança um passo só se o estágio ainda for o que a tela mostrava, e audita", async () => {
    d.capFindUnique.mockResolvedValue({ estagio: "identificada", nome: "n" });
    expect(await moverEstagioCaptacao(INICIAL, form({ id: ID, estagio: "em_contato" }))).toEqual({ ok: true });
    expect(d.capUpdateMany).toHaveBeenCalledWith({
      where: { id: ID, estagio: "identificada" },
      data: { estagio: "em_contato", motivoPerda: null },
    });
    expect(d.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "captacao.moverEstagio", alvo: ID, detalhe: "identificada → em_contato" }),
    );
  });

  it("“Fechada” não se alcança à mão e a fechada não volta", async () => {
    d.capFindUnique.mockResolvedValue({ estagio: "interessada", nome: "n" });
    const a = (await moverEstagioCaptacao(INICIAL, form({ id: ID, estagio: "fechada" }))) as { erro?: string };
    expect(a.erro).toContain("cadastrada");
    d.capFindUnique.mockResolvedValue({ estagio: "fechada", nome: "n" });
    const b = (await moverEstagioCaptacao(INICIAL, form({ id: ID, estagio: "em_contato" }))) as { erro?: string };
    expect(b.erro).toContain("já foi cadastrada");
    nenhumaEscrita();
  });

  it("pular um passo é recusado", async () => {
    d.capFindUnique.mockResolvedValue({ estagio: "identificada", nome: "n" });
    const r = (await moverEstagioCaptacao(INICIAL, form({ id: ID, estagio: "interessada" }))) as { erro?: string };
    expect(r.erro).toContain("um estágio por vez");
    nenhumaEscrita();
  });

  it("“Não deu” exige o motivo e o guarda; sair dele apaga o motivo", async () => {
    d.capFindUnique.mockResolvedValue({ estagio: "em_contato", nome: "n" });
    const sem = (await moverEstagioCaptacao(INICIAL, form({ id: ID, estagio: "perdida" }))) as { erro?: string };
    expect(sem.erro).toContain("por que não deu");
    const ruim = (await moverEstagioCaptacao(INICIAL, form({ id: ID, estagio: "perdida", motivoPerda: "xis" }))) as { erro?: string };
    expect(ruim.erro).toContain("por que não deu");
    nenhumaEscrita();

    await moverEstagioCaptacao(INICIAL, form({ id: ID, estagio: "perdida", motivoPerda: "recusou" }));
    expect(d.capUpdateMany).toHaveBeenLastCalledWith({
      where: { id: ID, estagio: "em_contato" },
      data: { estagio: "perdida", motivoPerda: "recusou" },
    });

    d.capFindUnique.mockResolvedValue({ estagio: "perdida", nome: "n" });
    await moverEstagioCaptacao(INICIAL, form({ id: ID, estagio: "identificada" }));
    expect(d.capUpdateMany).toHaveBeenLastCalledWith({
      where: { id: ID, estagio: "perdida" },
      data: { estagio: "identificada", motivoPerda: null },
    });
  });

  it("estágio que mudou no meio do caminho: avisa e não audita", async () => {
    d.capFindUnique.mockResolvedValue({ estagio: "identificada", nome: "n" });
    d.capUpdateMany.mockResolvedValue({ count: 0 });
    const r = (await moverEstagioCaptacao(INICIAL, form({ id: ID, estagio: "em_contato" }))) as { erro?: string };
    expect(r.erro).toContain("mudou enquanto você olhava");
    expect(d.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("mesmo estágio não grava nem audita; id fora do formato e cartão inexistente são recusados", async () => {
    d.capFindUnique.mockResolvedValue({ estagio: "em_contato", nome: "n" });
    expect(await moverEstagioCaptacao(INICIAL, form({ id: ID, estagio: "em_contato" }))).toMatchObject({ ok: true });
    nenhumaEscrita();
    expect(await moverEstagioCaptacao(INICIAL, form({ id: "x", estagio: "em_contato" }))).toMatchObject({ erro: expect.any(String) });
    d.capFindUnique.mockResolvedValue(null);
    expect(await moverEstagioCaptacao(INICIAL, form({ id: ID, estagio: "em_contato" }))).toMatchObject({ erro: expect.any(String) });
  });
});

describe("atualizarCaptacao", () => {
  const ATUAL = { nome: "Ata A", responsavelId: null, proximoContatoEm: null, observacoes: null };

  it("grava só o que mudou e a trilha leva os nomes dos campos, não o texto", async () => {
    d.capFindUnique.mockResolvedValue(ATUAL);
    const r = await atualizarCaptacao(
      INICIAL,
      form({ id: ID, nome: "Ata A", responsavelId: ID2, proximoContatoEm: "2026-11-20", observacoes: "o dono pediu a lista de itens" }),
    );
    expect(r).toEqual({ ok: true });
    expect(d.capUpdateMany).toHaveBeenCalledWith({
      where: { id: ID },
      data: {
        responsavelId: ID2,
        proximoContatoEm: new Date("2026-11-20T00:00:00Z"),
        observacoes: "o dono pediu a lista de itens",
      },
    });
    expect(trilha()).toContain("responsável; próximo contato; anotações");
    expect(trilha()).not.toContain("o dono pediu");
  });

  it("nada mudou: não grava nem audita", async () => {
    d.capFindUnique.mockResolvedValue(ATUAL);
    expect(await atualizarCaptacao(INICIAL, form({ id: ID, nome: "Ata A", responsavelId: "", proximoContatoEm: "", observacoes: "" }))).toEqual({
      ok: true,
      aviso: "Nada mudou.",
    });
    nenhumaEscrita();
  });

  it("o responsável tem de ser um captador ativo", async () => {
    d.capFindUnique.mockResolvedValue(ATUAL);
    d.adminFindFirst.mockResolvedValue(null);
    const r = (await atualizarCaptacao(INICIAL, form({ id: ID, nome: "Ata A", responsavelId: ID2 }))) as { erro?: string };
    expect(r.erro).toContain("responsável");
    expect(d.adminFindFirst).toHaveBeenCalledWith({
      where: { id: ID2, ativo: true, permissoes: { has: "atas.captar" } },
      select: { id: true },
    });
    nenhumaEscrita();
  });

  it("recusa nome vazio, data que não existe e anotação grande demais, devolvendo o que foi digitado", async () => {
    const invalidos: Record<string, string>[] = [{ nome: " " }, { proximoContatoEm: "2026-02-31" }, { observacoes: "x".repeat(501) }];
    for (const campos of invalidos) {
      const r = (await atualizarCaptacao(INICIAL, form({ id: ID, nome: "Ata A", ...campos }))) as {
        erro?: string;
        valores?: Record<string, string>;
      };
      expect(r.erro).toBeTruthy();
      expect(r.valores).toBeDefined();
    }
    nenhumaEscrita();
  });
});

describe("definirEmpresaCaptacao", () => {
  it("grava razão social e CNPJ (só dígitos) e audita o CNPJ", async () => {
    expect(await definirEmpresaCaptacao(INICIAL, form({ id: ID, fornecedorNome: " Limpa  Tudo ", fornecedorCnpj: "12.345.678/0001-95" }))).toEqual({ ok: true });
    expect(d.capUpdateMany).toHaveBeenCalledWith({ where: { id: ID }, data: { fornecedorNome: "Limpa Tudo", fornecedorCnpj: CNPJ } });
    expect(d.registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ detalhe: `CNPJ ${CNPJ}` }));
  });

  it("recusa CNPJ errado e CPF", async () => {
    for (const cnpj of ["12.345.678/0001-96", "123.456.789-09", ""]) {
      const r = (await definirEmpresaCaptacao(INICIAL, form({ id: ID, fornecedorNome: "X", fornecedorCnpj: cnpj }))) as { erro?: string };
      expect(r.erro, cnpj).toBeTruthy();
    }
    nenhumaEscrita();
  });
});

describe("registrarInteracaoCaptacao", () => {
  it("registra o contato; do primeiro contato sai de Identificada e o cartão ganha dono", async () => {
    d.capFindUnique.mockResolvedValue({ estagio: "identificada", responsavelId: null });
    const r = await registrarInteracaoCaptacao(
      INICIAL,
      form({ id: ID, canal: "telefone", resumo: "Ligou, pediu proposta", quando: "", proximoContatoEm: "2026-11-25" }),
    );
    expect(r).toEqual({ ok: true });
    expect(d.interacaoCreate.mock.calls[0][0].data).toMatchObject({ captacaoId: ID, autorId: "admin1", canal: "telefone", resumo: "Ligou, pediu proposta" });
    expect(d.capUpdateMany).toHaveBeenCalledWith({ where: { id: ID, estagio: "identificada" }, data: { estagio: "em_contato" } });
    expect(d.capUpdateMany).toHaveBeenCalledWith({ where: { id: ID, responsavelId: null }, data: { responsavelId: "admin1" } });
    expect(d.capUpdateMany).toHaveBeenCalledWith({ where: { id: ID }, data: { proximoContatoEm: new Date("2026-11-25T00:00:00Z") } });
    expect(trilha()).toContain("canal telefone");
    expect(trilha()).not.toContain("proposta");
  });

  it("cartão que já está adiante não volta de estágio nem troca de dono", async () => {
    d.capFindUnique.mockResolvedValue({ estagio: "interessada", responsavelId: ID2 });
    await registrarInteracaoCaptacao(INICIAL, form({ id: ID, canal: "whatsapp", resumo: "Mandou a lista" }));
    expect(d.interacaoCreate).toHaveBeenCalledTimes(1);
    expect(d.capUpdateMany).not.toHaveBeenCalled();
  });

  it("recusa canal inválido, texto vazio e dia futuro, sem gravar", async () => {
    const amanha = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const invalidos: Record<string, string>[] = [
      { canal: "pombo", resumo: "x" },
      { canal: "telefone", resumo: " " },
      { canal: "telefone", resumo: "x", quando: amanha },
    ];
    for (const campos of invalidos) {
      const r = (await registrarInteracaoCaptacao(INICIAL, form({ id: ID, ...campos }))) as { erro?: string };
      expect(r.erro, JSON.stringify(campos)).toBeTruthy();
    }
    nenhumaEscrita();
  });
});

describe("salvarContatoDaEmpresa (LGPD)", () => {
  const CONTATO = { captacaoId: ID, nome: "Maria Souza", telefone: "(62) 99999-0000", email: "maria@e.com", comoObteve: "Site da empresa" };

  it("cria o contato ligado ao CNPJ do cartão; a trilha leva só o CNPJ", async () => {
    d.capFindUnique.mockResolvedValue({ fornecedorCnpj: CNPJ });
    expect(await salvarContatoDaEmpresa(INICIAL, form({ ...CONTATO, whatsapp: "on" }))).toEqual({ ok: true });
    expect(d.contatoCreate.mock.calls[0][0].data).toMatchObject({
      cnpj: CNPJ,
      nome: "Maria Souza",
      telefone: "62999990000",
      whatsapp: true,
      email: "maria@e.com",
      comoObteve: "Site da empresa",
      criadoPorId: "admin1",
    });
    expect(d.registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "captacao.contato.criar", detalhe: `CNPJ ${CNPJ}` }));
    for (const segredo of ["Maria", "99999", "maria@e.com", "Site da empresa"]) expect(trilha()).not.toContain(segredo);
  });

  it("sem a empresa identificada não guarda contato", async () => {
    d.capFindUnique.mockResolvedValue({ fornecedorCnpj: null });
    const r = (await salvarContatoDaEmpresa(INICIAL, form(CONTATO))) as { erro?: string };
    expect(r.erro).toContain("Identifique a empresa");
    nenhumaEscrita();
  });

  it("sem “de onde veio” ou sem telefone nem e-mail, recusa e devolve o digitado", async () => {
    d.capFindUnique.mockResolvedValue({ fornecedorCnpj: CNPJ });
    const a = (await salvarContatoDaEmpresa(INICIAL, form({ ...CONTATO, comoObteve: "" }))) as { erro?: string; valores?: Record<string, string> };
    expect(a.erro).toContain("de onde veio");
    expect(a.valores?.nome).toBe("Maria Souza");
    const b = (await salvarContatoDaEmpresa(INICIAL, form({ captacaoId: ID, nome: "Maria", comoObteve: "Site" }))) as { erro?: string };
    expect(b.erro).toContain("telefone ou o e-mail");
    nenhumaEscrita();
  });

  it("no máximo 10 contatos por empresa", async () => {
    d.capFindUnique.mockResolvedValue({ fornecedorCnpj: CNPJ });
    d.contatoCount.mockResolvedValue(10);
    const r = (await salvarContatoDaEmpresa(INICIAL, form(CONTATO))) as { erro?: string };
    expect(r.erro).toContain("10 contatos");
    nenhumaEscrita();
  });

  it("corrigir só mexe em contato do CNPJ deste cartão", async () => {
    d.capFindUnique.mockResolvedValue({ fornecedorCnpj: CNPJ });
    await salvarContatoDaEmpresa(INICIAL, form({ ...CONTATO, contatoId: ID2 }));
    expect(d.contatoUpdateMany.mock.calls[0][0].where).toEqual({ id: ID2, cnpj: CNPJ });
    expect(d.contatoCreate).not.toHaveBeenCalled();
    expect(d.registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "captacao.contato.corrigir", alvo: ID2 }));

    d.contatoUpdateMany.mockResolvedValue({ count: 0 });
    const r = (await salvarContatoDaEmpresa(INICIAL, form({ ...CONTATO, contatoId: ID2 }))) as { erro?: string };
    expect(r.erro).toContain("não existe mais");
  });
});

describe("excluirContatoDaEmpresa", () => {
  it("apaga por completo, só do CNPJ do cartão, e audita sem dado pessoal", async () => {
    d.capFindUnique.mockResolvedValue({ fornecedorCnpj: CNPJ });
    await excluirContatoDaEmpresa(form({ captacaoId: ID, contatoId: ID2 }));
    expect(d.contatoDeleteMany).toHaveBeenCalledWith({ where: { id: ID2, cnpj: CNPJ } });
    expect(d.registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({ acao: "captacao.contato.apagar", alvo: ID2, detalhe: `CNPJ ${CNPJ}` }),
    );
  });

  it("contato que não é daquela empresa (nada apagado): não audita", async () => {
    d.capFindUnique.mockResolvedValue({ fornecedorCnpj: CNPJ });
    d.contatoDeleteMany.mockResolvedValue({ count: 0 });
    await excluirContatoDaEmpresa(form({ captacaoId: ID, contatoId: ID2 }));
    expect(d.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("id fora do formato ou cartão sem empresa: não faz nada", async () => {
    await excluirContatoDaEmpresa(form({ captacaoId: "x", contatoId: ID2 }));
    d.capFindUnique.mockResolvedValue({ fornecedorCnpj: null });
    await excluirContatoDaEmpresa(form({ captacaoId: ID, contatoId: ID2 }));
    expect(d.contatoDeleteMany).not.toHaveBeenCalled();
  });
});
