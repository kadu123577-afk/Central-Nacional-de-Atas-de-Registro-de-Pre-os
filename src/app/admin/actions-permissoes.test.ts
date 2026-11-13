import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Permissões por atividade nas ações do admin (2026-11-13): cada ação exige a
 * permissão certa ANTES de ler o formulário ou o banco, e a análise da ata
 * separa quem confere (jurídico) de quem aprova (aprovador). O Prisma, a
 * sessão, a permissão e a auditoria são trocados por dublês.
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  exigirPermissaoDe: vi.fn(),
  adminTemPermissao: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  ataFindUnique: vi.fn(),
  ataUpdate: vi.fn(),
  conformidadeFindUnique: vi.fn(),
  conformidadeUpsert: vi.fn(),
  contratoUpsert: vi.fn(),
  carregarAtaNoCiclo: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: dobles.redirect }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("@/lib/permissoes-db", () => ({
  exigirPermissaoDe: dobles.exigirPermissaoDe,
  adminTemPermissao: dobles.adminTemPermissao,
  ACAO_PERMISSAO_NEGADA: "permissao.negada",
  CAMINHO_SEM_PERMISSAO: "/admin?acesso=negado",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ata: { findUnique: dobles.ataFindUnique, update: dobles.ataUpdate },
    conformidadeAta: { findUnique: dobles.conformidadeFindUnique, upsert: dobles.conformidadeUpsert },
    contratoIntermediacao: { upsert: dobles.contratoUpsert },
  },
}));
vi.mock("@/lib/ciclo-ata-db", () => ({ carregarAtaNoCiclo: dobles.carregarAtaNoCiclo }));

import {
  analisarAta,
  atualizarDemanda,
  cadastrarAtaComoAdmin,
  criarPontoFocal,
  criarVendedorAdmin,
  decidirPedidosNegociacao,
  definirTituloPublicoAta,
  lancarLiquidacao,
  rejeitarAta,
  salvarContratoIntermediacao,
} from "./actions";

function formulario(campos: Record<string, string> = {}): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

const CONFORMIDADE_COMPLETA = {
  fornecedorRegular: "on",
  editalPermiteAdesao: "on",
  limitesRespeitados: "on",
  pesquisaPrecos: "on",
  anuenciaGerenciador: "on",
  estimativaQuantidades: "on",
};

/**
 * O que o ciclo da ata sabe (src/lib/ciclo-ata.ts). Por padrão a ata está pronta para análise: empresa
 * fechada, itens, contrato e conformidade registrados. Cada teste de ordem tira o que quer.
 */
function ataNoCiclo(dados: Record<string, unknown> = {}) {
  return {
    id: "ata1",
    dados: {
      status: "PENDENTE",
      criadaEm: new Date("2026-11-02T15:00:00Z"),
      atualizadaEm: new Date("2026-11-02T15:00:00Z"),
      fornecedorAConfirmar: false,
      totalItens: 3,
      contratoEm: new Date("2026-11-05T15:00:00Z"),
      conformidadeEm: new Date("2026-11-06T15:00:00Z"),
      categoria: "material-escritorio",
      ...dados,
    },
  };
}

function darPermissoes(permissoes: string[]) {
  dobles.adminTemPermissao.mockImplementation(async (_id: string, chave: string) => permissoes.includes(chave));
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.adminIdLogado.mockResolvedValue("adm1");
  dobles.exigirPermissaoDe.mockResolvedValue(undefined);
  darPermissoes([]);
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.ataFindUnique.mockResolvedValue({ id: "ata1", status: "PENDENTE" });
  dobles.ataUpdate.mockResolvedValue({});
  dobles.conformidadeUpsert.mockResolvedValue({});
  dobles.conformidadeFindUnique.mockResolvedValue(null);
  dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo());
  dobles.contratoUpsert.mockResolvedValue({});
});

describe("cada ação pede a permissão da sua atividade", () => {
  it.each([
    ["rejeitarAta", () => rejeitarAta(formulario()), "atas.aprovar", "admin.rejeitarAta"],
    ["decidirPedidosNegociacao", () => decidirPedidosNegociacao(formulario()), "municipios.liberar", "admin.decidirPedidosNegociacao"],
    ["definirTituloPublicoAta", () => definirTituloPublicoAta({}, formulario()), "atas.publicar", "admin.definirTituloPublicoAta"],
    ["cadastrarAtaComoAdmin", () => cadastrarAtaComoAdmin({}, formulario()), "atas.captar", "admin.cadastrarAtaComoAdmin"],
    ["lancarLiquidacao", () => lancarLiquidacao("op1", {}, formulario()), "comissao.cobrar", "admin.lancarLiquidacao"],
    ["criarPontoFocal", () => criarPontoFocal({}, formulario()), "base.editar", "admin.criarPontoFocal"],
    ["atualizarDemanda", () => atualizarDemanda(formulario()), "base.editar", "admin.atualizarDemanda"],
    ["criarVendedorAdmin", () => criarVendedorAdmin({}, formulario()), "usuarios.gerir", "admin.criarVendedorAdmin"],
  ])("%s exige %s", async (_nome, chamar, chave, acao) => {
    dobles.exigirPermissaoDe.mockRejectedValue(new Error("NEXT_REDIRECT:/admin?acesso=negado"));
    await expect(chamar()).rejects.toThrow("NEXT_REDIRECT:/admin?acesso=negado");
    expect(dobles.exigirPermissaoDe).toHaveBeenCalledWith("adm1", chave, acao);
    // Recusada: a ação não chega à auditoria de uso nem ao banco.
    expect(dobles.registrarAuditoria).not.toHaveBeenCalledWith(expect.objectContaining({ acao }));
    expect(dobles.ataUpdate).not.toHaveBeenCalled();
  });

  it("sem sessão vai para o login antes de olhar permissão", async () => {
    dobles.adminIdLogado.mockResolvedValue(null);
    await expect(rejeitarAta(formulario({ ataId: "ata1" }))).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(dobles.exigirPermissaoDe).not.toHaveBeenCalled();
  });

  it("com a permissão, a ação segue e a auditoria registra o uso", async () => {
    await rejeitarAta(formulario({ ataId: "ata1" }));
    expect(dobles.ataUpdate).toHaveBeenCalledWith({ where: { id: "ata1" }, data: { status: "REJEITADA" } });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({ ator: "admin:adm1", acao: "admin.rejeitarAta" });
  });
});

describe("a ordem das etapas vale no servidor: cada etapa só abre depois da anterior", () => {
  const analisar = (campos: Record<string, string>) => analisarAta("ata1", {}, formulario(campos));
  const contrato = (campos: Record<string, string> = {}) =>
    salvarContratoIntermediacao(
      "ata1",
      {},
      formulario({ percentualComissao: "5", dataAssinatura: "2026-11-10", ...campos }),
    );

  it.each([
    ["salvar", ["atas.conformidade"]],
    ["aprovar", ["atas.aprovar"]],
    ["aprovar", ["atas.conformidade", "atas.aprovar"]],
  ])("sem o contrato (etapa 4) não dá para %s a conformidade nem aprovar (%j)", async (decisao, permissoes) => {
    darPermissoes(permissoes);
    dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo({ contratoEm: null, conformidadeEm: null }));
    const r = await analisar({ ...CONFORMIDADE_COMPLETA, decisao });
    expect(r.erro).toContain("falta a etapa 4 (Contrato de intermediação");
    expect(dobles.conformidadeUpsert).not.toHaveBeenCalled();
    expect(dobles.ataUpdate).not.toHaveBeenCalled();
  });

  it("o bloqueio devolve o que foi marcado, para o formulário repor", async () => {
    darPermissoes(["atas.conformidade"]);
    dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo({ contratoEm: null, conformidadeEm: null }));
    const r = await analisar({ fornecedorRegular: "on", parecer: "texto", decisao: "salvar" });
    expect(r.valores?.parecer).toBe("texto");
    expect(r.valores?.respostas.fornecedorRegular).toBe(true);
  });

  it("sem itens cadastrados (etapa 3) a conformidade também espera", async () => {
    darPermissoes(["atas.conformidade"]);
    dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo({ totalItens: 0, contratoEm: null, conformidadeEm: null }));
    const r = await analisar({ ...CONFORMIDADE_COMPLETA, decisao: "salvar" });
    expect(r.erro).toContain("falta a etapa 3 (Cadastrar itens e saldos");
    expect(dobles.conformidadeUpsert).not.toHaveBeenCalled();
  });

  it("aprovador sozinho não aprova enquanto o jurídico não registrou a conformidade (etapa 5)", async () => {
    darPermissoes(["atas.aprovar"]);
    dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo({ conformidadeEm: null }));
    const r = await analisar({ decisao: "aprovar" });
    expect(r.erro).toContain("falta a etapa 5 (Conformidade da ata");
    expect(dobles.ataUpdate).not.toHaveBeenCalled();
  });

  it("quem tem as duas permissões registra a conformidade e aprova na mesma ação, desde que o contrato exista", async () => {
    darPermissoes(["atas.conformidade", "atas.aprovar"]);
    dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo({ conformidadeEm: null }));
    const r = await analisar({ ...CONFORMIDADE_COMPLETA, decisao: "aprovar" });
    expect(r).toMatchObject({ mensagem: "Ata aprovada." });
    expect(dobles.conformidadeUpsert).toHaveBeenCalledTimes(1);
    expect(dobles.ataUpdate).toHaveBeenCalledWith({ where: { id: "ata1" }, data: { status: "APROVADA" } });
  });

  it("rejeitar não depende da ordem", async () => {
    darPermissoes(["atas.aprovar"]);
    dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo({ totalItens: 0, contratoEm: null, conformidadeEm: null }));
    await rejeitarAta(formulario({ ataId: "ata1" }));
    expect(dobles.ataUpdate).toHaveBeenCalled();
  });

  it("o contrato (etapa 4) espera os itens e o saldo cadastrados (etapa 3)", async () => {
    dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo({ totalItens: 0, contratoEm: null, conformidadeEm: null }));
    const r = await contrato();
    expect(r.erro).toContain("falta a etapa 3 (Cadastrar itens e saldos");
    expect(dobles.contratoUpsert).not.toHaveBeenCalled();
  });

  it("o contrato espera a empresa prestadora estar fechada (etapa 2)", async () => {
    dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo({ fornecedorAConfirmar: true, contratoEm: null, conformidadeEm: null }));
    const r = await contrato();
    expect(r.erro).toContain("falta a etapa 2 (Fechar com a empresa prestadora");
    expect(dobles.contratoUpsert).not.toHaveBeenCalled();
  });

  it("com empresa e itens, o contrato é gravado", async () => {
    dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo({ contratoEm: null, conformidadeEm: null }));
    const r = await contrato();
    expect(r).toEqual({ sucesso: true });
    expect(dobles.contratoUpsert).toHaveBeenCalledTimes(1);
  });

  it("corrigir um contrato já cadastrado continua possível", async () => {
    const r = await contrato({ percentualComissao: "6" });
    expect(r).toEqual({ sucesso: true });
  });
});

describe("analisarAta separa quem confere de quem aprova", () => {
  const analisar = (campos: Record<string, string>) => analisarAta("ata1", {}, formulario(campos));

  it("a análise aceita quem confere ou quem aprova (qualquer uma das duas)", async () => {
    darPermissoes(["atas.conformidade"]);
    await analisar({ ...CONFORMIDADE_COMPLETA, decisao: "salvar" });
    expect(dobles.exigirPermissaoDe).toHaveBeenCalledWith("adm1", ["atas.conformidade", "atas.aprovar"], "admin.analisarAta");
  });

  it("jurídico (só conformidade) salva o checklist e o parecer, mas não aprova", async () => {
    darPermissoes(["atas.conformidade"]);
    const salvar = await analisar({ ...CONFORMIDADE_COMPLETA, parecer: "Tudo certo.", decisao: "salvar" });
    expect(salvar).toMatchObject({ mensagem: "Análise salva." });
    expect(dobles.conformidadeUpsert).toHaveBeenCalledTimes(1);
    expect(dobles.conformidadeUpsert.mock.calls[0][0].update).toMatchObject({ parecer: "Tudo certo.", responsavelId: "adm1" });
    expect(dobles.ataUpdate).not.toHaveBeenCalled();

    dobles.conformidadeUpsert.mockClear();
    const aprovar = await analisar({ ...CONFORMIDADE_COMPLETA, decisao: "aprovar" });
    expect(aprovar.erro).toBe("Você não tem permissão para aprovar atas.");
    expect(dobles.conformidadeUpsert).not.toHaveBeenCalled();
    expect(dobles.ataUpdate).not.toHaveBeenCalled();
  });

  it("aprovador (só aprovar) aprova com base no que o jurídico já registrou, sem mexer no checklist", async () => {
    darPermissoes(["atas.aprovar"]);
    dobles.conformidadeFindUnique.mockResolvedValue({
      fornecedorRegular: true,
      editalPermiteAdesao: true,
      limitesRespeitados: true,
      pesquisaPrecos: true,
      anuenciaGerenciador: true,
      estimativaQuantidades: true,
      parecer: null,
    });
    // O formulário chega com o checklist vazio: o aprovador não pode desfazer o que o jurídico marcou.
    const r = await analisar({ decisao: "aprovar" });
    expect(r).toMatchObject({ mensagem: "Ata aprovada." });
    expect(dobles.conformidadeUpsert).not.toHaveBeenCalled();
    expect(dobles.ataUpdate).toHaveBeenCalledWith({ where: { id: "ata1" }, data: { status: "APROVADA" } });
  });

  it("aprovador com itens pendentes e sem parecer do jurídico é mandado de volta ao jurídico", async () => {
    darPermissoes(["atas.aprovar"]);
    dobles.conformidadeFindUnique.mockResolvedValue({ fornecedorRegular: true, parecer: null });
    const r = await analisar({ decisao: "aprovar", parecer: "eu aprovo assim mesmo" });
    expect(r.erro).toMatch(/jurídico ainda não registrou parecer/);
    expect(dobles.ataUpdate).not.toHaveBeenCalled();
    expect(dobles.conformidadeUpsert).not.toHaveBeenCalled();
  });

  it("aprovador com ressalva já registrada pelo jurídico aprova", async () => {
    darPermissoes(["atas.aprovar"]);
    dobles.conformidadeFindUnique.mockResolvedValue({ fornecedorRegular: true, parecer: "Ressalva: falta a anuência, mas há prazo." });
    const r = await analisar({ decisao: "aprovar" });
    expect(r).toMatchObject({ mensagem: "Ata aprovada com ressalva." });
    expect(dobles.ataUpdate).toHaveBeenCalledTimes(1);
  });

  it("aprovador não consegue salvar o checklist", async () => {
    darPermissoes(["atas.aprovar"]);
    const r = await analisar({ ...CONFORMIDADE_COMPLETA, decisao: "salvar" });
    expect(r.erro).toBe("Você não tem permissão para salvar a conformidade da ata.");
    expect(dobles.conformidadeUpsert).not.toHaveBeenCalled();
  });

  it("quem tem as duas mantém o comportamento de antes: aprovar com pendência pede parecer", async () => {
    darPermissoes(["atas.conformidade", "atas.aprovar"]);
    const r = await analisar({ fornecedorRegular: "on", decisao: "aprovar" });
    expect(r.erro).toMatch(/Para aprovar com ressalva, escreva o parecer/);
    expect(dobles.ataUpdate).not.toHaveBeenCalled();

    const ok = await analisar({ ...CONFORMIDADE_COMPLETA, decisao: "aprovar" });
    expect(ok).toMatchObject({ mensagem: "Ata aprovada." });
    expect(dobles.conformidadeUpsert).toHaveBeenCalled();
    expect(dobles.ataUpdate).toHaveBeenCalledWith({ where: { id: "ata1" }, data: { status: "APROVADA" } });
  });

  it("ata inexistente devolve erro", async () => {
    darPermissoes(["atas.conformidade", "atas.aprovar"]);
    dobles.ataFindUnique.mockResolvedValue(null);
    await expect(analisar({ decisao: "salvar" })).resolves.toEqual({ erro: "Ata não encontrada." });
  });
});
