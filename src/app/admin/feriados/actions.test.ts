import { beforeEach, describe, expect, it, vi } from "vitest";

/** Feriados extras da equipe, sem banco: sessão, permissão, Prisma e auditoria são dublês. */
const d = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  exigirPermissaoDe: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: d.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: d.redirect }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: d.adminIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: d.registrarAuditoria }));
vi.mock("@/lib/permissoes-db", () => ({ exigirPermissaoDe: d.exigirPermissaoDe }));
vi.mock("@/lib/prisma", () => ({ prisma: { feriado: { findUnique: d.findUnique, create: d.create, delete: d.delete } } }));

import { adicionarFeriado, removerFeriado } from "./actions";

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

const adicionar = (campos: Record<string, string>) => adicionarFeriado({}, formulario(campos));

beforeEach(() => {
  vi.clearAllMocks();
  d.adminIdLogado.mockResolvedValue("adm1");
  d.exigirPermissaoDe.mockResolvedValue(undefined);
  d.findUnique.mockResolvedValue(null);
  d.create.mockResolvedValue({});
  d.delete.mockResolvedValue({});
  d.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
});

describe("sessão e permissão primeiro", () => {
  it.each([
    ["adicionarFeriado", () => adicionar({ data: "2026-10-24", nome: "Aniversário de Goiânia" })],
    ["removerFeriado", () => removerFeriado("cmferiado000000000001")],
  ])("%s sem sessão vai para o login", async (_n, chamar) => {
    d.adminIdLogado.mockResolvedValue(null);
    await expect(chamar()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(d.create).not.toHaveBeenCalled();
    expect(d.delete).not.toHaveBeenCalled();
  });

  it.each([
    ["adicionarFeriado", () => adicionar({ data: "2026-10-24", nome: "Aniversário de Goiânia" }), "admin.adicionarFeriado"],
    ["removerFeriado", () => removerFeriado("cmferiado000000000001"), "admin.removerFeriado"],
  ])("%s exige a gestão (usuarios.gerir) antes de tocar no banco", async (_n, chamar, detalhe) => {
    d.exigirPermissaoDe.mockRejectedValue(new Error("NEXT_REDIRECT:/admin?acesso=negado"));
    await expect(chamar()).rejects.toThrow("NEXT_REDIRECT:/admin?acesso=negado");
    expect(d.exigirPermissaoDe).toHaveBeenCalledWith("adm1", "usuarios.gerir", detalhe);
    expect(d.findUnique).not.toHaveBeenCalled();
    expect(d.create).not.toHaveBeenCalled();
    expect(d.delete).not.toHaveBeenCalled();
  });
});

describe("adicionarFeriado", () => {
  it("grava a data como dia (sem hora), com o nome limpo e quem cadastrou, e audita", async () => {
    const r = await adicionar({ data: "2026-10-24", nome: "  Aniversário   de Goiânia (municipal) " });
    expect(r).toEqual({ ok: true });
    expect(d.create).toHaveBeenCalledWith({
      data: { data: new Date("2026-10-24T00:00:00Z"), nome: "Aniversário de Goiânia (municipal)", criadoPor: "admin:adm1" },
    });
    expect(d.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:adm1",
      acao: "admin.adicionarFeriado",
      alvo: "2026-10-24",
      detalhe: "Aniversário de Goiânia (municipal)",
    });
    expect(d.revalidatePath).toHaveBeenCalledWith("/admin/feriados");
  });

  it.each(["", "24/10/2026", "2026-13-01", "2026-02-30", "2026-10-24T00:00"])("data inválida (%s) é recusada", async (data) => {
    const r = await adicionar({ data, nome: "Feriado qualquer" });
    expect(r.erro).toBe("Informe uma data válida.");
    expect(d.create).not.toHaveBeenCalled();
  });

  it("recusa ano fora do intervalo", async () => {
    expect((await adicionar({ data: "2010-01-01", nome: "Feriado antigo" })).erro).toMatch(/entre 2024 e 2100/);
    expect((await adicionar({ data: "2101-01-01", nome: "Feriado distante" })).erro).toMatch(/entre 2024 e 2100/);
  });

  it.each(["", "ab", "a".repeat(81)])("nome inválido (%s) é recusado", async (nome) => {
    expect((await adicionar({ data: "2026-10-24", nome })).erro).toMatch(/nome/);
    expect(d.create).not.toHaveBeenCalled();
  });

  it("data que já está no calendário automático não precisa ser cadastrada (feriado nacional, Carnaval, Corpus Christi)", async () => {
    for (const data of ["2026-11-20", "2026-02-17", "2026-06-04"]) {
      const r = await adicionar({ data, nome: "Feriado repetido" });
      expect(r.erro, data).toMatch(/calendário automático/);
    }
    expect(d.create).not.toHaveBeenCalled();
  });

  it("data repetida é recusada", async () => {
    d.findUnique.mockResolvedValue({ id: "f1" });
    const r = await adicionar({ data: "2026-10-24", nome: "Aniversário de Goiânia" });
    expect(r.erro).toMatch(/já está no calendário/);
    expect(d.create).not.toHaveBeenCalled();
  });
});

describe("removerFeriado", () => {
  it("remove e audita", async () => {
    d.findUnique.mockResolvedValue({ data: new Date("2026-10-24T00:00:00Z"), nome: "Aniversário de Goiânia" });
    await removerFeriado("cmferiado000000000001");
    expect(d.delete).toHaveBeenCalledWith({ where: { id: "cmferiado000000000001" } });
    expect(d.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:adm1",
      acao: "admin.removerFeriado",
      alvo: "2026-10-24",
      detalhe: "Aniversário de Goiânia",
    });
    expect(d.revalidatePath).toHaveBeenCalledWith("/admin/feriados");
  });

  it("id inexistente ou com formato inválido não faz nada", async () => {
    await removerFeriado("x y");
    d.findUnique.mockResolvedValue(null);
    await removerFeriado("cmferiado000000000002");
    expect(d.delete).not.toHaveBeenCalled();
    expect(d.registrarAuditoria).not.toHaveBeenCalled();
  });
});
