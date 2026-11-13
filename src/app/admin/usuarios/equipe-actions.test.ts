import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Equipe interna: criar conta, editar permissões e ativar ou desativar. O
 * Prisma, a sessão, a permissão e a auditoria são trocados por dublês; o que se
 * confere é a ordem (sessão e permissão antes do formulário), o que é gravado,
 * o que vai para a trilha e a trava que impede ficar sem gestor de usuários.
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  hashSenha: vi.fn(),
  exigirPermissaoDe: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  adminCreate: vi.fn(),
  adminFindUnique: vi.fn(),
  adminUpdate: vi.fn(),
  adminCount: vi.fn(),
  vendedorUpdate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: dobles.redirect }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado, hashSenha: dobles.hashSenha }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("@/lib/permissoes-db", () => ({ exigirPermissaoDe: dobles.exigirPermissaoDe }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: {
      create: dobles.adminCreate,
      findUnique: dobles.adminFindUnique,
      update: dobles.adminUpdate,
      count: dobles.adminCount,
    },
    vendedor: { update: dobles.vendedorUpdate },
  },
}));

import { alternarAtivoMembro, atualizarMembroEquipe, criarMembroEquipe, redefinirSenha } from "./equipe-actions";

const SENHA_BOA = "Chuva-de-Ouro-2026!";

function formulario(campos: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) f.append(nome, v);
  }
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.adminIdLogado.mockResolvedValue("adm1");
  dobles.exigirPermissaoDe.mockResolvedValue(undefined);
  dobles.hashSenha.mockResolvedValue("hash-da-senha");
  dobles.adminCreate.mockResolvedValue({ id: "novo1" });
  dobles.adminUpdate.mockResolvedValue({});
  dobles.adminCount.mockResolvedValue(1);
  dobles.vendedorUpdate.mockResolvedValue({});
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
});

describe("sessão e permissão primeiro", () => {
  it.each([
    ["criarMembroEquipe", () => criarMembroEquipe({}, formulario({}))],
    ["atualizarMembroEquipe", () => atualizarMembroEquipe({}, formulario({}))],
    ["alternarAtivoMembro", () => alternarAtivoMembro({}, formulario({}))],
    ["redefinirSenha", () => redefinirSenha({}, formulario({}))],
  ])("%s sem sessão manda para o login e não toca no banco", async (_nome, chamar) => {
    dobles.adminIdLogado.mockResolvedValue(null);
    await expect(chamar()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(dobles.exigirPermissaoDe).not.toHaveBeenCalled();
    expect(dobles.adminCreate).not.toHaveBeenCalled();
    expect(dobles.adminUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["criarMembroEquipe", () => criarMembroEquipe({}, {} as FormData)],
    ["atualizarMembroEquipe", () => atualizarMembroEquipe({}, {} as FormData)],
    ["alternarAtivoMembro", () => alternarAtivoMembro({}, {} as FormData)],
    ["redefinirSenha", () => redefinirSenha({}, {} as FormData)],
  ])("%s sem a permissão de gerir usuários para antes de ler o formulário", async (_nome, chamar) => {
    dobles.exigirPermissaoDe.mockRejectedValue(new Error("NEXT_REDIRECT:/admin?acesso=negado"));
    await expect(chamar()).rejects.toThrow("NEXT_REDIRECT:/admin?acesso=negado");
    expect(dobles.exigirPermissaoDe).toHaveBeenCalledWith("adm1", "usuarios.gerir");
    expect(dobles.adminCreate).not.toHaveBeenCalled();
    expect(dobles.adminUpdate).not.toHaveBeenCalled();
  });
});

describe("criarMembroEquipe", () => {
  const base = { nome: "Rui Aprovador", email: "Rui@Exemplo.com.br", senha: SENHA_BOA, cargo: "Aprovador de atas" };

  it("cria com as permissões marcadas, e-mail em minúsculas, e audita sem a senha", async () => {
    const r = await criarMembroEquipe({}, formulario({ ...base, permissao: ["atas.aprovar", "adesao.instruir", "lixo"] }));
    expect(r).toEqual({ ok: true });
    expect(dobles.adminCreate).toHaveBeenCalledWith({
      data: {
        nome: "Rui Aprovador",
        email: "rui@exemplo.com.br",
        senhaHash: "hash-da-senha",
        cargo: "Aprovador de atas",
        permissoes: ["atas.aprovar", "adesao.instruir"],
        senhaProvisoria: true,
      },
      select: { id: true },
    });
    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    const evento = dobles.registrarAuditoria.mock.calls[0][0];
    expect(evento).toMatchObject({ ator: "admin:adm1", acao: "admin.criarMembroEquipe", alvo: "novo1" });
    expect(evento.detalhe).toContain("atas.aprovar, adesao.instruir");
    expect(JSON.stringify(evento)).not.toContain(SENHA_BOA);
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/usuarios");
  });

  it("sem nenhuma caixa marcada, usa as permissões do perfil pronto", async () => {
    await criarMembroEquipe({}, formulario({ ...base, perfil: "aprovador" }));
    expect(dobles.adminCreate.mock.calls[0][0].data.permissoes).toEqual(["atas.aprovar", "adesao.instruir"]);
  });

  it("sem caixa e sem perfil, a conta nasce sem permissão nenhuma", async () => {
    await criarMembroEquipe({}, formulario(base));
    expect(dobles.adminCreate.mock.calls[0][0].data.permissoes).toEqual([]);
  });

  it("nunca concede o financeiro da SCP: o campo nem existe na gravação", async () => {
    await criarMembroEquipe({}, formulario({ ...base, acessoFinanceiro: "on" }));
    expect(dobles.adminCreate.mock.calls[0][0].data).not.toHaveProperty("acessoFinanceiro");
  });

  it.each([
    ["sem nome", { ...base, nome: "  " }, "Informe nome e e-mail."],
    ["sem e-mail", { ...base, email: "" }, "Informe nome e e-mail."],
    ["e-mail sem arroba", { ...base, email: "rui.exemplo.com" }, "Informe um e-mail válido."],
  ])("%s é recusado antes de gravar", async (_nome, campos, erro) => {
    await expect(criarMembroEquipe({}, formulario(campos))).resolves.toEqual({ erro });
    expect(dobles.adminCreate).not.toHaveBeenCalled();
  });

  it("senha fraca é recusada antes de gravar", async () => {
    const r = await criarMembroEquipe({}, formulario({ ...base, senha: "123" }));
    expect(r.erro).toBeTruthy();
    expect(dobles.hashSenha).not.toHaveBeenCalled();
    expect(dobles.adminCreate).not.toHaveBeenCalled();
  });

  it("e-mail repetido devolve erro e não audita", async () => {
    dobles.adminCreate.mockRejectedValue(new Error("P2002"));
    await expect(criarMembroEquipe({}, formulario(base))).resolves.toEqual({
      erro: "Já existe uma conta de administração com esse e-mail.",
    });
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("corta cargo e nome longos", async () => {
    await criarMembroEquipe({}, formulario({ ...base, cargo: "c".repeat(200), nome: "n".repeat(300) }));
    const dados = dobles.adminCreate.mock.calls[0][0].data;
    expect(dados.cargo).toHaveLength(60);
    expect(dados.nome).toHaveLength(120);
  });
});

describe("atualizarMembroEquipe", () => {
  function alvo(extra = {}) {
    dobles.adminFindUnique.mockResolvedValue({
      id: "adm2",
      ativo: true,
      cargo: "Jurídico",
      permissoes: ["atas.contrato", "usuarios.gerir"],
      ...extra,
    });
  }

  it("grava o novo conjunto e audita o antes e o depois", async () => {
    alvo();
    const r = await atualizarMembroEquipe({}, formulario({ adminId: "adm2", cargo: " Cobrança ", permissao: ["comissao.cobrar", "usuarios.gerir"] }));
    expect(r).toEqual({ ok: true });
    expect(dobles.adminUpdate).toHaveBeenCalledWith({
      where: { id: "adm2" },
      data: { cargo: "Cobrança", permissoes: ["comissao.cobrar", "usuarios.gerir"] },
    });
    expect(dobles.registrarAuditoria.mock.calls[0][0]).toMatchObject({
      acao: "admin.atualizarMembroEquipe",
      alvo: "adm2",
      detalhe: "antes: atas.contrato, usuarios.gerir; depois: comissao.cobrar, usuarios.gerir",
    });
  });

  it("recusa tirar 'gerir usuários' do último gestor ativo", async () => {
    alvo();
    dobles.adminCount.mockResolvedValue(0);
    const r = await atualizarMembroEquipe({}, formulario({ adminId: "adm2", permissao: ["atas.contrato"] }));
    expect(r.erro).toMatch(/sem nenhum gestor de usuários ativo/);
    expect(dobles.adminUpdate).not.toHaveBeenCalled();
    expect(dobles.adminCount).toHaveBeenCalledWith({
      where: { id: { not: "adm2" }, ativo: true, permissoes: { has: "usuarios.gerir" } },
    });
  });

  it("permite tirar 'gerir usuários' quando outro gestor ativo existe", async () => {
    alvo();
    dobles.adminCount.mockResolvedValue(1);
    await expect(atualizarMembroEquipe({}, formulario({ adminId: "adm2", permissao: ["atas.contrato"] }))).resolves.toEqual({ ok: true });
  });

  it.each(["", "x y", "a".repeat(65)])("id inválido (%s) é recusado antes de consultar o banco", async (id) => {
    await expect(atualizarMembroEquipe({}, formulario({ adminId: id }))).resolves.toEqual({ erro: "Conta não encontrada." });
    expect(dobles.adminFindUnique).not.toHaveBeenCalled();
  });

  it("conta que não existe devolve erro e não grava", async () => {
    dobles.adminFindUnique.mockResolvedValue(null);
    await expect(atualizarMembroEquipe({}, formulario({ adminId: "adm9" }))).resolves.toEqual({ erro: "Conta não encontrada." });
    expect(dobles.adminUpdate).not.toHaveBeenCalled();
  });
});

describe("alternarAtivoMembro", () => {
  it("desativa outra conta e audita", async () => {
    dobles.adminFindUnique.mockResolvedValue({ id: "adm2", ativo: true, permissoes: ["atas.contrato"] });
    await expect(alternarAtivoMembro({}, formulario({ adminId: "adm2" }))).resolves.toEqual({ ok: true });
    expect(dobles.adminUpdate).toHaveBeenCalledWith({ where: { id: "adm2" }, data: { ativo: false } });
    expect(dobles.registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "admin.desativarMembroEquipe", alvo: "adm2" });
  });

  it("reativa uma conta desativada e audita", async () => {
    dobles.adminFindUnique.mockResolvedValue({ id: "adm2", ativo: false, permissoes: [] });
    await alternarAtivoMembro({}, formulario({ adminId: "adm2" }));
    expect(dobles.adminUpdate).toHaveBeenCalledWith({ where: { id: "adm2" }, data: { ativo: true } });
    expect(dobles.registrarAuditoria.mock.calls[0][0].acao).toBe("admin.ativarMembroEquipe");
  });

  it("ninguém desativa a própria conta", async () => {
    dobles.adminFindUnique.mockResolvedValue({ id: "adm1", ativo: true, permissoes: ["usuarios.gerir"] });
    await expect(alternarAtivoMembro({}, formulario({ adminId: "adm1" }))).resolves.toEqual({
      erro: "Você não pode desativar a própria conta.",
    });
    expect(dobles.adminUpdate).not.toHaveBeenCalled();
  });

  it("recusa desativar o último gestor de usuários ativo", async () => {
    dobles.adminFindUnique.mockResolvedValue({ id: "adm2", ativo: true, permissoes: ["usuarios.gerir"] });
    dobles.adminCount.mockResolvedValue(0);
    const r = await alternarAtivoMembro({}, formulario({ adminId: "adm2" }));
    expect(r.erro).toMatch(/sem nenhum gestor de usuários ativo/);
    expect(dobles.adminUpdate).not.toHaveBeenCalled();
  });
});

describe("senha provisória na criação", () => {
  const base = { nome: "Estagiária", email: "estagiaria@exemplo.com.br", cargo: "Captação" };

  it("sem senha digitada, o sistema gera uma, grava só o hash e devolve a senha uma vez", async () => {
    const r = await criarMembroEquipe({}, formulario({ ...base, senha: "" }));
    expect(r.ok).toBe(true);
    expect(r.senhaProvisoria).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
    expect(dobles.hashSenha).toHaveBeenCalledWith(r.senhaProvisoria);
    const dados = dobles.adminCreate.mock.calls[0][0].data;
    expect(dados.senhaHash).toBe("hash-da-senha");
    expect(dados.senhaProvisoria).toBe(true);
    const evento = dobles.registrarAuditoria.mock.calls[0][0];
    expect(evento.detalhe).toContain("senha gerada");
    expect(JSON.stringify(evento)).not.toContain(r.senhaProvisoria as string);
  });

  it("com senha digitada, não devolve senha na tela (quem digitou já a conhece)", async () => {
    const r = await criarMembroEquipe({}, formulario({ ...base, senha: SENHA_BOA }));
    expect(r).toEqual({ ok: true });
    expect(dobles.adminCreate.mock.calls[0][0].data.senhaProvisoria).toBe(true);
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toContain("senha digitada");
  });
});

describe("redefinirSenha", () => {
  it("admin: gera senha nova, derruba as sessões, marca como provisória e audita sem a senha", async () => {
    const r = await redefinirSenha({}, formulario({ tipo: "admin", id: "adm2" }));
    expect(r.ok).toBe(true);
    expect(r.senhaProvisoria).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
    expect(dobles.adminUpdate).toHaveBeenCalledWith({
      where: { id: "adm2" },
      data: { senhaHash: "hash-da-senha", senhaProvisoria: true, sessaoVersao: { increment: 1 } },
    });
    const evento = dobles.registrarAuditoria.mock.calls[0][0];
    expect(evento).toMatchObject({ ator: "admin:adm1", acao: "admin.redefinirSenha", alvo: "admin:adm2" });
    expect(JSON.stringify(evento)).not.toContain(r.senhaProvisoria as string);
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/usuarios");
  });

  it("vendedor: mesma coisa, na tabela de vendedores", async () => {
    const r = await redefinirSenha({}, formulario({ tipo: "vendedor", id: "ven1" }));
    expect(r.senhaProvisoria).toBeTruthy();
    expect(dobles.vendedorUpdate).toHaveBeenCalledWith({
      where: { id: "ven1" },
      data: { senhaHash: "hash-da-senha", senhaProvisoria: true, sessaoVersao: { increment: 1 } },
    });
    expect(dobles.adminUpdate).not.toHaveBeenCalled();
  });

  it("ninguém redefine a própria senha por aqui", async () => {
    await expect(redefinirSenha({}, formulario({ tipo: "admin", id: "adm1" }))).resolves.toEqual({
      erro: "Para trocar a sua própria senha, use a tela Perfil.",
    });
    expect(dobles.adminUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["tipo desconhecido", { tipo: "fornecedor", id: "x1" }],
    ["id com espaço", { tipo: "admin", id: "x y" }],
    ["id vazio", { tipo: "vendedor", id: "" }],
  ])("%s é recusado antes de gravar", async (_nome, campos) => {
    await expect(redefinirSenha({}, formulario(campos))).resolves.toEqual({ erro: "Conta não encontrada." });
    expect(dobles.adminUpdate).not.toHaveBeenCalled();
    expect(dobles.vendedorUpdate).not.toHaveBeenCalled();
  });

  it("conta que não existe devolve erro e não audita", async () => {
    dobles.adminUpdate.mockRejectedValue(new Error("P2025"));
    await expect(redefinirSenha({}, formulario({ tipo: "admin", id: "adm9" }))).resolves.toEqual({ erro: "Conta não encontrada." });
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });
});
