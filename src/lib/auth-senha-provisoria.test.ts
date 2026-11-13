import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sessão de quem está com a senha provisória (2026-11-14): a conta entra, mas só a tela
 * /trocar-senha reconhece a sessão. O cookie é o de verdade (assinado pelo auth.ts); o
 * armazenamento de cookies e o Prisma são trocados por dublês.
 */
const d = vi.hoisted(() => {
  process.env.SESSION_SECRET = "segredo-de-teste-com-mais-de-32-caracteres-xx";
  const cookies = new Map<string, string>();
  return {
    cookies,
    adminFindUnique: vi.fn(),
    vendedorFindUnique: vi.fn(),
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (d.cookies.has(nome) ? { value: d.cookies.get(nome) } : undefined),
    set: (nome: string, valor: string) => {
      if (valor === "") d.cookies.delete(nome);
      else d.cookies.set(nome, valor);
    },
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: { findUnique: d.adminFindUnique },
    vendedor: { findUnique: d.vendedorFindUnique },
  },
}));

import {
  adminIdLogado,
  adminIdLogadoParaTrocarSenha,
  criarSessaoAdmin,
  criarSessaoVendedor,
  vendedorIdLogado,
  vendedorIdLogadoParaTrocarSenha,
} from "./auth";

function contaAdmin(extra: Partial<{ sessaoVersao: number; ativo: boolean; senhaProvisoria: boolean }> = {}) {
  d.adminFindUnique.mockResolvedValue({ sessaoVersao: 3, ativo: true, senhaProvisoria: false, ...extra });
}
function contaVendedor(extra: Partial<{ sessaoVersao: number; ativo: boolean; senhaProvisoria: boolean }> = {}) {
  d.vendedorFindUnique.mockResolvedValue({ sessaoVersao: 5, ativo: true, senhaProvisoria: false, ...extra });
}

beforeEach(() => {
  d.cookies.clear();
  vi.clearAllMocks();
});

describe("admin", () => {
  it("conta com senha definitiva: as duas leituras reconhecem a sessão", async () => {
    contaAdmin();
    await criarSessaoAdmin("adm1");
    await expect(adminIdLogado()).resolves.toBe("adm1");
    await expect(adminIdLogadoParaTrocarSenha()).resolves.toBe("adm1");
  });

  it("conta com senha provisória: só a tela de troca reconhece a sessão", async () => {
    contaAdmin({ senhaProvisoria: true });
    await criarSessaoAdmin("adm1");
    await expect(adminIdLogado()).resolves.toBeNull();
    await expect(adminIdLogadoParaTrocarSenha()).resolves.toBe("adm1");
  });

  it("depois da troca (senhaProvisoria falso, versão nova) a sessão passa a valer em todo lugar", async () => {
    contaAdmin({ senhaProvisoria: true });
    await criarSessaoAdmin("adm1");
    contaAdmin({ senhaProvisoria: false, sessaoVersao: 4 });
    // A sessão antiga tinha a versão 3: a troca a derruba, e a tela abre uma nova.
    await expect(adminIdLogado()).resolves.toBeNull();
    await criarSessaoAdmin("adm1");
    await expect(adminIdLogado()).resolves.toBe("adm1");
  });

  it("conta desativada não tem sessão em nenhuma das duas leituras", async () => {
    contaAdmin({ ativo: false });
    await criarSessaoAdmin("adm1");
    await expect(adminIdLogado()).resolves.toBeNull();
    await expect(adminIdLogadoParaTrocarSenha()).resolves.toBeNull();
  });
});

describe("vendedor", () => {
  it("conta com senha provisória: só a tela de troca reconhece a sessão", async () => {
    contaVendedor({ senhaProvisoria: true });
    await criarSessaoVendedor("ven1");
    await expect(vendedorIdLogado()).resolves.toBeNull();
    await expect(vendedorIdLogadoParaTrocarSenha()).resolves.toBe("ven1");
  });

  it("conta com senha definitiva entra normalmente", async () => {
    contaVendedor();
    await criarSessaoVendedor("ven1");
    await expect(vendedorIdLogado()).resolves.toBe("ven1");
  });

  it("cookie de admin não vale como sessão de vendedor", async () => {
    contaAdmin({ senhaProvisoria: true });
    await criarSessaoAdmin("adm1");
    await expect(vendedorIdLogadoParaTrocarSenha()).resolves.toBeNull();
  });
});
