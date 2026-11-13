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
import { Gaveta, PainelEstagio } from "./gaveta";

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

describe("painel Estágio: a adesão é registrada pela equipe da Central", () => {
  const painel = (estagio: string, valorAderido: number | null = null) =>
    renderToStaticMarkup(createElement(PainelEstagio, { cartao: { ...cartao, estagio, valorAderido } }));

  it("o consultor não escolhe Aderiu: a opção vem desativada e a tela explica quem registra", () => {
    const html = painel("em_negociacao");
    expect(html).toMatch(/<option value="aderiu" disabled=""[^>]*>Aderiu \(registrado pela equipe\)<\/option>/);
    expect(html).toContain("avise a equipe da Central");
    // Nenhum campo de valor aderido: o valor é calculado das quantidades que a equipe registra.
    expect(html).not.toContain('name="valorAderido"');
    expect(html).not.toContain("Controle de recebíveis");
  });

  it("os outros estágios continuam disponíveis", () => {
    const html = painel("a_contatar");
    for (const rotulo of ["A contatar", "Em negociação", "Recusou"]) expect(html).toContain(rotulo);
    expect(html).not.toMatch(/<option value="(a_contatar|em_negociacao|recusado)" disabled/);
  });

  it("adesão já registrada: só informa, com o valor, sem formulário para mudar o estágio", () => {
    const html = painel("aderiu", 32000);
    expect(html).toContain("Adesão registrada pela equipe da Central");
    expect(html).toContain("32.000,00");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<form");
  });
});
