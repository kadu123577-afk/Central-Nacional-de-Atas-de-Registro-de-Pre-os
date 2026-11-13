import { describe, expect, it } from "vitest";
import { permissaoValida } from "@/lib/permissoes";
import { NAV_ADMIN } from "./nav";

describe("menu do admin, pelas etapas do workflow", () => {
  it("não repete endereço nem rótulo", () => {
    const hrefs = NAV_ADMIN.map((i) => i.href);
    const rotulos = NAV_ADMIN.map((i) => i.rotulo);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });

  it("os grupos vêm na ordem do trabalho e cada um é um bloco contínuo", () => {
    const grupos = NAV_ADMIN.map((i) => i.grupo);
    const ordemDeAparicao = [...new Set(grupos)];
    expect(ordemDeAparicao).toEqual([
      "Início",
      "Captação e aprovação",
      "Venda",
      "Adesão e entrega",
      "Financeiro",
      "Cadastros",
      "Conta",
    ]);
    // Contínuo: se um grupo reaparecesse depois de outro, o cabeçalho dele se repetiria.
    const trocas = grupos.filter((g, i) => g !== grupos[i - 1]);
    expect(trocas).toEqual(ordemDeAparicao);
  });

  it("as permissões declaradas existem", () => {
    for (const item of NAV_ADMIN) {
      for (const chave of item.permissoes ?? []) expect(permissaoValida(chave)).toBe(true);
    }
  });

  it("as telas novas do workflow estão no menu, cada uma na sua etapa", () => {
    const grupoDe = (href: string) => NAV_ADMIN.find((i) => i.href === href)?.grupo;
    expect(grupoDe("/admin/ciclo")).toBe("Captação e aprovação");
    expect(grupoDe("/admin/ciclo-adesao")).toBe("Venda");
    expect(grupoDe("/admin/negociacoes")).toBe("Venda");
    expect(grupoDe("/admin/adesoes")).toBe("Adesão e entrega");
    expect(grupoDe("/admin/feriados")).toBe("Cadastros");
  });

  it("a tela de adesões serve a quem registra (estagiário), a quem declara (jurídico) e a quem instrui (Dr. Rui)", () => {
    expect(NAV_ADMIN.find((i) => i.href === "/admin/adesoes")?.permissoes).toEqual([
      "adesao.registrar",
      "adesao.declarar",
      "adesao.instruir",
    ]);
  });

  it("o financeiro da SCP continua fora do menu", () => {
    expect(NAV_ADMIN.some((i) => i.href.includes("financeiro-scp"))).toBe(false);
  });
});
