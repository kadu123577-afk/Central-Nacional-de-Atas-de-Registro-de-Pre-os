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
  },
}));

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
