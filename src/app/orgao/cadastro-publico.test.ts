import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cadastro público de órgão e de fornecedor (14/11/2026): a conta nasce inativa, aguardando a liberação
 * da equipe, sem sessão e com o CNPJ conferido. Banco, sessão e limites trocados por dublês.
 */
const d = vi.hoisted(() => ({
  criarSessaoOrgao: vi.fn(),
  criarSessaoFornecedor: vi.fn(),
  registrarAuditoria: vi.fn(),
  redirect: vi.fn(),
  orgaoFindFirst: vi.fn(),
  orgaoFindUnique: vi.fn(),
  orgaoCreate: vi.fn(),
  fornecedorFindFirst: vi.fn(),
  fornecedorFindUnique: vi.fn(),
  fornecedorCreate: vi.fn(),
  fornecedorUpdate: vi.fn(),
  verificarSenha: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: d.redirect }));
vi.mock("@/lib/auth", () => ({
  criarSessaoOrgao: d.criarSessaoOrgao,
  criarSessaoFornecedor: d.criarSessaoFornecedor,
  encerrarSessaoOrgao: vi.fn(),
  encerrarSessaoFornecedor: vi.fn(),
  orgaoIdLogado: vi.fn(),
  fornecedorIdLogado: vi.fn(),
  gastarTempoDeHash: vi.fn(),
  hashSenha: vi.fn(async () => "hash"),
  verificarSenha: d.verificarSenha,
}));
vi.mock("@/lib/limite-tentativas", () => ({
  checarBloqueioLogin: vi.fn(async () => null),
  checarLimiteCadastro: vi.fn(async () => null),
  registrarFalhaLogin: vi.fn(),
  registrarSucessoLogin: vi.fn(),
}));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: d.registrarAuditoria }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    orgao: { findFirst: d.orgaoFindFirst, findUnique: d.orgaoFindUnique, create: d.orgaoCreate },
    fornecedor: {
      findFirst: d.fornecedorFindFirst,
      findUnique: d.fornecedorFindUnique,
      create: d.fornecedorCreate,
      update: d.fornecedorUpdate,
    },
  },
}));

import { cadastrarFornecedor, loginFornecedor } from "../fornecedor/actions";
import { cadastrarOrgao, loginOrgao } from "./actions";
import { MENSAGEM_AGUARDANDO_LIBERACAO, MENSAGEM_CADASTRO_RECEBIDO, MENSAGEM_CONTA_DESATIVADA } from "@/lib/cadastro-publico";

const SENHA = "Senha-Forte-2026!";
const CNPJ = "12.345.678/0001-95";
const DIGITOS = "12345678000195";

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const ORGAO = { nome: "Prefeitura de Exemplo", cnpj: CNPJ, uf: "go", municipio: "Exemplo", esfera: "municipal", email: "compras@exemplo.gov.br", senha: SENHA };
const FORNECEDOR = { razaoSocial: "Empresa Exemplo Ltda", cnpj: CNPJ, telefone: "(62) 3333-4444", email: "vendas@empresa.example", senha: SENHA };

beforeEach(() => {
  vi.clearAllMocks();
  d.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  d.orgaoFindFirst.mockResolvedValue(null);
  d.orgaoCreate.mockResolvedValue({ id: "org1" });
  d.fornecedorFindFirst.mockResolvedValue(null);
  d.fornecedorCreate.mockResolvedValue({ id: "forn1" });
  d.fornecedorUpdate.mockResolvedValue({ id: "forn1" });
  d.verificarSenha.mockResolvedValue(true);
});

describe("cadastrarOrgao", () => {
  it("cria a conta inativa e aguardando liberação, com o CNPJ só em dígitos, e NÃO abre sessão", async () => {
    const r = await cadastrarOrgao({}, form(ORGAO));
    expect(r).toEqual({ sucesso: MENSAGEM_CADASTRO_RECEBIDO });
    expect(d.orgaoCreate.mock.calls[0][0].data).toMatchObject({
      cnpj: DIGITOS,
      uf: "GO",
      email: "compras@exemplo.gov.br",
      ativo: false,
      aguardaLiberacao: true,
    });
    expect(d.criarSessaoOrgao).not.toHaveBeenCalled();
    expect(d.redirect).not.toHaveBeenCalled();
    expect(d.registrarAuditoria).toHaveBeenCalledWith({ ator: "orgao:org1", acao: "orgao.cadastro" });
  });

  it.each([
    ["dígito verificador errado", "12.345.678/0001-96"],
    ["CPF", "123.456.789-09"],
    ["tudo igual", "11.111.111/1111-11"],
    ["letras", "abc"],
  ])("recusa CNPJ com %s, sem criar nada", async (_nome, cnpj) => {
    const r = await cadastrarOrgao({}, form({ ...ORGAO, cnpj }));
    expect(r.erro).toContain("CNPJ inválido");
    expect(d.orgaoCreate).not.toHaveBeenCalled();
  });

  it("acha o órgão já cadastrado pelo CNPJ nas duas formas (só dígitos ou com máscara)", async () => {
    d.orgaoFindFirst.mockResolvedValue({ id: "ja" });
    const r = await cadastrarOrgao({}, form(ORGAO));
    expect(r.erro).toContain("Já existe");
    expect(d.orgaoFindFirst.mock.calls[0][0].where.OR[0]).toEqual({ cnpj: { in: [DIGITOS, CNPJ] } });
    expect(d.orgaoCreate).not.toHaveBeenCalled();
  });
});

describe("loginOrgao com a conta inativa", () => {
  it("cadastro novo: diz que aguarda a liberação; conta desativada: diz que foi desativada; nenhuma abre sessão", async () => {
    d.orgaoFindUnique.mockResolvedValue({ id: "o", senhaHash: "h", ativo: false, aguardaLiberacao: true });
    expect(await loginOrgao({}, form({ email: "a@b.gov.br", senha: SENHA }))).toEqual({ erro: MENSAGEM_AGUARDANDO_LIBERACAO });
    d.orgaoFindUnique.mockResolvedValue({ id: "o", senhaHash: "h", ativo: false, aguardaLiberacao: false });
    expect(await loginOrgao({}, form({ email: "a@b.gov.br", senha: SENHA }))).toEqual({ erro: MENSAGEM_CONTA_DESATIVADA });
    expect(d.criarSessaoOrgao).not.toHaveBeenCalled();
  });
});

describe("cadastrarFornecedor", () => {
  it("empresa nova: cria inativa e aguardando liberação, sem sessão", async () => {
    const r = await cadastrarFornecedor({}, form(FORNECEDOR));
    expect(r).toEqual({ sucesso: MENSAGEM_CADASTRO_RECEBIDO });
    expect(d.fornecedorCreate.mock.calls[0][0].data).toMatchObject({
      cnpj: DIGITOS,
      razaoSocial: "Empresa Exemplo Ltda",
      ativo: false,
      aguardaLiberacao: true,
    });
    expect(d.criarSessaoFornecedor).not.toHaveBeenCalled();
    expect(d.redirect).not.toHaveBeenCalled();
  });

  it("reivindicar o registro que a equipe já criou (sem senha): vira pendente e NÃO troca a razão social", async () => {
    d.fornecedorFindFirst.mockResolvedValueOnce({ id: "existente", senhaHash: null }).mockResolvedValueOnce(null);
    const r = await cadastrarFornecedor({}, form({ ...FORNECEDOR, razaoSocial: "Outro Nome Qualquer" }));
    expect(r.sucesso).toBeTruthy();
    expect(d.fornecedorUpdate).toHaveBeenCalledTimes(1);
    const { where, data } = d.fornecedorUpdate.mock.calls[0][0];
    expect(where).toEqual({ id: "existente" });
    expect(data).toMatchObject({ ativo: false, aguardaLiberacao: true, email: "vendas@empresa.example" });
    expect(data).not.toHaveProperty("razaoSocial");
    expect(d.fornecedorCreate).not.toHaveBeenCalled();
    expect(d.criarSessaoFornecedor).not.toHaveBeenCalled();
  });

  it("procura o CNPJ nas duas formas e recusa quem já tem senha", async () => {
    d.fornecedorFindFirst.mockResolvedValueOnce({ id: "x", senhaHash: "ja-tem" });
    const r = await cadastrarFornecedor({}, form(FORNECEDOR));
    expect(r.erro).toContain("Faça login");
    expect(d.fornecedorFindFirst.mock.calls[0][0].where).toEqual({ cnpj: { in: [DIGITOS, CNPJ] } });
    expect(d.fornecedorCreate).not.toHaveBeenCalled();
    expect(d.fornecedorUpdate).not.toHaveBeenCalled();
  });

  it("recusa CNPJ inválido sem tocar no banco", async () => {
    const r = await cadastrarFornecedor({}, form({ ...FORNECEDOR, cnpj: "12.345.678/0001-96" }));
    expect(r.erro).toContain("CNPJ inválido");
    expect(d.fornecedorFindFirst).not.toHaveBeenCalled();
    expect(d.fornecedorCreate).not.toHaveBeenCalled();
  });
});

describe("loginFornecedor com a conta inativa", () => {
  it("distingue cadastro aguardando liberação de conta desativada", async () => {
    d.fornecedorFindUnique.mockResolvedValue({ id: "f", senhaHash: "h", ativo: false, aguardaLiberacao: true });
    expect(await loginFornecedor({}, form({ email: "a@b.com", senha: SENHA }))).toEqual({ erro: MENSAGEM_AGUARDANDO_LIBERACAO });
    d.fornecedorFindUnique.mockResolvedValue({ id: "f", senhaHash: "h", ativo: false, aguardaLiberacao: false });
    expect(await loginFornecedor({}, form({ email: "a@b.com", senha: SENHA }))).toEqual({ erro: MENSAGEM_CONTA_DESATIVADA });
    expect(d.criarSessaoFornecedor).not.toHaveBeenCalled();
  });
});
