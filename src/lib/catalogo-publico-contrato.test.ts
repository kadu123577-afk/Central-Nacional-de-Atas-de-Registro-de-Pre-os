import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sem contrato de intermediação não há como vender a ata nem receber a comissão (regra de
 * 14/11/2026): o catálogo público e o pedido de adesão só enxergam ata aprovada, vigente e COM
 * contrato. O Prisma é um dublê: aqui só interessa a condição que a consulta carrega.
 */
const d = vi.hoisted(() => ({ ataCount: vi.fn(), ataFindFirst: vi.fn(), ataFindUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { ata: { count: d.ataCount, findFirst: d.ataFindFirst, findUnique: d.ataFindUnique } },
}));
vi.mock("@/lib/visibilidade", () => ({ nivelDeVisao: vi.fn(async () => "publico") }));

import { ataDisponivelParaPedido } from "./catalogo-publico";

beforeEach(() => {
  vi.clearAllMocks();
  d.ataCount.mockResolvedValue(1);
});

describe("ataDisponivelParaPedido exige o contrato de intermediação", () => {
  it("a consulta carrega aprovada + vigente + com contrato", async () => {
    await expect(ataDisponivelParaPedido("ata1")).resolves.toBe(true);
    const onde = d.ataCount.mock.calls[0][0].where as { AND: Record<string, unknown>[] };
    expect(onde.AND[0]).toEqual({ id: "ata1" });
    expect(onde.AND[1]).toMatchObject({ status: "APROVADA", contrato: { isNot: null } });
    expect(onde.AND[1].dataVigenciaFim).toEqual({ gte: expect.any(Date) });
  });

  it("sem ata que atenda a condição (por exemplo, sem contrato), não está disponível", async () => {
    d.ataCount.mockResolvedValue(0);
    await expect(ataDisponivelParaPedido("ata1")).resolves.toBe(false);
  });
});
