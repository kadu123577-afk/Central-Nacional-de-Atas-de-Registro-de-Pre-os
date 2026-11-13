import { beforeEach, describe, expect, it, vi } from "vitest";

const d = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: d.queryRaw } }));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/saude", () => {
  it("banco respondendo: 200 e só o estado, sem cache", async () => {
    d.queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "ok" });
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("banco fora do ar: 503, sem vazar o erro, o endereço nem a versão", async () => {
    d.queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432 senha=segredo"));
    const r = await GET();
    expect(r.status).toBe(503);
    const corpo = JSON.stringify(await r.json());
    expect(corpo).toBe('{"status":"indisponivel"}');
    expect(corpo).not.toContain("ECONNREFUSED");
    expect(corpo).not.toContain("segredo");
  });
});
