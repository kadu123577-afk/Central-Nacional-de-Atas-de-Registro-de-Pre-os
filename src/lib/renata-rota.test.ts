import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const d = vi.hoisted(() => ({ registrarAuditoria: vi.fn() }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: d.registrarAuditoria }));

import { responderRenata } from "./renata-rota";

const TOKEN = "k".repeat(40);
const pedido = (authorization?: string) => new Request("http://x/api/renata/atas", { headers: authorization ? { authorization } : {} });

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("responderRenata", () => {
  it("desligada: 404, não monta nada e não grava auditoria", async () => {
    const montar = vi.fn();
    const r = await responderRenata(pedido(`Bearer ${TOKEN}`), "atas", montar);
    expect(r.status).toBe(404);
    expect(montar).not.toHaveBeenCalled();
    expect(d.registrarAuditoria).not.toHaveBeenCalled();
  });

  describe("ligada", () => {
    beforeEach(() => {
      vi.stubEnv("RENATA_API_ATIVA", "sim");
      vi.stubEnv("RENATA_API_TOKEN", TOKEN);
    });

    it("token errado: 401, não monta nada e audita a recusa (sem o token)", async () => {
      const montar = vi.fn();
      const r = await responderRenata(pedido("Bearer errado"), "atas", montar);
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ erro: "Não autorizado." });
      expect(montar).not.toHaveBeenCalled();
      expect(d.registrarAuditoria).toHaveBeenCalledWith({ ator: "renata", acao: "renata.recusada", alvo: "atas" });
      expect(JSON.stringify(d.registrarAuditoria.mock.calls)).not.toContain("errado");
    });

    it("sem cabeçalho: 401", async () => {
      expect((await responderRenata(pedido(), "atas", vi.fn())).status).toBe(401);
    });

    it("token certo: devolve os dados com a hora de geração, sem cache, e audita a consulta", async () => {
      const r = await responderRenata(pedido(`Bearer ${TOKEN}`), "vendas", async () => ({ consultores: [] }));
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      const corpo = await r.json();
      expect(corpo.consultores).toEqual([]);
      expect(typeof corpo.geradoEm).toBe("string");
      expect(d.registrarAuditoria).toHaveBeenCalledWith({ ator: "renata", acao: "renata.consulta", alvo: "vendas" });
    });

    it("se a consulta falha, não audita como sucesso", async () => {
      await expect(
        responderRenata(pedido(`Bearer ${TOKEN}`), "atas", async () => {
          throw new Error("banco indisponível");
        }),
      ).rejects.toThrow("banco indisponível");
      expect(d.registrarAuditoria).not.toHaveBeenCalled();
    });
  });
});
