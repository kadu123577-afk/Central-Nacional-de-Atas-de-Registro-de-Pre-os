import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Troca obrigatória da senha provisória: a sessão, o Prisma, a auditoria e o redirect
 * são trocados por dublês. O que se confere é a ordem (sessão antes do formulário), as
 * recusas (senhas diferentes, política de senha, igual à provisória) e o que é gravado.
 */
const d = vi.hoisted(() => ({
  contaParaTrocarSenha: vi.fn(),
  hashSenha: vi.fn(),
  verificarSenha: vi.fn(),
  criarSessaoAdmin: vi.fn(),
  criarSessaoVendedor: vi.fn(),
  registrarAuditoria: vi.fn(),
  redirect: vi.fn(),
  adminUpdate: vi.fn(),
  vendedorUpdate: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: d.redirect }));
vi.mock("@/lib/auth", () => ({
  hashSenha: d.hashSenha,
  verificarSenha: d.verificarSenha,
  criarSessaoAdmin: d.criarSessaoAdmin,
  criarSessaoVendedor: d.criarSessaoVendedor,
}));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: d.registrarAuditoria }));
vi.mock("@/lib/troca-senha", () => ({
  contaParaTrocarSenha: d.contaParaTrocarSenha,
  destinoDaConta: (tipo: string) => (tipo === "admin" ? "/admin" : "/vendedor"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { admin: { update: d.adminUpdate }, vendedor: { update: d.vendedorUpdate } },
}));

import { definirSenhaDefinitiva } from "./actions";

const NOVA = "Chuva-de-Ouro-2026!";

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

function conta(extra = {}) {
  d.contaParaTrocarSenha.mockResolvedValue({
    tipo: "admin",
    id: "adm1",
    email: "rui@exemplo.com.br",
    senhaHash: "hash-provisoria",
    provisoria: true,
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  conta();
  d.verificarSenha.mockResolvedValue(false);
  d.hashSenha.mockResolvedValue("hash-nova");
  d.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
});

describe("sessão primeiro", () => {
  it("sem sessão vai para o login e não lê o formulário", async () => {
    d.contaParaTrocarSenha.mockResolvedValue(null);
    await expect(definirSenhaDefinitiva({}, {} as FormData)).rejects.toThrow("NEXT_REDIRECT:/entrar");
    expect(d.adminUpdate).not.toHaveBeenCalled();
  });

  it("quem já tem senha definitiva volta para a própria área, sem gravar", async () => {
    conta({ provisoria: false });
    await expect(definirSenhaDefinitiva({}, formulario({ senhaNova: NOVA, confirmacao: NOVA }))).rejects.toThrow(
      "NEXT_REDIRECT:/admin",
    );
    expect(d.adminUpdate).not.toHaveBeenCalled();
  });
});

describe("recusas", () => {
  it("duas senhas diferentes", async () => {
    await expect(definirSenhaDefinitiva({}, formulario({ senhaNova: NOVA, confirmacao: NOVA + "x" }))).resolves.toEqual({
      erro: "As duas senhas não são iguais.",
    });
    expect(d.adminUpdate).not.toHaveBeenCalled();
  });

  it("senha fraca (política de senha)", async () => {
    const r = await definirSenhaDefinitiva({}, formulario({ senhaNova: "curta", confirmacao: "curta" }));
    expect(r.erro).toMatch(/ao menos 12 caracteres/);
    expect(d.hashSenha).not.toHaveBeenCalled();
  });

  it("senha que contém o e-mail", async () => {
    conta({ email: "aprovador.rui@exemplo.com.br" });
    const r = await definirSenhaDefinitiva({}, formulario({ senhaNova: "aprovador.rui-2026", confirmacao: "aprovador.rui-2026" }));
    expect(r.erro).toBeTruthy();
    expect(d.adminUpdate).not.toHaveBeenCalled();
  });

  it("igual à provisória", async () => {
    d.verificarSenha.mockResolvedValue(true);
    await expect(definirSenhaDefinitiva({}, formulario({ senhaNova: NOVA, confirmacao: NOVA }))).resolves.toEqual({
      erro: "Escolha uma senha diferente da provisória.",
    });
    expect(d.adminUpdate).not.toHaveBeenCalled();
  });

  it("arquivo no lugar do texto conta como campo vazio", async () => {
    const f = new FormData();
    f.set("senhaNova", new File(["x"], "x.txt"));
    f.set("confirmacao", new File(["x"], "x.txt"));
    const r = await definirSenhaDefinitiva({}, f);
    expect(r.erro).toBeTruthy();
    expect(d.adminUpdate).not.toHaveBeenCalled();
  });
});

describe("troca feita", () => {
  it("admin: grava a senha, tira a marca provisória, derruba a sessão antiga, abre outra e audita", async () => {
    await expect(definirSenhaDefinitiva({}, formulario({ senhaNova: NOVA, confirmacao: NOVA }))).rejects.toThrow(
      "NEXT_REDIRECT:/admin",
    );
    expect(d.adminUpdate).toHaveBeenCalledWith({
      where: { id: "adm1" },
      data: { senhaHash: "hash-nova", senhaProvisoria: false, sessaoVersao: { increment: 1 } },
    });
    expect(d.criarSessaoAdmin).toHaveBeenCalledWith("adm1");
    expect(d.registrarAuditoria).toHaveBeenCalledWith({ ator: "admin:adm1", acao: "admin.senha_definida" });
    expect(JSON.stringify(d.registrarAuditoria.mock.calls)).not.toContain(NOVA);
  });

  it("vendedor: mesma coisa, na tabela de vendedores, e vai para a área do vendedor", async () => {
    conta({ tipo: "vendedor", id: "ven1" });
    await expect(definirSenhaDefinitiva({}, formulario({ senhaNova: NOVA, confirmacao: NOVA }))).rejects.toThrow(
      "NEXT_REDIRECT:/vendedor",
    );
    expect(d.vendedorUpdate).toHaveBeenCalledWith({
      where: { id: "ven1" },
      data: { senhaHash: "hash-nova", senhaProvisoria: false, sessaoVersao: { increment: 1 } },
    });
    expect(d.criarSessaoVendedor).toHaveBeenCalledWith("ven1");
    expect(d.adminUpdate).not.toHaveBeenCalled();
  });
});
