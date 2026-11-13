import { describe, expect, it } from "vitest";
import {
  PERFIS,
  PERMISSAO_POR_ACAO,
  PERMISSOES,
  TODAS_AS_PERMISSOES,
  normalizarPermissoes,
  perfilPorChave,
  permissaoValida,
  temAlguma,
  temPermissao,
} from "./permissoes";

describe("tabela de permissões", () => {
  it("chaves únicas, no formato área.ação", () => {
    const chaves = PERMISSOES.map((p) => p.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const chave of chaves) expect(chave).toMatch(/^[a-z]+\.[a-z]+$/);
  });

  it("cada atividade do workflow (1 a 17) aparece em no máximo uma permissão", () => {
    const atividades = PERMISSOES.flatMap((p) => [...p.atividades]);
    expect(new Set(atividades).size).toBe(atividades.length);
    for (const n of atividades) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(17);
    }
  });

  it("as atividades de vendas (8 e 10) não têm permissão de admin: são do consultor", () => {
    const atividades = PERMISSOES.flatMap((p) => [...p.atividades]);
    expect(atividades).not.toContain(8);
    expect(atividades).not.toContain(10);
  });

  it("toda permissão tem rótulo e descrição em português", () => {
    for (const p of PERMISSOES) {
      expect(p.rotulo.length).toBeGreaterThan(3);
      expect(p.descricao.endsWith(".")).toBe(true);
    }
  });
});

describe("regras puras", () => {
  it("permissaoValida só aceita chave conhecida", () => {
    expect(permissaoValida("atas.conformidade")).toBe(true);
    expect(permissaoValida("atas.apagar")).toBe(false);
    // A aprovação da ata foi retirada (14/11/2026): a chave antiga não vale mais.
    expect(permissaoValida("atas.aprovar")).toBe(false);
    expect(permissaoValida(42)).toBe(false);
    expect(permissaoValida(null)).toBe(false);
  });

  it("normalizarPermissoes tira o que é desconhecido e repetido e segue a ordem da tabela", () => {
    expect(normalizarPermissoes(["base.editar", "atas.contrato", "lixo", "atas.contrato", "atas.aprovar", 7])).toEqual([
      "atas.contrato",
      "base.editar",
    ]);
    expect(normalizarPermissoes("atas.contrato")).toEqual([]);
    expect(normalizarPermissoes(undefined)).toEqual([]);
  });

  it("temPermissao e temAlguma tratam lista ausente como sem permissão", () => {
    expect(temPermissao(["atas.conformidade"], "atas.conformidade")).toBe(true);
    expect(temPermissao(["atas.conformidade"], "atas.contrato")).toBe(false);
    expect(temPermissao(null, "atas.conformidade")).toBe(false);
    expect(temPermissao(undefined, "atas.conformidade")).toBe(false);
    expect(temAlguma(["atas.contrato"], ["atas.conformidade", "atas.contrato"])).toBe(true);
    expect(temAlguma([], ["atas.conformidade"])).toBe(false);
  });
});

describe("perfis prontos", () => {
  it("só usam permissões que existem", () => {
    for (const perfil of PERFIS) {
      for (const chave of perfil.permissoes) expect(permissaoValida(chave)).toBe(true);
    }
  });

  it("administração, jurídico e gestão são um perfil só (a Gestão), com todas as permissões", () => {
    expect(perfilPorChave("gestao")?.permissoes).toEqual(TODAS_AS_PERMISSOES);
    expect(perfilPorChave("administrador")).toBeNull();
    expect(perfilPorChave("juridico")).toBeNull();
  });

  it("só a Gestão tem a visão geral da operação e a gestão de usuários", () => {
    for (const perfil of PERFIS) {
      const tem = (c: string) => (perfil.permissoes as readonly string[]).includes(c);
      expect(tem("visao.geral"), perfil.chave).toBe(perfil.chave === "gestao");
      expect(tem("usuarios.gerir"), perfil.chave).toBe(perfil.chave === "gestao");
    }
  });

  it("o analista de adesão (Dr. Rui) instrui e acompanha a adesão: não mexe nas atas", () => {
    const analista = perfilPorChave("analista")?.permissoes ?? [];
    expect(analista).toEqual(["adesao.instruir", "adesao.acompanhar"]);
    expect(analista).not.toContain("atas.conformidade");
    expect(analista).not.toContain("atas.contrato");
    expect(perfilPorChave("aprovador")).toBeNull();
  });

  it("o captador mapeia a ata e cadastra itens, mas não aprova, não declara e não cobra", () => {
    const captador = perfilPorChave("captacao")?.permissoes ?? [];
    expect(captador).toEqual(["atas.captar", "atas.itens"]);
  });

  it("o estagiário só cadastra itens e registra adesão: não abre o resto da captação", () => {
    const estagiario = perfilPorChave("estagiario")?.permissoes ?? [];
    expect(estagiario).toEqual(["atas.itens", "adesao.registrar"]);
    expect(estagiario).not.toContain("atas.captar");
    expect(estagiario).not.toContain("adesao.declarar");
    expect(estagiario).not.toContain("atas.conformidade");
    expect(estagiario).not.toContain("visao.geral");
  });

  it("perfilPorChave devolve null para chave desconhecida", () => {
    expect(perfilPorChave("diretor")).toBeNull();
    expect(perfilPorChave(undefined)).toBeNull();
  });
});

describe("permissão exigida por ação do admin", () => {
  it("toda ação aponta para permissões que existem", () => {
    for (const [acao, exigida] of Object.entries(PERMISSAO_POR_ACAO)) {
      expect(acao).toMatch(/^admin\.[A-Za-z]+$/);
      for (const chave of Array.isArray(exigida) ? exigida : [exigida]) {
        expect(permissaoValida(chave)).toBe(true);
      }
    }
  });

  it("não existe aprovar nem rejeitar ata; contrato é do jurídico; cobrança é de quem cobra", () => {
    expect(PERMISSAO_POR_ACAO["admin.rejeitarAta"]).toBeUndefined();
    expect(PERMISSAO_POR_ACAO["admin.salvarContratoIntermediacao"]).toBe("atas.contrato");
    expect(PERMISSAO_POR_ACAO["admin.lancarLiquidacao"]).toBe("comissao.cobrar");
    expect(PERMISSAO_POR_ACAO["admin.decidirPedidosNegociacao"]).toBe("municipios.liberar");
  });

  it("criar e desativar usuários exige gerir usuários", () => {
    expect(PERMISSAO_POR_ACAO["admin.criarVendedorAdmin"]).toBe("usuarios.gerir");
    expect(PERMISSAO_POR_ACAO["admin.alternarStatusVendedor"]).toBe("usuarios.gerir");
  });

  it("a conformidade da ata (rascunho e conclusão) é de quem confere: o jurídico", () => {
    expect(PERMISSAO_POR_ACAO["admin.analisarAta"]).toBe("atas.conformidade");
  });
});
