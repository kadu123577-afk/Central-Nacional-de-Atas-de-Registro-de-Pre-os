import { describe, expect, it } from "vitest";
import { permissaoValida } from "@/lib/permissoes";
import { NAV_ADMIN, rotasDoMenu } from "./nav";

/** As telas que o menu tinha soltas antes de ser reunido: nenhuma pode ter ficado sem caminho. */
const TELAS_DO_MENU_ANTIGO = [
  "/admin",
  "/admin/pipeline",
  "/admin/indicadores",
  "/atas",
  "/admin/negociacoes",
  "/admin/adesoes",
  "/admin/contratos-detectados",
  "/admin/demandas",
  "/admin/radar-atas",
  "/admin/captacao",
  "/admin/recebiveis-vendedores",
  "/admin/faturamento",
  "/admin/comissao",
  "/admin/entidades",
  "/admin/contatos-revisao",
  "/admin/usuarios",
  "/admin/fornecedores",
  "/admin/parceiros",
  "/admin/feriados",
  "/admin/perfil",
  "/admin/ciclo",
];

describe("menu do admin reunido em abas", () => {
  it("tem 10 entradas no menu lateral, com o Pipeline e o Panorama logo abaixo do Painel", () => {
    expect(NAV_ADMIN.map((i) => i.rotulo)).toEqual([
      "Painel",
      "Pipeline",
      "Panorama",
      "Ciclos",
      "Atas",
      "Negociações e adesões",
      "Desempenho",
      "Financeiro",
      "Municípios",
      "Equipe e conta",
    ]);
    expect(NAV_ADMIN[0].href).toBe("/admin");
    expect(NAV_ADMIN[1].href).toBe("/admin/pipeline");
  });

  it("nenhuma tela do menu antigo ficou sem caminho (cada uma é entrada ou aba)", () => {
    const hrefs = rotasDoMenu().map((r) => r.href);
    for (const tela of TELAS_DO_MENU_ANTIGO) expect(hrefs, tela).toContain(tela);
    // E a nova tela do ciclo da adesão também.
    expect(hrefs).toContain("/admin/ciclo-adesao");
  });

  it("não repete endereço nem rótulo, nas entradas e nas abas", () => {
    const rotas = rotasDoMenu();
    expect(new Set(rotas.map((r) => r.href)).size).toBe(rotas.length);
    expect(new Set(rotas.map((r) => r.rotulo)).size).toBe(rotas.length);
    expect(new Set(NAV_ADMIN.map((i) => i.rotulo)).size).toBe(NAV_ADMIN.length);
  });

  it("cada entrada com abas leva à primeira aba", () => {
    for (const item of NAV_ADMIN) {
      if (item.abas) expect(item.href, item.rotulo).toBe(item.abas[0].href);
    }
  });

  it("as permissões declaradas (nas entradas e nas abas) existem", () => {
    for (const item of NAV_ADMIN) {
      for (const chave of item.permissoes ?? []) expect(permissaoValida(chave)).toBe(true);
      for (const aba of item.abas ?? []) {
        for (const chave of aba.permissoes ?? []) expect(permissaoValida(chave), `${item.rotulo} > ${aba.rotulo}`).toBe(true);
      }
    }
  });

  it("as telas novas do workflow estão cada uma na sua entrada", () => {
    const entradaDe = (href: string) => rotasDoMenu().find((r) => r.href === href)?.entrada;
    expect(entradaDe("/admin/ciclo")).toBe("Ciclos");
    expect(entradaDe("/admin/ciclo-adesao")).toBe("Ciclos");
    expect(entradaDe("/admin/negociacoes")).toBe("Negociações e adesões");
    expect(entradaDe("/admin/adesoes")).toBe("Negociações e adesões");
    expect(entradaDe("/admin/indicadores")).toBe("Desempenho");
    expect(entradaDe("/admin/recebiveis-vendedores")).toBe("Financeiro");
    expect(entradaDe("/admin/atas/nova")).toBe("Atas");
    expect(entradaDe("/admin/captacao")).toBe("Atas");
    expect(entradaDe("/admin/feriados")).toBe("Equipe e conta");
  });

  it("a tela de adesões serve a quem registra (estagiário), a quem declara (jurídico) e a quem instrui (Dr. Rui)", () => {
    const aba = NAV_ADMIN.flatMap((i) => i.abas ?? []).find((a) => a.href === "/admin/adesoes");
    expect(aba?.permissoes).toEqual(["adesao.registrar", "adesao.declarar", "adesao.instruir"]);
  });

  it("as telas de visão geral só aparecem para quem tem \"visao.geral\" (a Gestão)", () => {
    const geral = ["/admin/pipeline", "/admin/ciclo", "/admin/ciclo-adesao", "/atas", "/admin/indicadores"];
    const itens = NAV_ADMIN.flatMap((i) => [{ href: i.href, permissoes: i.permissoes }, ...(i.abas ?? [])]);
    for (const href of geral) {
      const alvo = itens.find((i) => i.href === href && i.permissoes);
      expect(alvo?.permissoes, href).toEqual(["visao.geral"]);
    }
  });

  it("o financeiro da SCP continua fora do menu", () => {
    expect(rotasDoMenu().some((r) => r.href.includes("financeiro-scp"))).toBe(false);
    expect(rotasDoMenu().some((r) => /scp/i.test(r.rotulo))).toBe(false);
  });
});
