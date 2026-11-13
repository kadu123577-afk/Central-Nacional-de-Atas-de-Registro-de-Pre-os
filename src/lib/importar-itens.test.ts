import { describe, expect, it } from "vitest";
import {
  LIMITE_LINHAS_IMPORTACAO,
  interpretarPlanilhaDeItens,
  numeroDaPlanilha,
} from "./importar-itens";

const CAB = "Descrição;Unidade;Quantidade;Valor unitário;Marca;Categoria;Código do catálogo";

describe("numeroDaPlanilha", () => {
  it.each([
    ["25,90", 25.9],
    ["25.90", 25.9],
    ["1.234,56", 1234.56],
    ["R$ 1.000", 1000],
    ["1.234", 1234],
    ["100", 100],
    ["0,5", 0.5],
  ])("%s vira %s", (texto, esperado) => {
    expect(numeroDaPlanilha(texto)).toBe(esperado);
  });

  it.each(["", "abc", "1,2,3", "12a", "--5"])("%s não é número", (texto) => {
    expect(numeroDaPlanilha(texto)).toBeNull();
  });
});

describe("interpretarPlanilhaDeItens", () => {
  it("lê CSV com ponto e vírgula, categoria por rótulo e código sem zeros à esquerda", () => {
    const r = interpretarPlanilhaDeItens(
      `${CAB}\nPapel sulfite A4;Caixa;100;25,90;Chamex;Material de escritório;000123\nCaneta azul;Un;2.000;1,5;;;`,
      "material-escritorio",
    );
    expect(r.erros).toEqual([]);
    expect(r.linhasLidas).toBe(2);
    expect(r.itens[0]).toEqual({
      linha: 2,
      descricao: "Papel sulfite A4",
      unidade: "Caixa",
      quantidadeRegistrada: 100,
      valorUnitario: "25.90",
      marca: "Chamex",
      categoria: "material-escritorio",
      codigoCatalogo: "123",
    });
    expect(r.itens[1]).toMatchObject({ quantidadeRegistrada: 2000, valorUnitario: "1.50", marca: null, codigoCatalogo: null });
  });

  it("lê o que vem colado do Excel (tabulação) e aceita sinônimos de cabeçalho", () => {
    const r = interpretarPlanilhaDeItens("Item\tUN\tQtd\tPreço\nLuva de procedimento\tCaixa\t500\t32,00", "material-hospitalar");
    expect(r.erros).toEqual([]);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ descricao: "Luva de procedimento", valorUnitario: "32.00", categoria: "material-hospitalar" });
  });

  it("respeita aspas: vírgula dentro da descrição não separa coluna", () => {
    const r = interpretarPlanilhaDeItens('Descrição,Unidade,Quantidade,Valor unitário\n"Caneta, azul ""fina""",Un,10,2.5', "material-escritorio");
    expect(r.erros).toEqual([]);
    expect(r.itens[0].descricao).toBe('Caneta, azul "fina"');
  });

  it("ignora linhas em branco e o BOM do Excel", () => {
    const r = interpretarPlanilhaDeItens(`﻿${CAB}\n\nPapel;Caixa;1;1;;material-escritorio;\n\n`, null);
    expect(r.erros).toEqual([]);
    expect(r.linhasLidas).toBe(1);
  });

  it("aponta cada problema na linha certa da planilha (a do cabeçalho é a 1)", () => {
    const r = interpretarPlanilhaDeItens(
      `${CAB}\n;Caixa;10;5;;;\nPapel;Caixa;1,5;5;;;\nCaneta;Un;10;0;;;\nLápis;Un;10;1;;Inexistente;\nBorracha;Un;10;1;;;ABC`,
      "material-escritorio",
    );
    expect(r.itens).toEqual([]);
    expect(r.erros.map((e) => e.linha)).toEqual([2, 3, 4, 5, 6]);
    expect(r.erros[0].mensagem).toContain("descrição vazia");
    expect(r.erros[1].mensagem).toContain("número inteiro");
    expect(r.erros[2].mensagem).toContain("valor unitário inválido");
    expect(r.erros[3].mensagem).toContain('categoria "Inexistente" não existe');
    expect(r.erros[4].mensagem).toContain("código do catálogo");
  });

  it("sem categoria na planilha e sem categoria na ata, pede a categoria", () => {
    const r = interpretarPlanilhaDeItens(`${CAB}\nPapel;Caixa;1;1;;;`, null);
    expect(r.erros[0].mensagem).toContain("sem categoria");
  });

  it("cabeçalho sem colunas obrigatórias: um erro só, dizendo quais faltam", () => {
    const r = interpretarPlanilhaDeItens("Descrição;Marca\nPapel;Chamex", null);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0].mensagem).toContain("unidade, quantidade, valor unitário");
    expect(r.itens).toEqual([]);
  });

  it("vazio, grande demais e itens demais são recusados com mensagem clara", () => {
    expect(interpretarPlanilhaDeItens("  \n ", null).erros[0].mensagem).toContain("Cole ou envie");
    expect(interpretarPlanilhaDeItens("x".repeat(200_001), null).erros[0].mensagem).toContain("grande demais");
    const muitas = [CAB, ...Array.from({ length: LIMITE_LINHAS_IMPORTACAO + 1 }, (_, i) => `Item ${i};Un;1;1;;material-escritorio;`)].join("\n");
    expect(interpretarPlanilhaDeItens(muitas, null).erros[0].mensagem).toContain("limite por importação");
  });
});
