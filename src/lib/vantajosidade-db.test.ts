import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O comparativo da ata, testado com o Prisma trocado por dublês: o que se
 * confere é o que ele pede ao banco (duas consultas em lote, nunca uma por
 * item), a conversão de Decimal para número e como cada item é classificado.
 */
const dobles = vi.hoisted(() => ({
  itemFindMany: vi.fn(),
  referenciaFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    item: { findMany: dobles.itemFindMany },
    referenciaPreco: { findMany: dobles.referenciaFindMany },
  },
}));

import { Prisma } from "@/generated/prisma/client";
import { TEXTO_AVISO_VANTAJOSIDADE } from "./vantajosidade";
import {
  MENSAGEM_CODIGO_CATALOGO_INVALIDO,
  carregarComparativoDaAta,
  carregarComparativoOuNulo,
  interpretarCodigoCatalogo,
  montarComparativo,
  unidadesDivergem,
  type LinhaItem,
  type LinhaReferencia,
} from "./vantajosidade-db";

const CONSULTA = new Date("2026-10-22T13:00:00Z");

function item(extra: Partial<LinhaItem> = {}): LinhaItem {
  return {
    id: "i1",
    descricao: "Papel sulfite A4, caixa com 10 resmas",
    unidade: "Caixa",
    quantidadeRegistrada: 100,
    valorUnitario: new Prisma.Decimal("100.00"),
    codigoCatalogo: "123456",
    ...extra,
  };
}

/** Referência com p25 = 95, mediana = 100, p75 = 105 e 10 preços usados. */
function referencia(extra: Partial<LinhaReferencia> = {}): LinhaReferencia {
  return {
    codigoCatalogo: "123456",
    tipoCatalogo: "material",
    n: 12,
    nUsadas: 10,
    minimo: new Prisma.Decimal("80.0000"),
    p25: new Prisma.Decimal("95.0000"),
    mediana: new Prisma.Decimal("100.0000"),
    p75: new Prisma.Decimal("105.0000"),
    maximo: new Prisma.Decimal("120.0000"),
    media: new Prisma.Decimal("101.5000"),
    janelaInicio: new Date("2025-10-22T00:00:00Z"),
    janelaFim: new Date("2026-10-22T00:00:00Z"),
    unidadeFornecimento: "CAIXA",
    consultadoEm: CONSULTA,
    erro: null,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.itemFindMany.mockResolvedValue([]);
  dobles.referenciaFindMany.mockResolvedValue([]);
});

describe("interpretarCodigoCatalogo", () => {
  it("vazio, só espaços, nulo ou ausente viram null (ainda não informado)", () => {
    for (const vazio of ["", "   ", "\n\t", null, undefined]) {
      expect(interpretarCodigoCatalogo(vazio)).toEqual({ ok: true, codigo: null });
    }
  });

  it("aceita de 1 a 10 dígitos e tira os espaços das pontas", () => {
    expect(interpretarCodigoCatalogo("7")).toEqual({ ok: true, codigo: "7" });
    expect(interpretarCodigoCatalogo(" 123456 ")).toEqual({ ok: true, codigo: "123456" });
    expect(interpretarCodigoCatalogo("1234567890")).toEqual({ ok: true, codigo: "1234567890" });
  });

  it("tira zeros à esquerda para o mesmo código não virar duas referências", () => {
    expect(interpretarCodigoCatalogo("000123")).toEqual({ ok: true, codigo: "123" });
    expect(interpretarCodigoCatalogo("0123456789")).toEqual({ ok: true, codigo: "123456789" });
  });

  it("recusa lixo com a mensagem clara", () => {
    const lixo = ["abc", "12a", "a12", "12.5", "12,5", "1 2", "-1", "+1", "1e5", "12345678901", "0", "000", "１２３", "12\n34", "R$ 10"];
    for (const valor of lixo) {
      expect(interpretarCodigoCatalogo(valor), valor).toEqual({ ok: false, erro: MENSAGEM_CODIGO_CATALOGO_INVALIDO });
    }
    // Arquivo, número e outras coisas que não são texto também não passam.
    expect(interpretarCodigoCatalogo(123456)).toEqual({ ok: false, erro: MENSAGEM_CODIGO_CATALOGO_INVALIDO });
    expect(interpretarCodigoCatalogo(new Blob(["1"]))).toEqual({ ok: false, erro: MENSAGEM_CODIGO_CATALOGO_INVALIDO });
  });

  it("a mensagem fala em números, de 1 a 10 dígitos, e que pode deixar em branco", () => {
    expect(MENSAGEM_CODIGO_CATALOGO_INVALIDO).toMatch(/só números/);
    expect(MENSAGEM_CODIGO_CATALOGO_INVALIDO).toMatch(/1 a 10 dígitos/);
    expect(MENSAGEM_CODIGO_CATALOGO_INVALIDO).toMatch(/em branco/);
  });
});

describe("unidadesDivergem", () => {
  it.each([
    ["UN", "UNIDADE"],
    ["Unidade", "UND"],
    ["unid.", "UN"],
    ["Peça", "UNIDADE"],
    ["CX", "Caixa"],
    ["Caixa", "CAIXA 50 UN"],
    ["Caixa c/ 50", "CAIXA 50 UN"],
    ["Pacote", "PCT"],
    ["Pct c/ 100", "PACOTE 100"],
    ["Quilo", "KG"],
    ["Litro", "L"],
    ["Metro", "M"],
    ["  Resma  ", "RESMA"],
    ["Metro quadrado", "M2"],
    ["m²", "M2"],
    ["Gr", "Grama"],
  ])("%s e %s são a mesma unidade", (a, b) => {
    expect(unidadesDivergem(a, b)).toBe(false);
    expect(unidadesDivergem(b, a)).toBe(false);
  });

  it.each([
    ["UN", "PCT 100"],
    ["Unidade", "CAIXA 50 UN"],
    ["Caixa", "UNIDADE"],
    ["Pacote c/ 100", "PACOTE 500"],
    ["Kg", "G"],
    ["Litro", "ML"],
    ["Frasco", "Galão"],
    ["Metro", "M2"],
    ["M2", "M3"],
  ])("%s e %s são diferentes", (a, b) => {
    expect(unidadesDivergem(a, b)).toBe(true);
    expect(unidadesDivergem(b, a)).toBe(true);
  });

  it("em dúvida, não diverge: vazio, ausente ou unidade que não reconhece", () => {
    expect(unidadesDivergem("UN", null)).toBe(false);
    expect(unidadesDivergem("UN", undefined)).toBe(false);
    expect(unidadesDivergem("UN", "")).toBe(false);
    expect(unidadesDivergem("   ", "CAIXA")).toBe(false);
    expect(unidadesDivergem("Embalagem", "CAIXA")).toBe(false);
    expect(unidadesDivergem("Lt", "UN")).toBe(false);
    expect(unidadesDivergem("Pacote", "PACOTE")).toBe(false);
    // Capacidade só de um lado não prova nada.
    expect(unidadesDivergem("Pacote", "PACOTE 500")).toBe(false);
  });
});

describe("montarComparativo: situações", () => {
  it("compatível: preço da ata na faixa da mediana", () => {
    const { itens, resumo } = montarComparativo([item()], [referencia()]);
    expect(itens).toHaveLength(1);
    expect(itens[0].classificacao).toBe("compativel");
    expect(itens[0].diferencaPercentual).toBe(0);
    expect(itens[0].unidadeDiverge).toBe(false);
    expect(itens[0].explicacao).toContain("compatível");
    expect(resumo).toMatchObject({ itensTotal: 1, itensComReferencia: 1, compativeis: 1, acima: 0, abaixo: 0, semReferencia: 0 });
  });

  it("acima: preço bem maior que a faixa, com a diferença percentual sobre a mediana", () => {
    const { itens, resumo } = montarComparativo([item({ valorUnitario: new Prisma.Decimal("130.00") })], [referencia()]);
    expect(itens[0].classificacao).toBe("acima");
    expect(itens[0].diferencaPercentual).toBeCloseTo(30, 10);
    expect(resumo.acima).toBe(1);
    expect(resumo.pesoAcima).toBe(100);
  });

  it("abaixo: preço bem menor que a faixa, com a explicação de conferir a equivalência", () => {
    const { itens, resumo } = montarComparativo([item({ valorUnitario: new Prisma.Decimal("70.00") })], [referencia()]);
    expect(itens[0].classificacao).toBe("abaixo");
    expect(itens[0].diferencaPercentual).toBeCloseTo(-30, 10);
    expect(itens[0].explicacao).toMatch(/preço muito baixo/);
    expect(resumo.abaixo).toBe(1);
  });

  it("amostra insuficiente: poucos preços usados, sem diferença percentual", () => {
    const { itens, resumo } = montarComparativo([item()], [referencia({ nUsadas: 3, n: 3 })]);
    expect(itens[0].classificacao).toBe("amostra_insuficiente");
    expect(itens[0].diferencaPercentual).toBeNull();
    expect(itens[0].referencia?.nUsadas).toBe(3);
    expect(resumo).toMatchObject({ itensComReferencia: 0, semReferencia: 1 });
  });

  it("sem código: sem_referencia com a explicação pedida e nenhuma referência", () => {
    for (const codigo of [null, "", "   "]) {
      const { itens, resumo } = montarComparativo([item({ codigoCatalogo: codigo })], [referencia()]);
      expect(itens[0].classificacao).toBe("sem_referencia");
      expect(itens[0].codigoCatalogo).toBeNull();
      expect(itens[0].referencia).toBeNull();
      expect(itens[0].explicacao).toBe("Informe o código do catálogo do item para comparar.");
      expect(itens[0].unidadeDiverge).toBe(false);
      expect(resumo.semReferencia).toBe(1);
    }
  });

  it("código com zeros à esquerda no item acha a referência gravada sem eles; só zeros vale como sem código", () => {
    const { itens } = montarComparativo([item({ codigoCatalogo: " 0123456 " })], [referencia({ codigoCatalogo: "123456" })]);
    expect(itens[0].codigoCatalogo).toBe("123456");
    expect(itens[0].classificacao).toBe("compativel");

    const zeros = montarComparativo([item({ codigoCatalogo: "000" })], [referencia({ codigoCatalogo: "0" })]);
    expect(zeros.itens[0].codigoCatalogo).toBeNull();
    expect(zeros.itens[0].classificacao).toBe("sem_referencia");
    expect(zeros.itens[0].explicacao).toBe("Informe o código do catálogo do item para comparar.");
  });

  it("com código mas sem linha de referência: ainda não consultado", () => {
    const { itens } = montarComparativo([item({ codigoCatalogo: "999" })], [referencia()]);
    expect(itens[0].classificacao).toBe("sem_referencia");
    expect(itens[0].referencia).toBeNull();
    expect(itens[0].explicacao).toContain("999");
    expect(itens[0].explicacao).toMatch(/Ainda não foram consultados/);
  });

  it("última consulta com erro e sem estatística: sem_referencia, mantendo o erro para a tela", () => {
    const falha = referencia({
      nUsadas: 0,
      n: 0,
      minimo: null,
      p25: null,
      mediana: null,
      p75: null,
      maximo: null,
      media: null,
      erro: "API fora do ar",
    });
    const { itens } = montarComparativo([item()], [falha]);
    expect(itens[0].classificacao).toBe("sem_referencia");
    expect(itens[0].referencia?.erro).toBe("API fora do ar");
    expect(itens[0].referencia?.mediana).toBeNull();
    expect(itens[0].explicacao).toMatch(/não deu certo/);
  });

  it("última consulta falhou mas há estatística da anterior: compara, avisa da falha e mostra o dia em que os preços foram de fato consultados", () => {
    // O script, ao falhar, troca só erro e consultadoEm (a data da TENTATIVA); a janela continua a da última consulta boa.
    const tentativa = new Date("2026-10-25T13:00:00Z");
    const antiga = referencia({ erro: "API fora do ar", consultadoEm: tentativa, janelaFim: new Date("2026-10-22T00:00:00Z") });
    const { itens, consultadoEm } = montarComparativo([item({ valorUnitario: new Prisma.Decimal("130.00") })], [antiga]);

    expect(itens[0].classificacao).toBe("acima");
    expect(itens[0].explicacao).toMatch(/não deu certo/);
    expect(itens[0].explicacao).toMatch(/consulta anterior/);
    expect(itens[0].referencia?.erro).toBe("API fora do ar");
    // Nunca a data da tentativa (25/10) ao lado de preços de 22/10.
    const dia = itens[0].referencia?.consultadoEm;
    expect(dia).toEqual(new Date("2026-10-22T12:00:00Z"));
    expect(dia?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })).toBe("22/10/2026");
    expect(consultadoEm).toEqual({ maisAntiga: dia, maisRecente: dia });
  });

  it("sem falha, a data de consulta é a do próprio registro, não a do fim da janela", () => {
    const { itens } = montarComparativo([item()], [referencia({ consultadoEm: new Date("2026-10-23T13:00:00Z") })]);
    expect(itens[0].referencia?.consultadoEm).toEqual(new Date("2026-10-23T13:00:00Z"));
    expect(itens[0].explicacao).not.toMatch(/não deu certo|consulta anterior/);
  });

  it("falha com a janela ilegível: cai na data da tentativa, sem quebrar", () => {
    const quebrada = referencia({ erro: "falhou", janelaFim: new Date("não é data") });
    const { itens } = montarComparativo([item()], [quebrada]);
    expect(itens[0].classificacao).toBe("compativel");
    expect(itens[0].referencia?.consultadoEm).toEqual(CONSULTA);
  });

  it("consulta sem erro mas sem preços: diz que não encontrou preços", () => {
    const vazia = referencia({ nUsadas: 0, n: 0, p25: null, mediana: null, p75: null, minimo: null, maximo: null, media: null });
    const { itens } = montarComparativo([item()], [vazia]);
    expect(itens[0].classificacao).toBe("sem_referencia");
    expect(itens[0].explicacao).toMatch(/não encontrou preços/);
  });

  it("preço da ata inválido (zero): sem_referencia, sem quebrar", () => {
    const { itens, resumo } = montarComparativo([item({ valorUnitario: new Prisma.Decimal("0") })], [referencia()]);
    expect(itens[0].classificacao).toBe("sem_referencia");
    expect(itens[0].diferencaPercentual).toBeNull();
    expect(resumo.semReferencia).toBe(1);
  });
});

describe("montarComparativo: unidade diferente", () => {
  it("trata como sem_referencia, com a explicação pedida, e fora do resumo", () => {
    const { itens, resumo } = montarComparativo(
      [item({ unidade: "Unidade", valorUnitario: new Prisma.Decimal("130.00") })],
      [referencia({ unidadeFornecimento: "PCT 100" })],
    );
    expect(itens[0].unidadeDiverge).toBe(true);
    expect(itens[0].classificacao).toBe("sem_referencia");
    expect(itens[0].diferencaPercentual).toBeNull();
    expect(itens[0].explicacao).toBe(
      "A unidade do item (Unidade) parece diferente da unidade da referência (PCT 100); confira antes de comparar.",
    );
    // A referência continua à mostra (a tela pode mostrar a unidade dela), mas não conta como comparada.
    expect(itens[0].referencia?.unidadeFornecimento).toBe("PCT 100");
    expect(resumo).toMatchObject({ itensComReferencia: 0, acima: 0, semReferencia: 1, pesoAcima: null });
  });

  it("unidade igual com outro jeito de escrever não diverge", () => {
    const { itens } = montarComparativo([item({ unidade: "CX" })], [referencia({ unidadeFornecimento: "Caixa" })]);
    expect(itens[0].unidadeDiverge).toBe(false);
    expect(itens[0].classificacao).toBe("compativel");
  });

  it("referência sem unidade informada: em dúvida, compara", () => {
    const { itens } = montarComparativo([item()], [referencia({ unidadeFornecimento: null })]);
    expect(itens[0].unidadeDiverge).toBe(false);
    expect(itens[0].classificacao).toBe("compativel");
  });
});

describe("montarComparativo: Decimal, resumo e referência", () => {
  it("converte Decimal em número (preço da ata e estatísticas) e entrega as datas e a unidade", () => {
    const { itens } = montarComparativo([item({ valorUnitario: new Prisma.Decimal("12.50") })], [referencia()]);
    expect(itens[0].precoAta).toBe(12.5);
    expect(typeof itens[0].precoAta).toBe("number");
    expect(itens[0].referencia).toEqual({
      mediana: 100,
      p25: 95,
      p75: 105,
      minimo: 80,
      maximo: 120,
      n: 12,
      nUsadas: 10,
      janelaInicio: new Date("2025-10-22T00:00:00Z"),
      janelaFim: new Date("2026-10-22T00:00:00Z"),
      unidadeFornecimento: "CAIXA",
      consultadoEm: CONSULTA,
      erro: null,
    });
    for (const campo of ["mediana", "p25", "p75", "minimo", "maximo"] as const) {
      expect(typeof itens[0].referencia?.[campo]).toBe("number");
    }
  });

  it("aceita também números e textos numéricos no lugar de Decimal", () => {
    const { itens } = montarComparativo(
      [item({ valorUnitario: 100 })],
      [referencia({ p25: 95, mediana: "100", p75: { toString: () => "105" } })],
    );
    expect(itens[0].classificacao).toBe("compativel");
  });

  it("devolve os dados do item e do preço como número", () => {
    const { itens } = montarComparativo([item({ id: "abc", descricao: "Papel", unidade: "Resma", quantidadeRegistrada: 7 })], []);
    expect(itens[0]).toMatchObject({ itemId: "abc", descricao: "Papel", unidade: "Resma", quantidade: 7, precoAta: 100, codigoCatalogo: "123456" });
  });

  it("resumo coerente com os itens: contagens e peso dos itens acima pelo valor", () => {
    // Valor comparado: 100 x 100 (compatível) + 130 x 10 (acima) = 11.300; acima = 1.300 (11,5%).
    const { itens, resumo } = montarComparativo(
      [
        item({ id: "a", codigoCatalogo: "1", valorUnitario: new Prisma.Decimal("100.00"), quantidadeRegistrada: 100 }),
        item({ id: "b", codigoCatalogo: "2", valorUnitario: new Prisma.Decimal("130.00"), quantidadeRegistrada: 10 }),
        item({ id: "c", codigoCatalogo: "3", valorUnitario: new Prisma.Decimal("50.00") }),
        item({ id: "d", codigoCatalogo: null }),
        item({ id: "e", codigoCatalogo: "5", unidade: "Unidade" }),
      ],
      [
        referencia({ codigoCatalogo: "1" }),
        referencia({ codigoCatalogo: "2" }),
        referencia({ codigoCatalogo: "3", nUsadas: 2, n: 2 }),
        referencia({ codigoCatalogo: "5", unidadeFornecimento: "CAIXA 12 UN" }),
      ],
    );
    expect(itens.map((i) => i.classificacao)).toEqual([
      "compativel",
      "acima",
      "amostra_insuficiente",
      "sem_referencia",
      "sem_referencia",
    ]);
    expect(resumo).toMatchObject({ itensTotal: 5, itensComReferencia: 2, compativeis: 1, acima: 1, abaixo: 0, semReferencia: 3 });
    expect(resumo.pesoAcima).toBeCloseTo((1300 / 11300) * 100, 10);
  });

  it("consultadoEm cobre só os itens efetivamente comparados", () => {
    const antiga = new Date("2026-10-01T10:00:00Z");
    const recente = new Date("2026-10-22T10:00:00Z");
    const fora = new Date("2026-01-01T10:00:00Z");
    const { consultadoEm } = montarComparativo(
      [
        item({ id: "a", codigoCatalogo: "1" }),
        item({ id: "b", codigoCatalogo: "2" }),
        item({ id: "c", codigoCatalogo: "3" }),
      ],
      [
        referencia({ codigoCatalogo: "1", consultadoEm: recente }),
        referencia({ codigoCatalogo: "2", consultadoEm: antiga }),
        referencia({ codigoCatalogo: "3", consultadoEm: fora, nUsadas: 1, n: 1 }),
      ],
    );
    expect(consultadoEm).toEqual({ maisAntiga: antiga, maisRecente: recente });
  });

  it("sem nenhum item comparado, consultadoEm é null; ata sem itens devolve resumo zerado", () => {
    expect(montarComparativo([item({ codigoCatalogo: null })], []).consultadoEm).toBeNull();
    const vazio = montarComparativo([], []);
    expect(vazio.itens).toEqual([]);
    expect(vazio.consultadoEm).toBeNull();
    expect(vazio.resumo).toEqual({
      itensComReferencia: 0,
      itensTotal: 0,
      acima: 0,
      abaixo: 0,
      compativeis: 0,
      semReferencia: 0,
      pesoAcima: null,
    });
  });

  it("dois itens com o mesmo código usam a mesma referência", () => {
    const { itens } = montarComparativo(
      [item({ id: "a" }), item({ id: "b", valorUnitario: new Prisma.Decimal("130.00") })],
      [referencia()],
    );
    expect(itens.map((i) => i.classificacao)).toEqual(["compativel", "acima"]);
  });

  it("código com linha de material e de serviço: fica a que tem estatística; se as duas têm, a de material", () => {
    const material = referencia({ tipoCatalogo: "material", mediana: new Prisma.Decimal("100"), unidadeFornecimento: "CAIXA" });
    const servico = referencia({
      tipoCatalogo: "servico",
      p25: new Prisma.Decimal("1900"),
      mediana: new Prisma.Decimal("2000"),
      p75: new Prisma.Decimal("2100"),
      unidadeFornecimento: null,
    });
    const materialVazio = referencia({ tipoCatalogo: "material", nUsadas: 0, n: 0, p25: null, mediana: null, p75: null });

    expect(montarComparativo([item()], [servico, material]).itens[0].referencia?.mediana).toBe(100);
    expect(montarComparativo([item({ valorUnitario: 2000 })], [materialVazio, servico]).itens[0].referencia?.mediana).toBe(2000);
  });

  it("não altera as listas recebidas", () => {
    const itens = [item()];
    const refs = [referencia()];
    const copiaItens = structuredClone(itens.map((i) => ({ ...i, valorUnitario: String(i.valorUnitario) })));
    montarComparativo(itens, refs);
    expect(itens.map((i) => ({ ...i, valorUnitario: String(i.valorUnitario) }))).toEqual(copiaItens);
    expect(refs).toHaveLength(1);
  });

  it("os textos não prometem nada: nenhuma explicação diz que o preço é vantajoso ou comprovado", () => {
    const { itens } = montarComparativo(
      [
        item({ id: "a", codigoCatalogo: "1" }),
        item({ id: "b", codigoCatalogo: "2", valorUnitario: new Prisma.Decimal("130.00") }),
        item({ id: "c", codigoCatalogo: "3", valorUnitario: new Prisma.Decimal("70.00") }),
        item({ id: "d", codigoCatalogo: "4" }),
        item({ id: "e", codigoCatalogo: null }),
        item({ id: "f", codigoCatalogo: "6", unidade: "UN" }),
        item({ id: "g", codigoCatalogo: "7" }),
      ],
      [
        referencia({ codigoCatalogo: "1" }),
        referencia({ codigoCatalogo: "2" }),
        referencia({ codigoCatalogo: "3" }),
        referencia({ codigoCatalogo: "4", nUsadas: 2, n: 2 }),
        referencia({ codigoCatalogo: "6", unidadeFornecimento: "PCT 100" }),
        referencia({ codigoCatalogo: "7", nUsadas: 0, n: 0, p25: null, mediana: null, p75: null, erro: "falhou" }),
      ],
    );
    for (const i of itens) {
      expect(i.explicacao, i.itemId).not.toMatch(/vantajos|comprovad|garant|sem licita|melhor pre[cç]o|economia/i);
    }
  });
});

describe("carregarComparativoDaAta: o que pede ao banco", () => {
  it("faz exatamente duas consultas em lote, com os códigos sem repetição, mesmo com muitos itens", async () => {
    const itensDoBanco = Array.from({ length: 40 }, (_, i) => ({
      id: `i${i}`,
      descricao: `Item ${i}`,
      unidade: "Caixa",
      quantidadeRegistrada: 10,
      valorUnitario: new Prisma.Decimal("100.00"),
      codigoCatalogo: i % 2 === 0 ? "111" : i % 5 === 0 ? "222" : null,
    }));
    dobles.itemFindMany.mockResolvedValue(itensDoBanco);
    dobles.referenciaFindMany.mockResolvedValue([referencia({ codigoCatalogo: "111" }), referencia({ codigoCatalogo: "222" })]);

    const resultado = await carregarComparativoDaAta("ata1");

    expect(dobles.itemFindMany).toHaveBeenCalledTimes(1);
    expect(dobles.referenciaFindMany).toHaveBeenCalledTimes(1);
    expect(dobles.itemFindMany).toHaveBeenCalledWith({
      where: { ataId: "ata1" },
      orderBy: { id: "asc" },
      select: {
        id: true,
        descricao: true,
        unidade: true,
        quantidadeRegistrada: true,
        valorUnitario: true,
        codigoCatalogo: true,
      },
    });
    expect(dobles.referenciaFindMany).toHaveBeenCalledWith({ where: { codigoCatalogo: { in: ["111", "222"] } } });
    expect(resultado.itens).toHaveLength(40);
    expect(resultado.resumo.itensTotal).toBe(40);
  });

  it("pede as referências pelos códigos já normalizados (sem espaços nem zeros à esquerda)", async () => {
    dobles.itemFindMany.mockResolvedValue([
      item({ id: "a", codigoCatalogo: "00123" }),
      item({ id: "b", codigoCatalogo: " 123 " }),
      item({ id: "c", codigoCatalogo: "456" }),
    ]);
    dobles.referenciaFindMany.mockResolvedValue([referencia({ codigoCatalogo: "123" })]);
    const resultado = await carregarComparativoDaAta("ata1");
    expect(dobles.referenciaFindMany).toHaveBeenCalledWith({ where: { codigoCatalogo: { in: ["123", "456"] } } });
    expect(resultado.itens.map((i) => i.classificacao)).toEqual(["compativel", "compativel", "sem_referencia"]);
  });

  it("nenhum item com código: não consulta as referências", async () => {
    dobles.itemFindMany.mockResolvedValue([item({ codigoCatalogo: null }), item({ id: "i2", codigoCatalogo: "  " })]);
    const resultado = await carregarComparativoDaAta("ata1");
    expect(dobles.referenciaFindMany).not.toHaveBeenCalled();
    expect(resultado.itens.map((i) => i.classificacao)).toEqual(["sem_referencia", "sem_referencia"]);
  });

  it("ata sem itens: resumo zerado e nenhuma consulta de referência", async () => {
    const resultado = await carregarComparativoDaAta("ata1");
    expect(dobles.referenciaFindMany).not.toHaveBeenCalled();
    expect(resultado.itens).toEqual([]);
    expect(resultado.resumo.itensTotal).toBe(0);
  });

  it("junta item e referência pelo código e devolve tudo pronto para a tela", async () => {
    dobles.itemFindMany.mockResolvedValue([item({ valorUnitario: new Prisma.Decimal("130.00") })]);
    dobles.referenciaFindMany.mockResolvedValue([referencia()]);
    const resultado = await carregarComparativoDaAta("ata1");
    expect(resultado.itens[0]).toMatchObject({
      itemId: "i1",
      codigoCatalogo: "123456",
      classificacao: "acima",
      unidadeDiverge: false,
    });
    expect(resultado.resumo).toMatchObject({ itensComReferencia: 1, acima: 1 });
    expect(resultado.consultadoEm).toEqual({ maisAntiga: CONSULTA, maisRecente: CONSULTA });
  });

  it("carregarComparativoOuNulo devolve o mesmo comparativo e, se o banco falhar, null (sem derrubar a tela)", async () => {
    dobles.itemFindMany.mockResolvedValue([item()]);
    dobles.referenciaFindMany.mockResolvedValue([referencia()]);
    await expect(carregarComparativoOuNulo("ata1")).resolves.toEqual(await carregarComparativoDaAta("ata1"));

    const silenciar = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      dobles.itemFindMany.mockRejectedValue(new Error("banco fora do ar"));
      await expect(carregarComparativoOuNulo("ata1")).resolves.toBeNull();
      expect(silenciar).toHaveBeenCalledTimes(1);
      // A versão sem "OuNulo" deixa o erro subir: quem a usa (admin) decide o que mostrar.
      await expect(carregarComparativoDaAta("ata1")).rejects.toThrow("banco fora do ar");
    } finally {
      silenciar.mockRestore();
    }
  });

  it("o aviso padrão existe e fala do art. 23 e da responsabilidade do órgão (a tela o exibe junto dos números)", () => {
    expect(TEXTO_AVISO_VANTAJOSIDADE).toContain("art. 23");
    expect(TEXTO_AVISO_VANTAJOSIDADE).toContain("responsabilidade do órgão aderente");
  });
});
