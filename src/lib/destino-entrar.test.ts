import { describe, expect, it } from "vitest";
import { caminhoEntrar, destinoOrgaoDaBusca } from "./destino-login";

describe("destinoOrgaoDaBusca (destino do órgão em /entrar)", () => {
  it("sem nada, vai para a área do órgão", () => {
    expect(destinoOrgaoDaBusca({})).toBe("/orgao");
  });

  it("ata válida leva à página da ata", () => {
    expect(destinoOrgaoDaBusca({ ata: "abcdefghij12345" })).toBe("/catalogo/abcdefghij12345");
  });

  it("a ata tem prioridade sobre o destino", () => {
    expect(destinoOrgaoDaBusca({ ata: "abcdefghij12345", destino: "/orgao/pedidos" })).toBe(
      "/catalogo/abcdefghij12345",
    );
  });

  it("caminho da área do órgão é aceito", () => {
    expect(destinoOrgaoDaBusca({ destino: "/orgao/pedidos" })).toBe("/orgao/pedidos");
  });

  it.each([
    { ata: "curta" },
    { ata: "abcdefghij12345/../x" },
    { ata: ["abcdefghij12345"] },
    { destino: "https://evil.example" },
    { destino: "//evil.example" },
    { destino: "javascript:alert(1)" },
    { destino: "/admin" },
    { destino: "/vendedor" },
    { destino: "/fornecedor" },
    { destino: ["/orgao"] },
  ])("valor inválido %j vira /orgao", (busca) => {
    expect(destinoOrgaoDaBusca(busca)).toBe("/orgao");
  });
});

describe("caminhoEntrar (funil das páginas de login antigas)", () => {
  it("sem destino: /entrar puro", () => {
    expect(caminhoEntrar({})).toBe("/entrar");
  });

  it("preserva só destino válido", () => {
    expect(caminhoEntrar({ ata: "abcdefghij12345" })).toBe("/entrar?ata=abcdefghij12345");
    expect(caminhoEntrar({ destino: "/orgao" })).toBe("/entrar?destino=%2Forgao");
  });

  it("nunca monta um endereço fora do site", () => {
    for (const destino of ["https://evil.example", "//evil.example", "/\evil.example", "http:/evil.example"]) {
      expect(caminhoEntrar({ destino })).toBe("/entrar");
    }
  });
});
