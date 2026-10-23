import { beforeEach, describe, expect, it, vi } from "vitest";

/** Leituras do credenciamento, testadas com o Prisma trocado por um dublê. */
const dobles = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { credenciamentoConsultor: { findUnique: dobles.findUnique } } }));

import { mensagemBloqueio } from "./credenciamento";
import { bloqueioDeCredenciamento, lerCredenciamentoDoVendedor, statusCredenciamentoDoVendedor } from "./credenciamento-db";

beforeEach(() => {
  vi.clearAllMocks();
  dobles.findUnique.mockResolvedValue(null);
});

describe("statusCredenciamentoDoVendedor", () => {
  it("lê só o status do vendedor pedido", async () => {
    dobles.findUnique.mockResolvedValue({ status: "credenciado" });

    expect(await statusCredenciamentoDoVendedor("vend1")).toBe("credenciado");
    expect(dobles.findUnique).toHaveBeenCalledWith({ where: { vendedorId: "vend1" }, select: { status: true } });
  });

  it("sem registro ou com valor desconhecido conta como pendente", async () => {
    expect(await statusCredenciamentoDoVendedor("vend1")).toBe("pendente");
    dobles.findUnique.mockResolvedValue({ status: "qualquer" });
    expect(await statusCredenciamentoDoVendedor("vend1")).toBe("pendente");
  });
});

describe("lerCredenciamentoDoVendedor", () => {
  it("sem registro devolve nulo", async () => {
    expect(await lerCredenciamentoDoVendedor("vend1")).toBeNull();
  });

  it("devolve o registro com o status normalizado", async () => {
    const aceitaEm = new Date("2026-10-20T15:00:00Z");
    dobles.findUnique.mockResolvedValue({
      status: "qualquer",
      integridadeAceitaEm: aceitaEm,
      integridadeVersao: 1,
      credenciadoEm: null,
      suspensoEm: null,
      motivo: null,
    });

    expect(await lerCredenciamentoDoVendedor("vend1")).toEqual({
      status: "pendente",
      integridadeAceitaEm: aceitaEm,
      integridadeVersao: 1,
      credenciadoEm: null,
      suspensoEm: null,
      motivo: null,
    });
  });
});

describe("bloqueioDeCredenciamento", () => {
  it("credenciado não é bloqueado", async () => {
    dobles.findUnique.mockResolvedValue({ status: "credenciado" });

    expect(await bloqueioDeCredenciamento("vend1")).toBeNull();
  });

  it.each(["pendente", "aceito", "suspenso"])("%s é bloqueado com a mensagem do status e o caminho da tela", async (status) => {
    dobles.findUnique.mockResolvedValue({ status });
    const mensagem = await bloqueioDeCredenciamento("vend1");

    expect(mensagem).toContain(mensagemBloqueio(status));
    expect(mensagem).toContain("/vendedor/credenciamento");
  });

  it("sem registro é bloqueado como pendente", async () => {
    const mensagem = await bloqueioDeCredenciamento("vend1");

    expect(mensagem).toContain(mensagemBloqueio("pendente"));
  });

  it("falha do banco sobe: sem conseguir conferir, não libera", async () => {
    dobles.findUnique.mockRejectedValue(new Error("banco indisponível"));

    await expect(bloqueioDeCredenciamento("vend1")).rejects.toThrow("banco indisponível");
  });
});
