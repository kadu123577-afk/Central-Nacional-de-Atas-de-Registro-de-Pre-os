import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * A sugestão de comissão na tela do contrato de intermediação: o que o
 * servidor monta (montarSugestaoContrato) e o que o componente desenha em
 * cada caso (com sugestão, sem faixas, abaixo da primeira faixa, fora do
 * intervalo do contrato, sem itens, consulta indisponível). Números de teste,
 * sem relação com a política comercial: quem define as faixas é o
 * administrador, no banco.
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/atas/x/contrato" }));

import { montarSugestaoContrato, type SugestaoContrato } from "./sugestao";
import { SugestaoComissao } from "./sugestao-comissao";

const ITENS = [
  { quantidadeRegistrada: 100, valorUnitario: 1_000 }, // R$ 100.000,00
  { quantidadeRegistrada: 50, valorUnitario: 200.5 }, // R$ 10.025,00
];
// Total da ata de teste: R$ 110.025,00.

const FAIXAS = [
  { valorMinimo: 0, percentual: 0.1 },
  { valorMinimo: 100_000, percentual: 0.0525 },
  { valorMinimo: 1_000_000, percentual: 0.04 },
];

describe("montarSugestaoContrato", () => {
  it("escolhe a faixa pelo valor total da ata (quantidade x valor unitário de todos os itens)", () => {
    expect(montarSugestaoContrato({ itens: ITENS, faixas: FAIXAS })).toEqual({
      tipo: "sugestao",
      valorTotalTexto: "R$ 110.025,00",
      percentualTexto: "5,25%",
      percentualCampo: "5,25",
      faixaTexto: "R$ 100.000,00",
      foraDoIntervalo: false,
    });
  });

  it("marca como fora do intervalo do contrato uma sugestão abaixo de 3% ou acima de 15%", () => {
    const abaixo = montarSugestaoContrato({ itens: ITENS, faixas: [{ valorMinimo: 0, percentual: 0.02 }] });
    const acima = montarSugestaoContrato({ itens: ITENS, faixas: [{ valorMinimo: 0, percentual: 0.2 }] });
    expect(abaixo).toMatchObject({ tipo: "sugestao", percentualCampo: "2", foraDoIntervalo: true });
    expect(acima).toMatchObject({ tipo: "sugestao", percentualCampo: "20", foraDoIntervalo: true });
  });

  it("3% e 15% (os extremos) estão dentro do intervalo", () => {
    for (const percentual of [0.03, 0.15]) {
      const r = montarSugestaoContrato({ itens: ITENS, faixas: [{ valorMinimo: 0, percentual }] });
      expect(r).toMatchObject({ tipo: "sugestao", foraDoIntervalo: false });
    }
  });

  it("sem faixas (ou só faixas inválidas): sem sugestão, sem percentual padrão", () => {
    expect(montarSugestaoContrato({ itens: ITENS, faixas: [] })).toEqual({
      tipo: "sem-faixas",
      valorTotalTexto: "R$ 110.025,00",
    });
    expect(
      montarSugestaoContrato({ itens: ITENS, faixas: [{ valorMinimo: 0, percentual: 0 }, { valorMinimo: 0, percentual: 0.9 }] }),
    ).toMatchObject({ tipo: "sem-faixas" });
  });

  it("valor abaixo da primeira faixa: diz onde a primeira faixa começa", () => {
    expect(montarSugestaoContrato({ itens: ITENS, faixas: [{ valorMinimo: 500_000, percentual: 0.05 }] })).toEqual({
      tipo: "abaixo-da-primeira",
      valorTotalTexto: "R$ 110.025,00",
      primeiraFaixaTexto: "R$ 500.000,00",
    });
  });

  it("ata sem itens não tem valor total: sem sugestão", () => {
    expect(montarSugestaoContrato({ itens: [], faixas: FAIXAS })).toEqual({ tipo: "sem-itens" });
  });

  it("consulta das faixas falhou: indisponível, mesmo com faixas na mão", () => {
    expect(montarSugestaoContrato({ itens: ITENS, faixas: FAIXAS, falhou: true })).toEqual({ tipo: "indisponivel" });
  });

  it("não depende da ordem das faixas e não altera a lista recebida", () => {
    const embaralhadas = [FAIXAS[2], FAIXAS[0], FAIXAS[1]];
    const copia = embaralhadas.map((f) => ({ ...f }));
    expect(montarSugestaoContrato({ itens: ITENS, faixas: embaralhadas })).toMatchObject({ percentualCampo: "5,25" });
    expect(embaralhadas).toEqual(copia);
  });
});

function html(sugestao: SugestaoContrato, aoUsar: (campo: string) => void = () => {}): string {
  return renderToStaticMarkup(createElement(SugestaoComissao, { sugestao, aoUsar }));
}

describe("SugestaoComissao", () => {
  it("com sugestão: mostra valor total, percentual e faixa, e oferece o botão que só preenche o campo", () => {
    const saida = html(montarSugestaoContrato({ itens: ITENS, faixas: FAIXAS }));
    expect(saida).toContain("Valor total da ata:");
    expect(saida).toContain("R$ 110.025,00");
    expect(saida).toContain("Sugestão:");
    expect(saida).toContain("5,25%");
    expect(saida).toContain("faixa a partir de");
    expect(saida).toContain("R$ 100.000,00");
    expect(saida).toContain("Usar sugestão");
    // Nunca é um botão de envio: não grava o contrato.
    expect(saida).toMatch(/<button type="button"[^>]*>Usar sugestão<\/button>/);
    expect(saida).not.toContain('type="submit"');
    expect(saida).toContain("É só uma sugestão");
  });

  it("fora do intervalo do contrato: avisa e não oferece o botão", () => {
    const saida = html(montarSugestaoContrato({ itens: ITENS, faixas: [{ valorMinimo: 0, percentual: 0.2 }] }));
    expect(saida).toContain("20%");
    expect(saida).toContain("fora do intervalo que o contrato aceita (de 3% a 15%)");
    expect(saida).not.toContain("Usar sugestão");
    expect(saida).toContain('href="/admin/comissao"');
  });

  it("sem faixas: texto neutro e link para a tela de comissão", () => {
    const saida = html(montarSugestaoContrato({ itens: ITENS, faixas: [] }));
    expect(saida).toContain("Nenhuma faixa de comissão está configurada");
    expect(saida).toContain("R$ 110.025,00");
    expect(saida).toContain('href="/admin/comissao"');
    expect(saida).toContain("Configurar as faixas");
    expect(saida).not.toContain("Usar sugestão");
  });

  it("abaixo da primeira faixa: explica e aponta para as faixas", () => {
    const saida = html(montarSugestaoContrato({ itens: ITENS, faixas: [{ valorMinimo: 500_000, percentual: 0.05 }] }));
    expect(saida).toContain("abaixo da primeira faixa");
    expect(saida).toContain("R$ 500.000,00");
    expect(saida).toContain('href="/admin/comissao"');
    expect(saida).not.toContain("Usar sugestão");
  });

  it("sem itens: explica que não há valor total", () => {
    const saida = html({ tipo: "sem-itens" });
    expect(saida).toContain("ainda não tem itens");
    expect(saida).not.toContain("Usar sugestão");
  });

  it("consulta indisponível: avisa que dá para digitar o percentual", () => {
    const saida = html({ tipo: "indisponivel" });
    expect(saida).toContain("Não foi possível consultar as faixas");
    expect(saida).toContain("digitar o percentual normalmente");
    expect(saida).not.toContain("/admin/comissao");
  });

  it("não escreve cor à mão (só tokens)", () => {
    const todas = [
      html(montarSugestaoContrato({ itens: ITENS, faixas: FAIXAS })),
      html(montarSugestaoContrato({ itens: ITENS, faixas: [] })),
    ].join("");
    expect(todas).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(todas).not.toMatch(/rgb\(/);
  });
});
