import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AbasDePagina } from "./abas-de-pagina";

const ABAS = [
  { href: "/admin/ciclo", rotulo: "Atas (1 a 7)" },
  { href: "/admin/ciclo-adesao", rotulo: "Adesões (8 a 17)" },
];

const desenhar = (ativa: string) => renderToStaticMarkup(createElement(AbasDePagina, { abas: ABAS, ativa }));

describe("AbasDePagina", () => {
  it("as duas visões do ciclo: a ata (1 a 7) e a adesão (8 a 17), cada uma em sua página", () => {
    const html = desenhar("/admin/ciclo");
    expect(html).toContain('href="/admin/ciclo"');
    expect(html).toContain('href="/admin/ciclo-adesao"');
    expect(html).toContain("Atas (1 a 7)");
    expect(html).toContain("Adesões (8 a 17)");
  });

  it("só a aba da página atual é marcada (aria-current) e destacada", () => {
    const html = desenhar("/admin/ciclo-adesao");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Adesões \(8 a 17\)/);
    expect(html).toMatch(/class="botao-atas secundario"[^>]*>Atas \(1 a 7\)/);
  });

  it("a navegação tem nome para leitor de tela", () => {
    expect(desenhar("/admin/ciclo")).toContain('aria-label="Seções"');
  });
});
