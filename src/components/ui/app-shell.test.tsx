import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const d = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => d.pathname }));
vi.mock("./logo", () => ({ Logo: () => null }));

import { NAV_ADMIN } from "@/app/admin/nav";
import { AppShell } from "./app-shell";
import { PermissoesProvider } from "./permissoes-contexto";

function desenhar(pathname: string, permissoes: readonly string[] | null) {
  d.pathname = pathname;
  return renderToStaticMarkup(
    <PermissoesProvider permissoes={permissoes}>
      <AppShell area="Administrativo" itens={NAV_ADMIN}>
        <p>conteúdo</p>
      </AppShell>
    </PermissoesProvider>,
  );
}

/** Textos dos links do menu lateral (dentro do <aside>). */
function menu(html: string): string[] {
  const aside = html.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? "";
  return [...aside.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
}

function hrefDoMenu(html: string, rotulo: string): string | undefined {
  const aside = html.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? "";
  return [...aside.matchAll(/<a [^>]*?href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].find((m) => m[2] === rotulo)?.[1];
}

/** Abas no topo da página (nav "Seções" dentro do <main>). */
function abas(html: string): string[] {
  const nav = html.match(/<nav aria-label="Seções"[\s\S]*?<\/nav>/)?.[0] ?? "";
  return [...nav.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
}

const GESTOR = [
  "atas.captar",
  "atas.contrato",
  "atas.conformidade",
  "atas.aprovar",
  "atas.publicar",
  "municipios.liberar",
  "adesao.instruir",
  "adesao.declarar",
  "adesao.registrar",
  "adesao.acompanhar",
  "comissao.cobrar",
  "base.editar",
  "usuarios.gerir",
];

describe("casca do admin: menu reunido em abas", () => {
  it("o gestor vê as 9 entradas, com o Pipeline logo abaixo do Painel", () => {
    expect(menu(desenhar("/admin", GESTOR))).toEqual([
      "Painel",
      "Pipeline",
      "Ciclos",
      "Atas",
      "Negociações e adesões",
      "Desempenho",
      "Financeiro",
      "Municípios",
      "Equipe e conta",
    ]);
  });

  it("o estagiário (captação) só vê o que a permissão dele abre: entradas sem aba que ele possa ver somem", () => {
    const html = desenhar("/admin", ["atas.captar", "adesao.registrar"]);
    const itens = menu(html);
    expect(itens).toEqual(["Painel", "Pipeline", "Ciclos", "Atas", "Negociações e adesões", "Desempenho", "Equipe e conta"]);
    expect(itens).not.toContain("Financeiro");
    expect(itens).not.toContain("Municípios");
  });

  it("a entrada leva à primeira aba que a pessoa pode ver (não a que ela não pode)", () => {
    // O estagiário não vê "Negociações" (municipios.liberar): a entrada leva a Adesões.
    const html = desenhar("/admin", ["atas.captar", "adesao.registrar"]);
    expect(hrefDoMenu(html, "Negociações e adesões")).toBe("/admin/adesoes");
    // O gestor vê tudo: leva à primeira.
    expect(hrefDoMenu(desenhar("/admin", GESTOR), "Negociações e adesões")).toBe("/admin/negociacoes");
  });

  it("quem não vê nenhuma aba de uma entrada não vê a entrada", () => {
    const itens = menu(desenhar("/admin", ["atas.aprovar"]));
    expect(itens).not.toContain("Negociações e adesões");
    expect(itens).not.toContain("Financeiro");
    expect(itens).not.toContain("Municípios");
  });

  it("na página de uma entrada com várias telas aparecem as abas, com a atual marcada", () => {
    const html = desenhar("/admin/adesoes", GESTOR);
    expect(abas(html)).toEqual(["Negociações", "Adesões", "Contratos detectados"]);
    expect(html).toMatch(/aria-current="page"[^>]*>Adesões</);
  });

  it("as abas só mostram o que a pessoa pode ver", () => {
    expect(abas(desenhar("/admin/adesoes", ["adesao.registrar"]))).toEqual([]); // só uma aba visível: sem barra
    expect(abas(desenhar("/admin/adesoes", ["adesao.registrar", "adesao.acompanhar"]))).toEqual(["Adesões", "Contratos detectados"]);
  });

  it("páginas filhas ficam na entrada certa (município, ata, adesão de um município)", () => {
    expect(abas(desenhar("/admin/entidades/abc123", GESTOR))).toEqual([
      "Municípios/Entidades",
      "Revisão de contatos",
      "Demandas do site",
      "Parceiros",
    ]);
    expect(abas(desenhar("/admin/atas/xyz/contrato", GESTOR))).toEqual(["Catálogo", "Radar de atas", "Fornecedores", "Prospecção de fornecedores"]);
    expect(abas(desenhar("/admin/adesoes/op1", GESTOR))).toContain("Adesões");
  });

  it("o ciclo da ata e o da adesão são abas da mesma entrada e não se confundem pelo prefixo", () => {
    expect(abas(desenhar("/admin/ciclo", GESTOR))).toEqual(["Atas (1 a 7)", "Adesões (8 a 17)"]);
    expect(desenhar("/admin/ciclo", GESTOR)).toMatch(/aria-current="page"[^>]*>Atas \(1 a 7\)</);
    expect(desenhar("/admin/ciclo-adesao", GESTOR)).toMatch(/aria-current="page"[^>]*>Adesões \(8 a 17\)</);
  });

  it("entradas simples (Painel, Pipeline) não têm barra de abas", () => {
    expect(abas(desenhar("/admin", GESTOR))).toEqual([]);
    expect(abas(desenhar("/admin/pipeline", GESTOR))).toEqual([]);
  });

  it("sem permissões no contexto (área do vendedor) o menu aparece inteiro", () => {
    expect(menu(desenhar("/admin", null))).toHaveLength(NAV_ADMIN.length);
  });

  it("o conteúdo da página continua aparecendo", () => {
    expect(desenhar("/admin/adesoes", GESTOR)).toContain("conteúdo");
  });
});
