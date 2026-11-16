import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Permissões por atividade nas ações do admin (2026-11-13): cada ação exige a
 * permissão certa ANTES de ler o formulário ou o banco. A ata não tem mais aprovação
 * nem rejeição (14/11/2026): o jurídico conclui a conformidade e a ata é liberada. O
 * Prisma, a sessão, a permissão e a auditoria são trocados por dublês.
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
    ["analisarAta", () => analisarAta("ata1", {}, formulario()), "atas.conformidade", "admin.analisarAta"],
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
    await expect(analisarAta("ata1", {}, formulario())).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(dobles.exigirPermissaoDe).not.toHaveBeenCalled();
  });

  it("com a permissão, a ação segue e a auditoria registra o uso", async () => {
    await analisarAta("ata1", {}, formulario({ ...CONFORMIDADE_COMPLETA, decisao: "concluir" }));
    expect(dobles.ataUpdate).toHaveBeenCalledWith({ where: { id: "ata1" }, data: { status: "APROVADA" } });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({ ator: "admin:adm1", acao: "admin.analisarAta" });
  });

  it("a rejeição de ata não existe mais: nenhuma ação do admin a oferece", async () => {
    const acoes = (await import("./actions")) as Record<string, unknown>;
    expect(acoes.rejeitarAta).toBeUndefined();
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

  it.each([["rascunho"], ["concluir"]])(
    "sem o contrato (etapa 4) não dá para fazer a conformidade nem concluir (%s)",
    async (decisao) => {
      dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo({ contratoEm: null, conformidadeEm: null }));
      const r = await analisar({ ...CONFORMIDADE_COMPLETA, decisao });
      expect(r.erro).toContain("falta a etapa 4 (Contrato de intermediação");
      expect(dobles.conformidadeUpsert).not.toHaveBeenCalled();
      expect(dobles.ataUpdate).not.toHaveBeenCalled();
    },
  );

  it("o bloqueio devolve o que foi marcado, para o formulário repor", async () => {
    dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo({ contratoEm: null, conformidadeEm: null }));
    const r = await analisar({ fornecedorRegular: "on", parecer: "texto", decisao: "rascunho" });
    expect(r.valores?.parecer).toBe("texto");
    expect(r.valores?.respostas.fornecedorRegular).toBe(true);
  });

  it("sem itens cadastrados (etapa 3) a conformidade também espera", async () => {
    dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo({ totalItens: 0, contratoEm: null, conformidadeEm: null }));
    const r = await analisar({ ...CONFORMIDADE_COMPLETA, decisao: "rascunho" });
    expect(r.erro).toContain("falta a etapa 3 (Cadastrar itens e saldos");
    expect(dobles.conformidadeUpsert).not.toHaveBeenCalled();
  });

  it("com o contrato, o jurídico registra a conformidade e conclui na mesma ação", async () => {
    dobles.carregarAtaNoCiclo.mockResolvedValue(ataNoCiclo({ conformidadeEm: null }));
    const r = await analisar({ ...CONFORMIDADE_COMPLETA, decisao: "concluir" });
    expect(r).toMatchObject({ mensagem: "Conformidade concluída. A ata já está disponível para a equipe de vendas." });
    expect(dobles.conformidadeUpsert).toHaveBeenCalledTimes(1);
    expect(dobles.ataUpdate).toHaveBeenCalledWith({ where: { id: "ata1" }, data: { status: "APROVADA" } });
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

describe("analisarAta: rascunho e conclusão (não há aprovação nem rejeição à parte)", () => {
  const analisar = (campos: Record<string, string>) => analisarAta("ata1", {}, formulario(campos));

  it("a análise é da permissão de conformidade e de mais nenhuma", async () => {
    await analisar({ ...CONFORMIDADE_COMPLETA, decisao: "rascunho" });
    expect(dobles.exigirPermissaoDe).toHaveBeenCalledWith("adm1", "atas.conformidade", "admin.analisarAta");
  });

  it("rascunho guarda o checklist e o parecer, mas NÃO libera a ata", async () => {
    const r = await analisar({ ...CONFORMIDADE_COMPLETA, parecer: "Tudo certo.", decisao: "rascunho" });
    expect(r).toMatchObject({ mensagem: expect.stringContaining("Rascunho salvo") });
    expect(dobles.conformidadeUpsert).toHaveBeenCalledTimes(1);
    expect(dobles.conformidadeUpsert.mock.calls[0][0].update).toMatchObject({ parecer: "Tudo certo.", responsavelId: "adm1" });
    expect(dobles.ataUpdate).not.toHaveBeenCalled();
  });

  it("rascunho com itens pendentes e sem parecer é aceito: só a conclusão exige o parecer", async () => {
    const r = await analisar({ fornecedorRegular: "on", decisao: "rascunho" });
    expect(r.erro).toBeUndefined();
    expect(dobles.conformidadeUpsert).toHaveBeenCalledTimes(1);
    expect(dobles.ataUpdate).not.toHaveBeenCalled();
  });

  it("concluir com o checklist completo libera a ata", async () => {
    const r = await analisar({ ...CONFORMIDADE_COMPLETA, decisao: "concluir" });
    expect(r).toMatchObject({ mensagem: "Conformidade concluída. A ata já está disponível para a equipe de vendas." });
    expect(dobles.conformidadeUpsert).toHaveBeenCalledTimes(1);
    expect(dobles.ataUpdate).toHaveBeenCalledWith({ where: { id: "ata1" }, data: { status: "APROVADA" } });
  });

  it("concluir com item pendente exige parecer (conclusão com ressalva)", async () => {
    const r = await analisar({ fornecedorRegular: "on", decisao: "concluir" });
    expect(r.erro).toMatch(/Para concluir com ressalva, escreva o parecer/);
    expect(dobles.conformidadeUpsert).not.toHaveBeenCalled();
    expect(dobles.ataUpdate).not.toHaveBeenCalled();

    const ok = await analisar({ fornecedorRegular: "on", parecer: "Falta a anuência, mas há prazo.", decisao: "concluir" });
    expect(ok).toMatchObject({ mensagem: expect.stringContaining("com ressalva") });
    expect(dobles.ataUpdate).toHaveBeenCalledWith({ where: { id: "ata1" }, data: { status: "APROVADA" } });
  });

  it("o nome antigo do botão (aprovar) vale como concluir, para formulário aberto antes da troca", async () => {
    const r = await analisar({ ...CONFORMIDADE_COMPLETA, decisao: "aprovar" });
    expect(r).toMatchObject({ mensagem: expect.stringContaining("Conformidade concluída") });
    expect(dobles.ataUpdate).toHaveBeenCalledTimes(1);
  });

  it("sem escolha de botão, vale o rascunho: nunca libera por engano", async () => {
    await analisar({ ...CONFORMIDADE_COMPLETA });
    expect(dobles.conformidadeUpsert).toHaveBeenCalledTimes(1);
    expect(dobles.ataUpdate).not.toHaveBeenCalled();
  });

  it("ata inexistente devolve erro", async () => {
    dobles.ataFindUnique.mockResolvedValue(null);
    await expect(analisar({ decisao: "rascunho" })).resolves.toEqual({ erro: "Ata não encontrada." });
  });
});

describe("definirTituloPublicoAta não deixa o título entregar a ata (16/11/2026)", () => {
  const ATA = {
    numero: "11/2026",
    orgaoGerenciador: { nome: "Município de Rio Verde", municipio: "Rio Verde" },
    fornecedor: { razaoSocial: "Limpa Tudo Comercio Ltda" },
  };
  const definir = (titulo: string) => definirTituloPublicoAta({}, formulario({ ataId: "ata1", tituloPublico: titulo }));

  it("título com o município é recusado e nada é gravado", async () => {
    dobles.ataFindUnique.mockResolvedValue(ATA);
    const r = await definir("Ata de limpeza de Rio Verde");
    expect(r.erro).toContain("não pode revelar o município");
    expect(dobles.ataUpdate).not.toHaveBeenCalled();
  });

  it("título com o fornecedor ou o número também", async () => {
    dobles.ataFindUnique.mockResolvedValue(ATA);
    expect((await definir("Ata Limpa Tudo de limpeza")).erro).toContain("o fornecedor");
    expect((await definir("Ata 11/2026 de limpeza")).erro).toContain("o número da ata");
    expect(dobles.ataUpdate).not.toHaveBeenCalled();
  });

  it("título genérico é gravado", async () => {
    dobles.ataFindUnique.mockResolvedValue(ATA);
    const r = await definir("Ata de material de limpeza");
    expect(r).toEqual({ sucesso: true });
    expect(dobles.ataUpdate).toHaveBeenCalledWith({ where: { id: "ata1" }, data: { tituloPublico: "Ata de material de limpeza" } });
  });

  it("ata que não existe devolve erro", async () => {
    dobles.ataFindUnique.mockResolvedValue(null);
    expect((await definir("Ata de material de limpeza")).erro).toBe("Ata não encontrada.");
    expect(dobles.ataUpdate).not.toHaveBeenCalled();
  });
});
