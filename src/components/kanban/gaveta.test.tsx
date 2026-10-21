import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// As actions de verdade puxam sessão e banco: aqui só interessa o que a gaveta desenha.
vi.mock("@/app/vendedor/actions", () => ({
  confirmarContatoVendedor: vi.fn(),
  marcarContatoErradoVendedor: vi.fn(),
  moverEstagioOportunidade: vi.fn(),
  registrarContatoVendedor: vi.fn(),
}));
vi.mock("@/app/vendedor/instrucao-actions", () => ({
  marcarItemInstrucao: vi.fn(),
  declararConformidade: vi.fn(),
  revogarDeclaracao: vi.fn(),
}));

import { montarCartao } from "@/lib/kanban-view";
import { Gaveta } from "./gaveta";

const cartao = montarCartao(
  {
    id: "cm1oportunidade0000000001",
    ataId: "ata1",
    ataNumero: "10/2026",
    vendedorNome: "Maria Souza",
    entidadeAlvoId: "e1",
    nomeMunicipio: "Prefeitura de Teste",
    uf: "GO",
    estagio: "em_negociacao",
    observacoes: null,
    prazoEm: null,
    proximoContatoEm: null,
    valorAderido: null,
    percentualComissao: null,
    contatos: [],
    necessidades: [],
    interacoes: [],
    liquidacoes: [],
    sinais: [],
    instrucao: null,
  },
  { categoriaAta: null, percentualContrato: null },
  new Date("2026-10-21T12:00:00Z"),
);

const desenhar = (somenteLeitura = false) =>
  renderToStaticMarkup(createElement(Gaveta, { cartao, categoriaAta: null, somenteLeitura, fechar: () => {} }));

describe("gaveta do município: fileira de abas", () => {
  it("tem as cinco abas, com Instrução por último, e só a primeira selecionada", () => {
    const html = desenhar();
    const abas = [...html.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)/g)].map((m) => m[1]);
    expect(abas).toEqual(["Quem falar", "Necessidade", "Contexto", "Histórico", "Instrução"]);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-selected="true"[^>]*>Quem falar/);
    // O conteúdo da aba Instrução só aparece depois do clique.
    expect(html).not.toContain("Instrução da adesão");
  });

  it("a fileira rola de lado quando não cabe e o anel de foco fica por dentro da aba (não é cortado)", () => {
    const html = desenhar();
    expect(html).toMatch(/<div style="[^"]*overflow-x:auto[^"]*">\s*<div class="kb-abas" role="tablist"/);
    const botoes = html.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];
    expect(botoes).toHaveLength(5);
    for (const botao of botoes) expect(botao).toContain("outline-offset:-2px");
  });

  it("as sombras das pontas usam só tokens (nada de cor escrita à mão)", () => {
    const html = desenhar();
    const estilo = html.match(/<div style="([^"]*overflow-x:auto[^"]*)"/)?.[1] ?? "";
    expect(estilo).toContain("var(--cor-fundo)");
    expect(estilo).toContain("var(--cor-texto)");
    expect(estilo).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
