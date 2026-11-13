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
  adminDeleteMany: vi.fn(),
  vendedorUpdate: vi.fn(),
  vendedorFindUnique: vi.fn(),
  vendedorDelete: vi.fn(),
  credenciamentoDeleteMany: vi.fn(),
  transaction: vi.fn(),
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
      deleteMany: dobles.adminDeleteMany,
    },
    vendedor: { update: dobles.vendedorUpdate, findUnique: dobles.vendedorFindUnique, delete: dobles.vendedorDelete },
    credenciamentoConsultor: { deleteMany: dobles.credenciamentoDeleteMany },
    $transaction: dobles.transaction,
  },
}));

import {
  alternarAtivoMembro,
  atualizarMembroEquipe,
  atualizarVendedor,
  criarMembroEquipe,
  excluirMembroEquipe,
  excluirVendedor,
  redefinirSenha,
} from "./equipe-actions";

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
  dobles.adminDeleteMany.mockResolvedValue({ count: 1 });
  dobles.vendedorDelete.mockResolvedValue({});
  dobles.credenciamentoDeleteMany.mockResolvedValue({ count: 0 });
  dobles.transaction.mockResolvedValue([]);
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
    ["excluirMembroEquipe", () => excluirMembroEquipe({}, formulario({}))],
    ["atualizarVendedor", () => atualizarVendedor({}, formulario({}))],
    ["excluirVendedor", () => excluirVendedor({}, formulario({}))],
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
    ["excluirMembroEquipe", () => excluirMembroEquipe({}, {} as FormData)],
    ["atualizarVendedor", () => atualizarVendedor({}, {} as FormData)],
    ["excluirVendedor", () => excluirVendedor({}, {} as FormData)],
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

describe("atualizarMembroEquipe: nome e e-mail", () => {
  const ALVO = { id: "adm2", ativo: true, cargo: null, permissoes: ["atas.contrato"], nome: "Nome Antigo", email: "antigo@exemplo.com" };

  it("muda o nome e o e-mail (em minúsculas) junto com cargo e permissões, e a trilha diz o que mudou sem repetir os valores", async () => {
    dobles.adminFindUnique.mockResolvedValue(ALVO);
    const r = await atualizarMembroEquipe(
      {},
      formulario({ adminId: "adm2", nome: "  Nome Novo ", email: " NOVO@Exemplo.com ", cargo: "Jurídico", permissao: ["atas.contrato"] }),
    );
    expect(r).toEqual({ ok: true });
    expect(dobles.adminUpdate).toHaveBeenCalledWith({
      where: { id: "adm2" },
      data: { cargo: "Jurídico", permissoes: ["atas.contrato"], nome: "Nome Novo", email: "novo@exemplo.com" },
    });
    const detalhe = dobles.registrarAuditoria.mock.calls[0][0].detalhe as string;
    expect(detalhe).toContain("nome alterado");
    expect(detalhe).toContain("e-mail alterado");
    expect(detalhe).not.toContain("Nome Novo");
    expect(detalhe).not.toContain("novo@exemplo.com");
  });

  it("nome e e-mail iguais ao que já estava não vão para o banco", async () => {
    dobles.adminFindUnique.mockResolvedValue(ALVO);
    await atualizarMembroEquipe({}, formulario({ adminId: "adm2", nome: "Nome Antigo", email: "antigo@exemplo.com", permissao: ["atas.contrato"] }));
    expect(dobles.adminUpdate.mock.calls[0][0].data).toEqual({ cargo: null, permissoes: ["atas.contrato"] });
  });

  it("recusa nome vazio e e-mail inválido, sem gravar", async () => {
    dobles.adminFindUnique.mockResolvedValue(ALVO);
    expect(await atualizarMembroEquipe({}, formulario({ adminId: "adm2", nome: "  ", email: "a@b.co" }))).toEqual({ erro: "Informe o nome." });
    expect(await atualizarMembroEquipe({}, formulario({ adminId: "adm2", nome: "X", email: "sem-arroba" }))).toEqual({ erro: "Informe um e-mail válido." });
    expect(dobles.adminUpdate).not.toHaveBeenCalled();
  });

  it("e-mail que outra conta já usa: avisa, sem derrubar", async () => {
    dobles.adminFindUnique.mockResolvedValue(ALVO);
    dobles.adminUpdate.mockRejectedValue({ code: "P2002" });
    const r = await atualizarMembroEquipe({}, formulario({ adminId: "adm2", nome: "X", email: "outro@exemplo.com", permissao: ["atas.contrato"] }));
    expect(r).toEqual({ erro: "Já existe uma conta com esse e-mail." });
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("outro erro do banco não é confundido com e-mail repetido", async () => {
    dobles.adminFindUnique.mockResolvedValue(ALVO);
    dobles.adminUpdate.mockRejectedValue(new Error("banco fora"));
    await expect(atualizarMembroEquipe({}, formulario({ adminId: "adm2", nome: "X", email: "a@b.co" }))).rejects.toThrow("banco fora");
  });
});

describe("excluirMembroEquipe", () => {
  it("exclui outra conta em definitivo e audita quem foi, sem o e-mail", async () => {
    dobles.adminFindUnique.mockResolvedValue({ id: "adm2", nome: "Fulano de Tal", cargo: "Estagiário", ativo: true, permissoes: ["atas.itens"] });
    await expect(excluirMembroEquipe({}, formulario({ adminId: "adm2" }))).resolves.toEqual({ ok: true });
    expect(dobles.adminDeleteMany).toHaveBeenCalledWith({ where: { id: "adm2" } });
    expect(dobles.registrarAuditoria.mock.calls[0][0]).toMatchObject({
      acao: "admin.excluirMembroEquipe",
      alvo: "adm2",
      detalhe: "conta de Fulano de Tal (Estagiário) excluída",
    });
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/usuarios");
  });

  it("ninguém exclui a própria conta", async () => {
    await expect(excluirMembroEquipe({}, formulario({ adminId: "adm1" }))).resolves.toEqual({ erro: "Você não pode excluir a própria conta." });
    expect(dobles.adminFindUnique).not.toHaveBeenCalled();
    expect(dobles.adminDeleteMany).not.toHaveBeenCalled();
  });

  it("recusa excluir o último gestor de usuários ativo, mas deixa excluir um gestor já desativado", async () => {
    dobles.adminFindUnique.mockResolvedValue({ id: "adm2", nome: "G", cargo: null, ativo: true, permissoes: ["usuarios.gerir"] });
    dobles.adminCount.mockResolvedValue(0);
    expect((await excluirMembroEquipe({}, formulario({ adminId: "adm2" }))).erro).toMatch(/sem nenhum gestor de usuários ativo/);
    expect(dobles.adminDeleteMany).not.toHaveBeenCalled();

    dobles.adminFindUnique.mockResolvedValue({ id: "adm2", nome: "G", cargo: null, ativo: false, permissoes: ["usuarios.gerir"] });
    await expect(excluirMembroEquipe({}, formulario({ adminId: "adm2" }))).resolves.toEqual({ ok: true });
  });

  it("conta que não existe, id fora do formato e exclusão que não achou nada", async () => {
    dobles.adminFindUnique.mockResolvedValue(null);
    expect(await excluirMembroEquipe({}, formulario({ adminId: "adm2" }))).toEqual({ erro: "Conta não encontrada." });
    expect(await excluirMembroEquipe({}, formulario({ adminId: "x y; drop" }))).toEqual({ erro: "Conta não encontrada." });
    dobles.adminFindUnique.mockResolvedValue({ id: "adm2", nome: "G", cargo: null, ativo: true, permissoes: [] });
    dobles.adminDeleteMany.mockResolvedValue({ count: 0 });
    expect(await excluirMembroEquipe({}, formulario({ adminId: "adm2" }))).toEqual({ erro: "Conta não encontrada." });
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe("atualizarVendedor", () => {
  const ALVO = { id: "v1", nome: "Leide", email: "leide@exemplo.com", tipo: "interno" };

  it("muda nome, e-mail e tipo e audita só o que mudou", async () => {
    dobles.vendedorFindUnique.mockResolvedValue(ALVO);
    const r = await atualizarVendedor({}, formulario({ vendedorId: "v1", nome: " Leide Souza ", email: "LEIDE.S@exemplo.com", tipo: "externo" }));
    expect(r).toEqual({ ok: true });
    expect(dobles.vendedorUpdate).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { nome: "Leide Souza", email: "leide.s@exemplo.com", tipo: "externo" },
    });
    expect(dobles.registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "admin.atualizarVendedor", detalhe: "alterado: nome, e-mail, tipo" });
  });

  it("sem mudança nada é gravado; dado inválido é recusado", async () => {
    dobles.vendedorFindUnique.mockResolvedValue(ALVO);
    expect(await atualizarVendedor({}, formulario({ vendedorId: "v1", nome: "Leide", email: "leide@exemplo.com", tipo: "interno" }))).toEqual({ ok: true });
    expect(dobles.vendedorUpdate).not.toHaveBeenCalled();
    expect((await atualizarVendedor({}, formulario({ vendedorId: "v1", nome: "", email: "a@b.co", tipo: "interno" }))).erro).toBe("Informe o nome.");
    expect((await atualizarVendedor({}, formulario({ vendedorId: "v1", nome: "X", email: "ruim", tipo: "interno" }))).erro).toBe("Informe um e-mail válido.");
    expect((await atualizarVendedor({}, formulario({ vendedorId: "v1", nome: "X", email: "a@b.co", tipo: "gerente" }))).erro).toBe("Selecione um tipo de consultor válido.");
    expect(dobles.vendedorUpdate).not.toHaveBeenCalled();
  });

  it("e-mail repetido avisa; consultor que não existe também", async () => {
    dobles.vendedorFindUnique.mockResolvedValue(ALVO);
    dobles.vendedorUpdate.mockRejectedValue({ code: "P2002" });
    expect(await atualizarVendedor({}, formulario({ vendedorId: "v1", nome: "Leide", email: "outro@exemplo.com", tipo: "interno" }))).toEqual({ erro: "Já existe uma conta com esse e-mail." });
    dobles.vendedorFindUnique.mockResolvedValue(null);
    expect(await atualizarVendedor({}, formulario({ vendedorId: "v1", nome: "X", email: "a@b.co", tipo: "interno" }))).toEqual({ erro: "Consultor não encontrado." });
  });
});

describe("excluirVendedor", () => {
  const SEM_HISTORIA = { id: "v1", nome: "Leide", _count: { atas: 0, oportunidades: 0, pedidosNegociacao: 0 } };

  it("exclui o consultor sem história junto com o credenciamento dele, numa transação, e audita", async () => {
    dobles.vendedorFindUnique.mockResolvedValue(SEM_HISTORIA);
    await expect(excluirVendedor({}, formulario({ vendedorId: "v1" }))).resolves.toEqual({ ok: true });
    expect(dobles.transaction).toHaveBeenCalledTimes(1);
    expect(dobles.credenciamentoDeleteMany).toHaveBeenCalledWith({ where: { vendedorId: "v1" } });
    expect(dobles.vendedorDelete).toHaveBeenCalledWith({ where: { id: "v1" } });
    expect(dobles.registrarAuditoria.mock.calls[0][0]).toMatchObject({ acao: "admin.excluirVendedor", alvo: "v1" });
  });

  it.each([
    ["atas", { atas: 1, oportunidades: 0, pedidosNegociacao: 0 }],
    ["municípios", { atas: 0, oportunidades: 3, pedidosNegociacao: 0 }],
    ["pedidos", { atas: 0, oportunidades: 0, pedidosNegociacao: 2 }],
  ])("com %s no histórico não exclui: manda desativar", async (_nome, contagem) => {
    dobles.vendedorFindUnique.mockResolvedValue({ ...SEM_HISTORIA, _count: contagem });
    const r = await excluirVendedor({}, formulario({ vendedorId: "v1" }));
    expect(r.erro).toContain("Desative a conta");
    expect(dobles.transaction).not.toHaveBeenCalled();
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("falha do banco na exclusão vira aviso, sem auditar; consultor inexistente também", async () => {
    dobles.vendedorFindUnique.mockResolvedValue(SEM_HISTORIA);
    dobles.transaction.mockRejectedValue(new Error("fk"));
    expect((await excluirVendedor({}, formulario({ vendedorId: "v1" }))).erro).toContain("Desative a conta");
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    dobles.vendedorFindUnique.mockResolvedValue(null);
    expect(await excluirVendedor({}, formulario({ vendedorId: "v1" }))).toEqual({ erro: "Consultor não encontrado." });
  });
});
