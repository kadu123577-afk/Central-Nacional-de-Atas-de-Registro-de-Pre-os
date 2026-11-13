import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const d = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => d.pathname }));
vi.mock("./logo", () => ({ Logo: () => null }));

import { NAV_ADMIN } from "@/app/admin/nav";
import { PERFIS, type Permissao } from "@/lib/permissoes";
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

/** As permissões de cada perfil pronto do sistema: o teste não inventa perfil, usa os de verdade. */
const de = (chave: string): readonly Permissao[] => PERFIS.find((p) => p.chave === chave)!.permissoes;
const GESTAO = de("gestao");
const ESTAGIARIO = de("estagiario");
const CAPTADOR = de("captacao");
const APROVADOR = de("aprovador");
const COBRANCA = de("cobranca");

describe("casca do admin: cada função só vê o que é dela", () => {
  it("a Gestão vê as 9 entradas, com o Pipeline logo abaixo do Painel", () => {
    expect(menu(desenhar("/admin", GESTAO))).toEqual([
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

  it("o estagiário vê só o Painel, os Itens das atas, as Adesões e o Perfil: nada de ciclos, pipeline, vendas ou financeiro", () => {
    expect(menu(desenhar("/admin", ESTAGIARIO))).toEqual(["Painel", "Itens das atas", "Adesões", "Perfil"]);
  });

  it("o captador vê o Painel, as Atas (captação, radar, cadastrar, fornecedores) e o Perfil", () => {
    const html = desenhar("/admin", CAPTADOR);
    expect(menu(html)).toEqual(["Painel", "Atas", "Perfil"]);
    expect(abas(desenhar("/admin/radar-atas", CAPTADOR))).toEqual([
      "Captação",
      "Radar de atas",
      "Cadastrar ata",
      "Itens das atas",
      "Fornecedores",
    ]);
  });

  it("o Dr. Rui (aprova e instrui) vê o Painel, as Adesões e o Perfil: a ata chega pela tarefa, não pelo menu", () => {
    expect(menu(desenhar("/admin", APROVADOR))).toEqual(["Painel", "Adesões", "Perfil"]);
  });

  it("o Jorge (cobrança) vê o Painel, o Financeiro (contas e recebíveis) e o Perfil", () => {
    expect(menu(desenhar("/admin", COBRANCA))).toEqual(["Painel", "Financeiro", "Perfil"]);
    expect(abas(desenhar("/admin/faturamento", COBRANCA))).toEqual(["Contas a receber", "Recebíveis — vendedores"]);
  });

  it("só a Gestão vê Pipeline, Ciclos, Catálogo e Desempenho (a visão geral)", () => {
    for (const perfil of PERFIS) {
      const itens = menu(desenhar("/admin", perfil.permissoes));
      const ehGestao = perfil.chave === "gestao";
      for (const rotulo of ["Pipeline", "Ciclos", "Desempenho"]) {
        expect(itens.includes(rotulo), `${perfil.chave}: ${rotulo}`).toBe(ehGestao);
      }
    }
    expect(abas(desenhar("/admin/radar-atas", CAPTADOR))).not.toContain("Catálogo");
  });

  it("a entrada leva à primeira aba que a pessoa pode ver (não a que ela não pode)", () => {
    // Com uma aba só, o menu mostra o nome da aba e leva direto a ela.
    expect(hrefDoMenu(desenhar("/admin", ESTAGIARIO), "Adesões")).toBe("/admin/adesoes");
    // A Gestão vê tudo: a entrada leva à primeira.
    expect(hrefDoMenu(desenhar("/admin", GESTAO), "Negociações e adesões")).toBe("/admin/negociacoes");
    // O captador começa pelo quadro de captação.
    expect(hrefDoMenu(desenhar("/admin", CAPTADOR), "Atas")).toBe("/admin/captacao");
  });

  it("quem não vê nenhuma aba de uma entrada não vê a entrada", () => {
    const itens = menu(desenhar("/admin", ["atas.aprovar"]));
    expect(itens).toEqual(["Painel", "Perfil"]);
  });

  it("com uma aba só visível não aparece barra de abas", () => {
    expect(abas(desenhar("/admin/adesoes", ESTAGIARIO))).toEqual([]);
  });

  it("na página de uma entrada com várias telas aparecem as abas, com a atual marcada", () => {
    const html = desenhar("/admin/adesoes", GESTAO);
    expect(abas(html)).toEqual(["Negociações", "Adesões", "Contratos detectados"]);
    expect(html).toMatch(/aria-current="page"[^>]*>Adesões</);
  });

  it("páginas filhas ficam na entrada certa (município, ata, adesão de um município)", () => {
    expect(abas(desenhar("/admin/entidades/abc123", GESTAO))).toEqual([
      "Municípios/Entidades",
      "Revisão de contatos",
      "Demandas do site",
      "Parceiros",
    ]);
    expect(abas(desenhar("/admin/atas/xyz/contrato", GESTAO))).toEqual([
      "Catálogo",
      "Captação",
      "Radar de atas",
      "Cadastrar ata",
      "Itens das atas",
      "Fornecedores",
    ]);
  });

  it("'Cadastrar ata' marca a própria aba, não a do Catálogo (que casa por prefixo)", () => {
    expect(desenhar("/admin/atas/nova", GESTAO)).toMatch(/aria-current="page"[^>]*>Cadastrar ata</);
  });

  describe("telas de uma ata (contrato, análise, itens...)", () => {
    /** O texto da aba marcada na barra do topo, ou null se nenhuma está marcada. */
    function abaMarcada(html: string): string | null {
      const nav = html.match(/<nav aria-label="Seções"[\s\S]*?<\/nav>/)?.[0] ?? "";
      return nav.match(/aria-current="page"[^>]*>([^<]*)</)?.[1] ?? null;
    }
    const entradaMarcada = (html: string) => {
      const aside = html.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? "";
      return aside.match(/aria-current="page"[^>]*>([^<]*)</)?.[1] ?? null;
    };

    it("contrato e análise ficam na entrada Atas sem marcar nenhuma aba (antes marcavam o Catálogo)", () => {
      for (const caminho of ["/admin/atas/xyz/contrato", "/admin/atas/xyz/analise"]) {
        const html = desenhar(caminho, GESTAO);
        expect(entradaMarcada(html), caminho).toBe("Atas");
        expect(abaMarcada(html), caminho).toBeNull();
        expect(abas(html), caminho).toContain("Catálogo");
      }
    });

    it("itens da ata marca a aba “Itens das atas”; o estagiário (uma aba só) continua na entrada certa", () => {
      expect(abaMarcada(desenhar("/admin/atas/xyz/itens", GESTAO))).toBe("Itens das atas");
      expect(abaMarcada(desenhar("/admin/atas-itens", CAPTADOR))).toBe("Itens das atas");
      expect(entradaMarcada(desenhar("/admin/atas/xyz/itens", ESTAGIARIO))).toBe("Itens das atas");
    });

    it("completar os dados da empresa marca a Captação; o ciclo e os municípios da ata marcam o Catálogo", () => {
      expect(abaMarcada(desenhar("/admin/atas/xyz/completar", CAPTADOR))).toBe("Captação");
      expect(abaMarcada(desenhar("/admin/atas/xyz/ciclo", GESTAO))).toBe("Catálogo");
      expect(abaMarcada(desenhar("/admin/atas/xyz/municipios", GESTAO))).toBe("Catálogo");
    });

    it("o padrão com asterisco casa um trecho só: a tela de cadastro continua marcando a própria aba", () => {
      expect(abaMarcada(desenhar("/admin/atas/nova", GESTAO))).toBe("Cadastrar ata");
      // Sem o trecho do meio, o padrão /admin/atas/*/itens não casa.
      expect(abaMarcada(desenhar("/admin/atas/itens", GESTAO))).toBeNull();
    });
  });

  it("o ciclo da ata e o da adesão são abas da mesma entrada e não se confundem pelo prefixo", () => {
    expect(abas(desenhar("/admin/ciclo", GESTAO))).toEqual(["Atas (1 a 7)", "Adesões (8 a 17)"]);
    expect(desenhar("/admin/ciclo", GESTAO)).toMatch(/aria-current="page"[^>]*>Atas \(1 a 7\)</);
    expect(desenhar("/admin/ciclo-adesao", GESTAO)).toMatch(/aria-current="page"[^>]*>Adesões \(8 a 17\)</);
  });

  it("entradas simples (Painel, Pipeline) não têm barra de abas", () => {
    expect(abas(desenhar("/admin", GESTAO))).toEqual([]);
    expect(abas(desenhar("/admin/pipeline", GESTAO))).toEqual([]);
  });

  it("sem permissões no contexto (área do vendedor) o menu aparece inteiro", () => {
    expect(menu(desenhar("/admin", null))).toHaveLength(NAV_ADMIN.length);
  });

  it("o conteúdo da página continua aparecendo", () => {
    expect(desenhar("/admin/adesoes", GESTAO)).toContain("conteúdo");
  });
});
