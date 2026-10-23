import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As quatro páginas de login antigas viraram um funil para /entrar (redirect
 * temporário). Levam junto só um destino válido; endereço externo, protocolo e
 * lixo são descartados.
 */
const d = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: d.redirect }));

import LoginAdmin from "@/app/admin/login/page";
import LoginFornecedor from "@/app/fornecedor/login/page";
import LoginOrgao from "@/app/orgao/login/page";
import LoginVendedor from "@/app/vendedor/login/page";

const PAGINAS = [
  ["/admin/login", LoginAdmin],
  ["/vendedor/login", LoginVendedor],
  ["/fornecedor/login", LoginFornecedor],
  ["/orgao/login", LoginOrgao],
] as const;

type Busca = Parameters<typeof LoginAdmin>[0]["searchParams"] extends Promise<infer B> ? B : never;

async function destinoDe(pagina: (typeof PAGINAS)[number][1], busca: Busca): Promise<string> {
  try {
    await pagina({ searchParams: Promise.resolve(busca) });
  } catch (erro) {
    const m = /^NEXT_REDIRECT:(.*)$/.exec(erro instanceof Error ? erro.message : "");
    if (m) return m[1];
    throw erro;
  }
  throw new Error("a página não redirecionou");
}

beforeEach(() => {
  vi.clearAllMocks();
  d.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
});

describe.each(PAGINAS)("%s", (_rota, pagina) => {
  it("redireciona para /entrar (redirect temporário, com um argumento só)", async () => {
    expect(await destinoDe(pagina, {})).toBe("/entrar");
    expect(d.redirect).toHaveBeenCalledTimes(1);
    expect(d.redirect.mock.calls[0]).toHaveLength(1);
  });

  it("leva junto a ata do pedido de adesão, se válida", async () => {
    expect(await destinoDe(pagina, { ata: "abcdefghij12345" })).toBe("/entrar?ata=abcdefghij12345");
  });

  it("leva junto um caminho válido da área do órgão", async () => {
    expect(await destinoDe(pagina, { destino: "/orgao/pedidos" })).toBe("/entrar?destino=%2Forgao%2Fpedidos");
  });

  it.each([
    { destino: "https://evil.example/x" },
    { destino: "//evil.example" },
    { destino: "javascript:alert(1)" },
    { destino: "/admin" },
    { destino: "/orgao/../admin" },
    { ata: "curta" },
    { ata: "../../admin" },
    { ata: "abc def ghi jkl" },
    { ata: ["abcdefghij12345", "abcdefghij12346"] as unknown as string },
    { destino: ["/orgao"] as unknown as string },
  ])("descarta destino inválido %j", async (busca) => {
    expect(await destinoDe(pagina, busca)).toBe("/entrar");
  });
});
