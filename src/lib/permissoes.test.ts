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
    expect(permissaoValida("atas.aprovar")).toBe(true);
    expect(permissaoValida("atas.apagar")).toBe(false);
    expect(permissaoValida(42)).toBe(false);
    expect(permissaoValida(null)).toBe(false);
  });

  it("normalizarPermissoes tira o que é desconhecido e repetido e segue a ordem da tabela", () => {
    expect(normalizarPermissoes(["base.editar", "atas.aprovar", "lixo", "atas.aprovar", 7])).toEqual([
      "atas.aprovar",
      "base.editar",
    ]);
    expect(normalizarPermissoes("atas.aprovar")).toEqual([]);
    expect(normalizarPermissoes(undefined)).toEqual([]);
  });

  it("temPermissao e temAlguma tratam lista ausente como sem permissão", () => {
    expect(temPermissao(["atas.aprovar"], "atas.aprovar")).toBe(true);
    expect(temPermissao(["atas.aprovar"], "atas.contrato")).toBe(false);
    expect(temPermissao(null, "atas.aprovar")).toBe(false);
    expect(temPermissao(undefined, "atas.aprovar")).toBe(false);
    expect(temAlguma(["atas.contrato"], ["atas.aprovar", "atas.contrato"])).toBe(true);
    expect(temAlguma([], ["atas.aprovar"])).toBe(false);
  });
});

describe("perfis prontos", () => {
  it("só usam permissões que existem", () => {
    for (const perfil of PERFIS) {
      for (const chave of perfil.permissoes) expect(permissaoValida(chave)).toBe(true);
    }
  });

  it("o administrador completo tem todas as permissões", () => {
    expect(perfilPorChave("administrador")?.permissoes).toEqual(TODAS_AS_PERMISSOES);
  });

  it("o aprovador só aprova e o jurídico não aprova: quem aprova não confere a própria conformidade", () => {
    expect(perfilPorChave("aprovador")?.permissoes).toEqual(["atas.aprovar"]);
    expect(perfilPorChave("juridico")?.permissoes).not.toContain("atas.aprovar");
  });

  it("captação (estagiário) não aprova, não cobra e não gere usuários", () => {
    const captacao = perfilPorChave("captacao")?.permissoes ?? [];
    expect(captacao).toContain("atas.captar");
    expect(captacao).not.toContain("atas.aprovar");
    expect(captacao).not.toContain("comissao.cobrar");
    expect(captacao).not.toContain("usuarios.gerir");
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

  it("aprovar e rejeitar ata são do aprovador; contrato é do jurídico; cobrança é de quem cobra", () => {
    expect(PERMISSAO_POR_ACAO["admin.rejeitarAta"]).toBe("atas.aprovar");
    expect(PERMISSAO_POR_ACAO["admin.salvarContratoIntermediacao"]).toBe("atas.contrato");
    expect(PERMISSAO_POR_ACAO["admin.lancarLiquidacao"]).toBe("comissao.cobrar");
    expect(PERMISSAO_POR_ACAO["admin.decidirPedidosNegociacao"]).toBe("municipios.liberar");
  });

  it("criar e desativar usuários exige gerir usuários", () => {
    expect(PERMISSAO_POR_ACAO["admin.criarVendedorAdmin"]).toBe("usuarios.gerir");
    expect(PERMISSAO_POR_ACAO["admin.alternarStatusVendedor"]).toBe("usuarios.gerir");
  });

  it("a análise da ata aceita quem confere (jurídico) ou quem aprova", () => {
    expect(PERMISSAO_POR_ACAO["admin.analisarAta"]).toEqual(["atas.conformidade", "atas.aprovar"]);
  });
});
