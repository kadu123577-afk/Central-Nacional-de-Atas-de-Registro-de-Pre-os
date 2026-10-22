import { describe, expect, it } from "vitest";
import {
  AMOSTRA_MINIMA,
  TEXTO_AVISO_VANTAJOSIDADE,
  arredondar2,
  classificarPreco,
  estatisticasDePrecos,
  formatarReais,
  resumirAta,
  type AmostraPreco,
  type EstatisticasPrecos,
  type SituacaoPreco,
} from "./vantajosidade";

const amostras = (...valores: number[]): AmostraPreco[] => valores.map((valorUnitario) => ({ valorUnitario }));

/** Monta uma referência à mão, sem passar pelo cálculo (para testar só a classificação). */
function ref(p25: number, mediana: number, p75: number, nUsadas = 10): EstatisticasPrecos {
  return { n: nUsadas, nUsadas, minimo: p25 * 0.5, p25, mediana, p75, maximo: p75 * 2, media: mediana };
}

/** 5 preços: p25 = 95, mediana = 100, p75 = 105 (conferido à mão abaixo). */
const REF_JUSTA = estatisticasDePrecos(amostras(90, 95, 100, 105, 110))!;

describe("estatisticasDePrecos: percentis conferidos à mão", () => {
  it("5 valores: posições exatas (interpolação cai em cima de um valor)", () => {
    // posições: p25 = 0,25 x 4 = 1 -> 20; mediana = 2 -> 30; p75 = 3 -> 40
    const e = estatisticasDePrecos(amostras(50, 10, 30, 20, 40))!;
    expect(e).toEqual({ n: 5, nUsadas: 5, minimo: 10, p25: 20, mediana: 30, p75: 40, maximo: 50, media: 30 });
  });

  it("4 valores: interpolação linear entre vizinhos", () => {
    // p25: 0,25 x 3 = 0,75 -> 10 + 0,75 x 10 = 17,5; mediana: 1,5 -> 25; p75: 2,25 -> 30 + 0,25 x 10 = 32,5
    const e = estatisticasDePrecos(amostras(10, 20, 30, 40))!;
    expect(e.p25).toBeCloseTo(17.5, 10);
    expect(e.mediana).toBeCloseTo(25, 10);
    expect(e.p75).toBeCloseTo(32.5, 10);
    expect(e.media).toBeCloseTo(25, 10);
  });

  it("2 valores e 1 valor (n pequeno ainda calcula; a confiança é decidida na classificação)", () => {
    // 2 valores: p25 = 0,25 -> 12,5; mediana 15; p75 = 0,75 -> 17,5
    const dois = estatisticasDePrecos(amostras(10, 20))!;
    expect([dois.p25, dois.mediana, dois.p75]).toEqual([12.5, 15, 17.5]);
    const um = estatisticasDePrecos(amostras(7))!;
    expect(um).toEqual({ n: 1, nUsadas: 1, minimo: 7, p25: 7, mediana: 7, p75: 7, maximo: 7, media: 7 });
  });

  it("não arredonda no cálculo: arredondar2 é só da apresentação", () => {
    const e = estatisticasDePrecos(amostras(1 / 3, 1 / 3, 1 / 3))!;
    expect(e.mediana).toBe(1 / 3);
    expect(e.mediana).not.toBe(0.33);
    expect(arredondar2(e.mediana)).toBe(0.33);
  });

  it("não altera a lista recebida", () => {
    const entrada = amostras(30, 10, 20);
    estatisticasDePrecos(entrada);
    expect(entrada.map((a) => a.valorUnitario)).toEqual([30, 10, 20]);
  });

  it("amostras vazias ou que não são lista => null", () => {
    expect(estatisticasDePrecos([])).toBeNull();
    expect(estatisticasDePrecos(undefined as unknown as AmostraPreco[])).toBeNull();
    expect(estatisticasDePrecos(null as unknown as AmostraPreco[])).toBeNull();
  });
});

describe("estatisticasDePrecos: valores sujos", () => {
  it("descarta NaN, negativos, zero, Infinity, string numérica e itens nulos", () => {
    const sujas = [
      { valorUnitario: Number.NaN },
      { valorUnitario: -5 },
      { valorUnitario: 0 },
      { valorUnitario: Infinity },
      { valorUnitario: -Infinity },
      { valorUnitario: "12.5" as unknown as number },
      null as unknown as AmostraPreco,
      {} as unknown as AmostraPreco,
      { valorUnitario: 10 },
      { valorUnitario: 20 },
    ];
    const e = estatisticasDePrecos(sujas)!;
    expect(e.n).toBe(10);
    expect(e.nUsadas).toBe(2);
    expect(e.mediana).toBe(15);
  });

  it("só dado inválido => null", () => {
    expect(estatisticasDePrecos(amostras(Number.NaN, -1, 0, Infinity))).toBeNull();
  });
});

describe("estatisticasDePrecos: outliers (1,5 x IQR, só com 8 ou mais valores)", () => {
  // Ordenado: 8 9 10 10 11 11 12 12 13 200 (10 valores).
  // Q1: posição 0,25 x 9 = 2,25 -> 10 (vizinhos iguais); Q3: 6,75 -> 12; IQR = 2.
  // Limites: 10 - 3 = 7 e 12 + 3 = 15 -> o 200 sai; os outros 9 ficam.
  const comOutlierAlto = amostras(11, 200, 9, 10, 12, 8, 13, 10, 11, 12);

  it("descarta outlier alto e recalcula sobre o que sobrou", () => {
    const e = estatisticasDePrecos(comOutlierAlto)!;
    expect(e.n).toBe(10);
    expect(e.nUsadas).toBe(9);
    // 9 valores restantes: 8 9 10 10 11 11 12 12 13 -> p25 pos 2 = 10; mediana pos 4 = 11; p75 pos 6 = 12
    expect([e.minimo, e.p25, e.mediana, e.p75, e.maximo]).toEqual([8, 10, 11, 12, 13]);
    expect(e.media).toBeCloseTo(96 / 9, 10);
  });

  it("sem descarte (opção) mantém o outlier e muda máximo e média", () => {
    const e = estatisticasDePrecos(comOutlierAlto, { descartarOutliers: false })!;
    expect(e.nUsadas).toBe(10);
    expect(e.maximo).toBe(200);
    expect(e.media).toBeCloseTo(29.6, 10); // 296 / 10
    expect(e.mediana).toBe(11); // pos 4,5 entre 11 e 11
  });

  it("descarta outlier baixo", () => {
    // Ordenado: 1 50 52 54 55 56 58 60 61 62. Q1: pos 2,25 -> 52 + 0,25 x 2 = 52,5; Q3: pos 6,75 -> 58 + 0,75 x 2 = 59,5
    // IQR = 7; limites: 52,5 - 10,5 = 42 e 59,5 + 10,5 = 70 -> só o 1 sai.
    const e = estatisticasDePrecos(amostras(62, 1, 50, 52, 54, 55, 56, 58, 60, 61))!;
    expect(e.nUsadas).toBe(9);
    expect(e.minimo).toBe(50);
    expect(e.maximo).toBe(62);
  });

  it("com menos de 8 valores válidos não descarta nada", () => {
    const e = estatisticasDePrecos(amostras(10, 11, 12, 13, 14, 15, 500))!;
    expect(e.n).toBe(7);
    expect(e.nUsadas).toBe(7);
    expect(e.maximo).toBe(500);
  });

  it("com exatamente 8 valores já descarta", () => {
    // Ordenado: 10 10 11 11 12 12 13 100. Q1: pos 1,75 -> 10,75; Q3: pos 5,25 -> 12,25; IQR = 1,5 -> limite superior 14,5.
    const e = estatisticasDePrecos(amostras(100, 10, 10, 11, 11, 12, 12, 13))!;
    expect(e.nUsadas).toBe(7);
    expect(e.maximo).toBe(13);
  });

  it("o limite é inclusivo: exatamente no limite fica, um centavo além sai", () => {
    // 10 10 10 15 15 20 20 20 + X: Q1 = 10, Q3 = 20, IQR = 10 -> limite superior = 35.
    const base = [10, 10, 10, 15, 15, 20, 20, 20];
    const noLimite = estatisticasDePrecos(amostras(...base, 35))!;
    expect(noLimite.nUsadas).toBe(9);
    expect(noLimite.maximo).toBe(35);
    const alemDoLimite = estatisticasDePrecos(amostras(...base, 35.01))!;
    expect(alemDoLimite.nUsadas).toBe(8);
    expect(alemDoLimite.maximo).toBe(20);
  });

  it("quartis do IQR sem empates: limite superior exato fica, um centavo além sai", () => {
    // 10 12 14 16 18 20 22 24 + X (9 valores): Q1 = posição 2 = 14; Q3 = posição 6 = 22; IQR = 8.
    // Limite superior = 22 + 1,5 x 8 = 34. (Com outros percentis no lugar de Q1/Q3 o limite subiria
    // para mais de 35 e o 34,01 ficaria: este caso fixa que são mesmo o 25% e o 75%.)
    const base = [10, 12, 14, 16, 18, 20, 22, 24];
    const noLimite = estatisticasDePrecos(amostras(...base, 34))!;
    expect(noLimite.nUsadas).toBe(9);
    expect(noLimite.maximo).toBe(34);
    const alemDoLimite = estatisticasDePrecos(amostras(...base, 34.01))!;
    expect(alemDoLimite.nUsadas).toBe(8);
    expect(alemDoLimite.maximo).toBe(24);
  });

  it("limite inferior também é inclusivo: exatamente no limite fica, um centavo aquém sai", () => {
    // X + 20 22 24 26 28 30 32 34 (9 valores): Q1 = posição 2 = 22; Q3 = posição 6 = 30; IQR = 8.
    // Limite inferior = 22 - 1,5 x 8 = 10.
    const base = [20, 22, 24, 26, 28, 30, 32, 34];
    const noLimite = estatisticasDePrecos(amostras(10, ...base))!;
    expect(noLimite.nUsadas).toBe(9);
    expect(noLimite.minimo).toBe(10);
    const aquemDoLimite = estatisticasDePrecos(amostras(9.99, ...base))!;
    expect(aquemDoLimite.nUsadas).toBe(8);
    expect(aquemDoLimite.minimo).toBe(20);
  });

  it("valores inválidos não contam para chegar nos 8 valores", () => {
    // 7 válidos + 3 inválidos: não chega a 8 válidos, então o 500 fica.
    const e = estatisticasDePrecos([
      ...amostras(10, 11, 12, 13, 14, 15, 500),
      ...amostras(Number.NaN, -1, 0),
    ])!;
    expect(e.n).toBe(10);
    expect(e.nUsadas).toBe(7);
    expect(e.maximo).toBe(500);
  });
});

describe("classificarPreco: situação", () => {
  it("referência usada nos testes: p25 95, mediana 100, p75 105", () => {
    expect([REF_JUSTA.p25, REF_JUSTA.mediana, REF_JUSTA.p75]).toEqual([95, 100, 105]);
  });

  it("dentro de p25 e p75 => compatível; exatamente em p25 e p75 também", () => {
    expect(classificarPreco({ precoAta: 100, referencia: REF_JUSTA }).situacao).toBe("compativel");
    expect(classificarPreco({ precoAta: 95, referencia: REF_JUSTA }).situacao).toBe("compativel");
    expect(classificarPreco({ precoAta: 105, referencia: REF_JUSTA }).situacao).toBe("compativel");
  });

  it("fora da faixa mas a até 10% da mediana => compatível (tolerância)", () => {
    expect(classificarPreco({ precoAta: 94, referencia: REF_JUSTA }).situacao).toBe("compativel");
    expect(classificarPreco({ precoAta: 108, referencia: REF_JUSTA }).situacao).toBe("compativel");
  });

  it("borda de exatamente 10% da mediana => compatível; um pouco além => abaixo/acima", () => {
    const acima10 = classificarPreco({ precoAta: 110, referencia: REF_JUSTA });
    expect(acima10.situacao).toBe("compativel");
    expect(acima10.diferencaPercentual).toBeCloseTo(10, 10);
    const abaixo10 = classificarPreco({ precoAta: 90, referencia: REF_JUSTA });
    expect(abaixo10.situacao).toBe("compativel");
    expect(abaixo10.diferencaPercentual).toBeCloseTo(-10, 10);

    expect(classificarPreco({ precoAta: 110.01, referencia: REF_JUSTA }).situacao).toBe("acima");
    expect(classificarPreco({ precoAta: 89.99, referencia: REF_JUSTA }).situacao).toBe("abaixo");
  });

  it("a borda de 10% não depende de ponto flutuante (1,1 contra 1,0 dá 0,10000000000000009)", () => {
    const um = ref(1, 1, 1);
    expect(classificarPreco({ precoAta: 1.1, referencia: um }).situacao).toBe("compativel");
    expect(classificarPreco({ precoAta: 0.9, referencia: um }).situacao).toBe("compativel");
    expect(classificarPreco({ precoAta: 1.11, referencia: um }).situacao).toBe("acima");
    expect(classificarPreco({ precoAta: 0.89, referencia: um }).situacao).toBe("abaixo");
  });

  it("faixa larga: dentro de p25 e p75 é compatível mesmo a mais de 10% da mediana", () => {
    // Preços 50 70 100 130 150: p25 = 70, mediana = 100, p75 = 130.
    const larga = estatisticasDePrecos(amostras(50, 70, 100, 130, 150))!;
    expect([larga.p25, larga.mediana, larga.p75]).toEqual([70, 100, 130]);
    expect(classificarPreco({ precoAta: 125, referencia: larga }).situacao).toBe("compativel");
    expect(classificarPreco({ precoAta: 130, referencia: larga }).situacao).toBe("compativel");
    expect(classificarPreco({ precoAta: 70, referencia: larga }).situacao).toBe("compativel");
    expect(classificarPreco({ precoAta: 130.01, referencia: larga }).situacao).toBe("acima");
    expect(classificarPreco({ precoAta: 69.99, referencia: larga }).situacao).toBe("abaixo");
  });

  it("acima e abaixo trazem a diferença em % sobre a mediana (negativo = mais barato)", () => {
    const acima = classificarPreco({ precoAta: 150, referencia: REF_JUSTA });
    expect(acima.situacao).toBe("acima");
    expect(acima.diferencaPercentual).toBeCloseTo(50, 10);
    const abaixo = classificarPreco({ precoAta: 60, referencia: REF_JUSTA });
    expect(abaixo.situacao).toBe("abaixo");
    expect(abaixo.diferencaPercentual).toBeCloseTo(-40, 10);
  });

  it("a comparação é com a MEDIANA, não com a média (referência assimétrica)", () => {
    // Mediana 100, média 130 (puxada por preços altos): 108 está 8% acima da mediana.
    const assimetrica: EstatisticasPrecos = { ...ref(95, 100, 105), media: 130 };
    const a = classificarPreco({ precoAta: 108, referencia: assimetrica });
    expect(a.situacao).toBe("compativel");
    expect(a.diferencaPercentual).toBeCloseTo(8, 10);
    const b = classificarPreco({ precoAta: 112, referencia: assimetrica });
    expect(b.situacao).toBe("acima");
    expect(b.diferencaPercentual).toBeCloseTo(12, 10);
  });

  it("do cálculo à classificação, com preços desiguais (mediana 13, média 19,29)", () => {
    // 10 11 12 13 14 15 60 (7 valores, nada descartado): p25 = 11,5; mediana = 13; p75 = 14,5.
    const e = estatisticasDePrecos(amostras(10, 11, 12, 13, 14, 15, 60))!;
    expect([e.p25, e.mediana, e.p75]).toEqual([11.5, 13, 14.5]);
    expect(e.media).toBeCloseTo(135 / 7, 10);
    // 15 passa do p75 e está 2/13 = 15,38% acima da mediana (contra a média, seria 22% abaixo).
    const r = classificarPreco({ precoAta: 15, referencia: e });
    expect(r.situacao).toBe("acima");
    expect(r.diferencaPercentual).toBeCloseTo((2 / 13) * 100, 10);
  });

  it("a diferença não é arredondada", () => {
    const r = classificarPreco({ precoAta: 133.33, referencia: REF_JUSTA });
    expect(r.diferencaPercentual).toBeCloseTo(33.33, 10);
  });
});

describe("classificarPreco: sem base para comparar", () => {
  it("amostra com menos de 5 preços usados => amostra_insuficiente, sem percentual", () => {
    const r = classificarPreco({ precoAta: 100, referencia: ref(95, 100, 105, AMOSTRA_MINIMA - 1) });
    expect(r.situacao).toBe("amostra_insuficiente");
    expect(r.diferencaPercentual).toBeNull();
    expect(r.explicacao).toContain(String(AMOSTRA_MINIMA - 1));
    expect(r.explicacao).toContain(String(AMOSTRA_MINIMA));
  });

  it("exatamente 5 preços usados já compara", () => {
    expect(AMOSTRA_MINIMA).toBe(5);
    expect(classificarPreco({ precoAta: 100, referencia: ref(95, 100, 105, 5) }).situacao).toBe("compativel");
  });

  it("vale o número de preços USADOS, não o recebido", () => {
    const r = classificarPreco({ precoAta: 100, referencia: { ...ref(95, 100, 105, 3), n: 50 } });
    expect(r.situacao).toBe("amostra_insuficiente");
  });

  it("sem referência (null ou undefined) => sem_referencia", () => {
    for (const referencia of [null, undefined]) {
      const r = classificarPreco({ precoAta: 100, referencia });
      expect(r.situacao).toBe("sem_referencia");
      expect(r.diferencaPercentual).toBeNull();
      expect(r.explicacao).toMatch(/CATMAT/);
    }
  });

  it("preço da ata inválido => sem_referencia com explicação clara", () => {
    for (const precoAta of [0, -1, Number.NaN, Infinity, "100" as unknown as number, undefined as unknown as number]) {
      const r = classificarPreco({ precoAta, referencia: REF_JUSTA });
      expect(r.situacao).toBe("sem_referencia");
      expect(r.diferencaPercentual).toBeNull();
      expect(r.explicacao).toMatch(/preço da ata não é válido/);
    }
  });

  it("número de preços usados ausente ou inválido => sem_referencia, sem 'NaN' no texto", () => {
    for (const nUsadas of [Number.NaN, Infinity, undefined as unknown as number, "10" as unknown as number]) {
      const r = classificarPreco({ precoAta: 100, referencia: { ...ref(95, 100, 105), nUsadas } });
      expect(r.situacao).toBe("sem_referencia");
      expect(r.diferencaPercentual).toBeNull();
      expect(r.explicacao).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("referência incoerente (mediana zero, NaN, fora de p25..p75) => sem_referencia", () => {
    const incoerentes = [
      ref(0, 0, 0),
      ref(95, Number.NaN, 105),
      ref(105, 100, 95), // p25 maior que p75
      ref(95, 90, 105), // mediana abaixo do p25
      ref(95, 110, 105), // mediana acima do p75
    ];
    for (const referencia of incoerentes) {
      const r = classificarPreco({ precoAta: 100, referencia });
      expect(r.situacao).toBe("sem_referencia");
      expect(r.diferencaPercentual).toBeNull();
    }
  });
});

describe("resumirAta", () => {
  const item = (precoAta: number, quantidade: number, referencia: EstatisticasPrecos | null) => ({
    descricao: "Item de teste",
    precoAta,
    quantidade,
    referencia,
  });

  it("conta por situação e pesa o valor (preço x quantidade) dos itens com referência", () => {
    const itens = [
      item(100, 10, REF_JUSTA), // compatível, valor 1.000
      item(200, 5, REF_JUSTA), // acima, valor 1.000
      item(50, 20, REF_JUSTA), // abaixo, valor 1.000
      item(300, 2, null), // sem referência (fora do peso)
      item(100, 1, ref(95, 100, 105, 3)), // amostra insuficiente (fora do peso)
      item(-1, 1, REF_JUSTA), // preço inválido (fora do peso)
    ];
    const r = resumirAta(itens);
    expect(r).toMatchObject({
      itensTotal: 6,
      itensComReferencia: 3,
      acima: 1,
      abaixo: 1,
      compativeis: 1,
      semReferencia: 3,
    });
    expect(r.pesoAcima).toBeCloseTo((1000 / 3000) * 100, 10);
  });

  it("o peso depende do valor, não da quantidade de itens", () => {
    const itens = [
      item(100, 10, REF_JUSTA), // compatível, 1.000
      item(200, 20, REF_JUSTA), // acima, 4.000
      item(50, 20, REF_JUSTA), // abaixo, 1.000
    ];
    const r = resumirAta(itens);
    expect(r.acima).toBe(1);
    expect(r.pesoAcima).toBeCloseTo((4000 / 6000) * 100, 10);
  });

  it("tudo compatível => peso 0; tudo acima => peso 100", () => {
    expect(resumirAta([item(100, 3, REF_JUSTA), item(101, 4, REF_JUSTA)]).pesoAcima).toBe(0);
    expect(resumirAta([item(200, 3, REF_JUSTA), item(300, 4, REF_JUSTA)]).pesoAcima).toBe(100);
  });

  it("sem itens, ou nenhum com referência utilizável => zeros e peso nulo", () => {
    expect(resumirAta([])).toEqual({
      itensComReferencia: 0,
      itensTotal: 0,
      acima: 0,
      abaixo: 0,
      compativeis: 0,
      semReferencia: 0,
      pesoAcima: null,
    });
    const r = resumirAta([item(10, 1, null), item(10, 1, ref(1, 10, 20, 2))]);
    expect(r.itensTotal).toBe(2);
    expect(r.itensComReferencia).toBe(0);
    expect(r.semReferencia).toBe(2);
    expect(r.pesoAcima).toBeNull();
  });

  it("quantidade inválida pesa zero, mas o item continua contado", () => {
    const r = resumirAta([
      item(200, Number.NaN, REF_JUSTA), // acima, sem peso
      item(200, 0, REF_JUSTA), // acima, sem peso
      item(100, 10, REF_JUSTA), // compatível, 1.000
    ]);
    expect(r.acima).toBe(2);
    expect(r.itensComReferencia).toBe(3);
    expect(r.pesoAcima).toBe(0);
    // Se só sobra quantidade inválida, não há valor para basear o percentual.
    expect(resumirAta([item(200, 0, REF_JUSTA)]).pesoAcima).toBeNull();
  });
});

describe("apresentação", () => {
  it("arredondar2: duas casas, simétrico para negativos, não mexe em não finitos", () => {
    expect(arredondar2(1.234)).toBe(1.23);
    expect(arredondar2(1.236)).toBe(1.24);
    expect(arredondar2(1.005)).toBe(1.01);
    expect(arredondar2(-1.236)).toBe(-1.24);
    // Negativo minúsculo vira 0 (e não -0, que o Intl mostraria como "-0").
    expect(Object.is(arredondar2(-0.001), 0)).toBe(true);
    expect(arredondar2(Number.NaN)).toBeNaN();
    expect(arredondar2(Infinity)).toBe(Infinity);
  });

  it("formatarReais: 2 casas, e 4 casas só para valor positivo menor que meio centavo", () => {
    const norm = (s: string) => s.replace(/\s/g, " ");
    expect(norm(formatarReais(1234.5))).toBe("R$ 1.234,50");
    expect(norm(formatarReais(0.01))).toBe("R$ 0,01");
    expect(norm(formatarReais(0.004))).toBe("R$ 0,0040");
  });
});

describe("textos: linguagem cuidadosa", () => {
  const PROIBIDAS = [/garantid/i, /sem licita/i, /comprovad/i, /vantajos/i];

  /** Uma explicação de cada situação possível. */
  function todasAsExplicacoes(): Record<SituacaoPreco, string> {
    return {
      compativel: classificarPreco({ precoAta: 100, referencia: REF_JUSTA }).explicacao,
      abaixo: classificarPreco({ precoAta: 50, referencia: REF_JUSTA }).explicacao,
      acima: classificarPreco({ precoAta: 200, referencia: REF_JUSTA }).explicacao,
      amostra_insuficiente: classificarPreco({ precoAta: 100, referencia: ref(95, 100, 105, 2) }).explicacao,
      sem_referencia: classificarPreco({ precoAta: 100, referencia: null }).explicacao,
    };
  }

  it("cada situação devolve a explicação esperada", () => {
    const e = todasAsExplicacoes();
    expect(e.compativel).toContain("compatível com os preços consultados");
    expect(e.abaixo).toContain("abaixo dos preços consultados");
    expect(e.acima).toContain("acima dos preços consultados");
    expect(e.amostra_insuficiente).toContain("poucos preços");
    expect(e.sem_referencia).toContain("Não há preços consultados");
  });

  it("nenhum texto usa palavra que prometa ou afirme vantagem", () => {
    const textos = [
      TEXTO_AVISO_VANTAJOSIDADE,
      ...Object.values(todasAsExplicacoes()),
      classificarPreco({ precoAta: -1, referencia: REF_JUSTA }).explicacao,
      classificarPreco({ precoAta: 100, referencia: ref(95, 90, 105) }).explicacao,
      classificarPreco({ precoAta: 100.0001, referencia: ref(1, 1, 1) }).explicacao,
      classificarPreco({ precoAta: 0.001, referencia: ref(0.004, 0.004, 0.004) }).explicacao,
    ];
    for (const texto of textos) {
      for (const proibida of PROIBIDAS) {
        expect(texto, `texto: ${texto}`).not.toMatch(proibida);
      }
    }
  });

  it("o aviso é o texto combinado e cita o art. 23 e a responsabilidade do órgão", () => {
    expect(TEXTO_AVISO_VANTAJOSIDADE).toBe(
      "Comparativo auxiliar, feito com preços de contratações públicas do Compras.gov.br. Não substitui a pesquisa de preços do órgão (Lei 14.133/2021, art. 23), que é de responsabilidade do órgão aderente.",
    );
  });

  it("as explicações com valores mostram reais em português e 1 casa no percentual", () => {
    const { explicacao } = classificarPreco({ precoAta: 200, referencia: REF_JUSTA });
    expect(explicacao).toMatch(/R\$\s200,00/);
    expect(explicacao).toMatch(/100,0% mais que a mediana/);
    expect(explicacao).toMatch(/R\$\s100,00/);
  });
});
