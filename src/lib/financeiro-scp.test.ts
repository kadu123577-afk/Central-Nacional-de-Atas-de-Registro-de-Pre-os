import { describe, expect, it } from "vitest";
import {
  apurarPeriodo,
  apurarPorFaixas,
  centavosParaDecimal,
  dataNoPeriodo,
  diaEmSaoPaulo,
  faixasDoPeriodo,
  formatarReais,
  fracaoParaDecimal,
  hojeEmSaoPaulo,
  interpretarPercentualParticipacao,
  interpretarReais,
  participacoesVigentesEm,
  periodoDeDias,
  periodoDeTextos,
  periodoMensal,
  periodoMensalDeTexto,
  receitaDeLiquidacao,
  receitaRecebidaNoPeriodo,
  reaisParaCentavos,
  situacaoDoResultado,
  somarReceitaRecebida,
  tipoSocioValido,
  validarParticipacoes,
  validarParticipacoesDoPeriodo,
  validarSemSobreposicao,
  type Lancamento,
  type ParticipacaoPercentual,
  type ParticipacaoVigencia,
} from "./financeiro-scp";

/**
 * Regras puras do financeiro da SCP. REGRA DE OURO: só dados claramente
 * fictícios ("Sócio A", "Sócio B", 60% e 40% inventados para o teste); nada
 * aqui reflete a partilha, os sócios ou os valores reais.
 */

const A = "socio-a";
const B = "socio-b";
const C = "socio-c";

const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);
const iso = (data: Date) => data.toISOString().slice(0, 10);

const SESSENTA_QUARENTA: ParticipacaoPercentual[] = [
  { socioId: A, percentual: 0.6 },
  { socioId: B, percentual: 0.4 },
];
const TRES_PARTES: ParticipacaoPercentual[] = [
  { socioId: A, percentual: 0.3333 },
  { socioId: B, percentual: 0.3333 },
  { socioId: C, percentual: 0.3334 },
];

function vigencia(
  socioId: string,
  percentual: number,
  desde: string,
  ate: string | null = null,
): ParticipacaoVigencia {
  return { socioId, percentual, vigenteDesde: dia(desde), vigenteAte: ate ? dia(ate) : null };
}

function soma(partes: { centavos: number }[]): number {
  return partes.reduce((s, p) => s + p.centavos, 0);
}

function erroDe(r: { ok: boolean; erro?: string }): string {
  expect(r.ok).toBe(false);
  return r.erro ?? "";
}

// ───────────────────────────── vocabulário ─────────────────────────────

describe("tipoSocioValido", () => {
  it("aceita só os dois tipos do vocabulário", () => {
    expect(tipoSocioValido("ostensivo")).toBe(true);
    expect(tipoSocioValido("participante")).toBe(true);
    expect(tipoSocioValido("Ostensivo")).toBe(false);
    expect(tipoSocioValido("")).toBe(false);
    expect(tipoSocioValido("sócio")).toBe(false);
  });
});

// ───────────────────────────── validarParticipacoes ─────────────────────────────

describe("validarParticipacoes", () => {
  it("aceita 60% e 40%", () => {
    expect(validarParticipacoes(SESSENTA_QUARENTA)).toEqual({ ok: true });
  });

  it("aceita 33,33% + 33,33% + 33,34% (a soma em ponto flutuante não atrapalha)", () => {
    expect(validarParticipacoes(TRES_PARTES)).toEqual({ ok: true });
  });

  it("aceita um único sócio com 100%", () => {
    expect(validarParticipacoes([{ socioId: A, percentual: 1 }])).toEqual({ ok: true });
  });

  it("recusa lista vazia, nula ou que não é lista", () => {
    expect(erroDe(validarParticipacoes([]))).toMatch(/ao menos um sócio/i);
    expect(validarParticipacoes(null as unknown as ParticipacaoPercentual[]).ok).toBe(false);
    expect(validarParticipacoes(undefined as unknown as ParticipacaoPercentual[]).ok).toBe(false);
    expect(validarParticipacoes("60/40" as unknown as ParticipacaoPercentual[]).ok).toBe(false);
  });

  it("recusa soma abaixo ou acima de 100% e diz quanto está somando", () => {
    expect(
      erroDe(
        validarParticipacoes([
          { socioId: A, percentual: 0.6 },
          { socioId: B, percentual: 0.3 },
        ]),
      ),
    ).toMatch(/90%/);
    expect(
      erroDe(
        validarParticipacoes([
          { socioId: A, percentual: 0.6 },
          { socioId: B, percentual: 0.5 },
        ]),
      ),
    ).toMatch(/110%/);
  });

  it("mostra a soma com casas suficientes quando o erro é minúsculo", () => {
    const erro = erroDe(
      validarParticipacoes([
        { socioId: A, percentual: 0.6 },
        { socioId: B, percentual: 0.39999 },
      ]),
    );
    expect(erro).toMatch(/99,999%/);
  });

  it("tolera até 1e-9 de diferença na soma, e nem um pouco mais", () => {
    expect(
      validarParticipacoes([
        { socioId: A, percentual: 0.5 },
        { socioId: B, percentual: 0.5 + 5e-10 },
      ]).ok,
    ).toBe(true);
    expect(
      validarParticipacoes([
        { socioId: A, percentual: 0.5 },
        { socioId: B, percentual: 0.5 + 2e-9 },
      ]).ok,
    ).toBe(false);
  });

  it("recusa percentual zero, negativo ou acima de 100%", () => {
    expect(validarParticipacoes([{ socioId: A, percentual: 0 }, { socioId: B, percentual: 1 }]).ok).toBe(false);
    expect(validarParticipacoes([{ socioId: A, percentual: -0.2 }, { socioId: B, percentual: 1.2 }]).ok).toBe(false);
    expect(validarParticipacoes([{ socioId: A, percentual: 1.0001 }]).ok).toBe(false);
    // o motivo apontado é o percentual (não só a soma)
    expect(erroDe(validarParticipacoes([{ socioId: A, percentual: 1.0001 }]))).toMatch(/maior que 0% e no máximo 100%/);
  });

  it("recusa percentual que não é número finito", () => {
    for (const ruim of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(
        validarParticipacoes([
          { socioId: A, percentual: ruim },
          { socioId: B, percentual: 0.5 },
        ]).ok,
      ).toBe(false);
    }
    // texto no lugar de número (a tela esqueceu de converter o Decimal)
    expect(
      validarParticipacoes([
        { socioId: A, percentual: "0.5" as unknown as number },
        { socioId: B, percentual: 0.5 },
      ]).ok,
    ).toBe(false);
  });

  it("recusa sócio repetido, mesmo que a soma feche", () => {
    expect(
      erroDe(
        validarParticipacoes([
          { socioId: A, percentual: 0.5 },
          { socioId: A, percentual: 0.5 },
        ]),
      ),
    ).toMatch(/mais de uma vez/);
  });

  it("recusa participação sem sócio ou com entrada nula", () => {
    expect(validarParticipacoes([{ socioId: "", percentual: 1 }]).ok).toBe(false);
    expect(validarParticipacoes([{ socioId: "  ", percentual: 1 }]).ok).toBe(false);
    expect(validarParticipacoes([null as unknown as ParticipacaoPercentual]).ok).toBe(false);
  });
});

// ───────────────────────────── participacoesVigentesEm ─────────────────────────────

describe("participacoesVigentesEm", () => {
  const linhas = [
    vigencia(A, 0.6, "2026-01-01", "2026-06-30"),
    vigencia(B, 0.4, "2026-01-01", "2026-06-30"),
    vigencia(A, 0.5, "2026-07-01"),
    vigencia(B, 0.5, "2026-07-01"),
  ];

  it("inclui o primeiro e o último dia da vigência", () => {
    expect(participacoesVigentesEm(dia("2026-01-01"), linhas)).toHaveLength(2);
    expect(participacoesVigentesEm(dia("2026-06-30"), linhas).map((p) => p.percentual)).toEqual([0.6, 0.4]);
    expect(participacoesVigentesEm(dia("2026-07-01"), linhas).map((p) => p.percentual)).toEqual([0.5, 0.5]);
  });

  it("não devolve nada antes de a primeira vigência começar", () => {
    expect(participacoesVigentesEm(dia("2025-12-31"), linhas)).toEqual([]);
  });

  it("vigência sem fim vale para sempre", () => {
    expect(participacoesVigentesEm(dia("2099-12-31"), linhas)).toHaveLength(2);
  });

  it("compara por dia: a hora da data consultada não derruba o último dia", () => {
    const tardeDoUltimoDia = new Date("2026-06-30T15:45:00.000Z");
    expect(participacoesVigentesEm(tardeDoUltimoDia, linhas).map((p) => p.percentual)).toEqual([0.6, 0.4]);
  });

  it("devolve os mesmos objetos recebidos", () => {
    expect(participacoesVigentesEm(dia("2026-03-01"), linhas)[0]).toBe(linhas[0]);
  });

  it("data inválida ou vigência com data inválida não entra", () => {
    expect(participacoesVigentesEm(new Date("lixo"), linhas)).toEqual([]);
    const quebrada = { ...vigencia(C, 1, "2026-01-01"), vigenteDesde: new Date("lixo") };
    expect(participacoesVigentesEm(dia("2026-03-01"), [quebrada])).toEqual([]);
  });

  it("lista vazia dá lista vazia", () => {
    expect(participacoesVigentesEm(dia("2026-03-01"), [])).toEqual([]);
  });
});

// ───────────────────────────── validarSemSobreposicao ─────────────────────────────

describe("validarSemSobreposicao", () => {
  it("aceita encerrar em um dia e abrir no dia seguinte", () => {
    expect(
      validarSemSobreposicao([vigencia(A, 0.6, "2026-01-01", "2026-06-30"), vigencia(A, 0.5, "2026-07-01")]).ok,
    ).toBe(true);
  });

  it("recusa o mesmo sócio com vigências que se sobrepõem (um dia de interseção já é erro)", () => {
    expect(
      erroDe(validarSemSobreposicao([vigencia(A, 0.6, "2026-01-01", "2026-07-01"), vigencia(A, 0.5, "2026-07-01")])),
    ).toMatch(/sobrepõem/);
  });

  it("recusa vigência em aberto seguida de outra do mesmo sócio", () => {
    expect(validarSemSobreposicao([vigencia(A, 0.6, "2026-01-01"), vigencia(A, 0.5, "2026-07-01")]).ok).toBe(false);
  });

  it("acha a sobreposição mesmo com as linhas fora de ordem e uma vigência dentro da outra", () => {
    expect(
      validarSemSobreposicao([
        vigencia(A, 0.5, "2026-03-01", "2026-03-31"),
        vigencia(A, 0.2, "2026-05-01", "2026-05-31"),
        vigencia(A, 0.3, "2026-01-01", "2026-12-31"),
      ]).ok,
    ).toBe(false);
  });

  it("sócios diferentes podem coincidir no tempo", () => {
    expect(validarSemSobreposicao([vigencia(A, 0.6, "2026-01-01"), vigencia(B, 0.4, "2026-01-01")]).ok).toBe(true);
  });

  it("lista vazia não tem sobreposição", () => {
    expect(validarSemSobreposicao([]).ok).toBe(true);
  });

  it("recusa vigência que termina antes de começar e data inválida", () => {
    expect(validarSemSobreposicao([vigencia(A, 1, "2026-07-01", "2026-06-30")]).ok).toBe(false);
    expect(validarSemSobreposicao([{ ...vigencia(A, 1, "2026-01-01"), vigenteDesde: new Date("lixo") }]).ok).toBe(false);
    expect(validarSemSobreposicao([{ ...vigencia(A, 1, "2026-01-01"), vigenteAte: new Date("lixo") }]).ok).toBe(false);
  });
});

// ───────────────────────────── apurarPeriodo ─────────────────────────────

describe("apurarPeriodo", () => {
  it("resultado = receitas - despesas, partilhado 60/40", () => {
    const r = apurarPeriodo({ receitasCentavos: 150_000, despesasCentavos: 50_000, participacoes: SESSENTA_QUARENTA });
    expect(r.resultadoCentavos).toBe(100_000);
    expect(r.partilha).toEqual([
      { socioId: A, centavos: 60_000 },
      { socioId: B, centavos: 40_000 },
    ]);
  });

  it("resultado ímpar 60/40: o centavo que sobra vai a quem tem o maior resto, e a soma fecha", () => {
    const r = apurarPeriodo({ receitasCentavos: 10_001, despesasCentavos: 0, participacoes: SESSENTA_QUARENTA });
    // 6000,6 e 4000,4: o 0,6 é o maior resto.
    expect(r.partilha).toEqual([
      { socioId: A, centavos: 6_001 },
      { socioId: B, centavos: 4_000 },
    ]);
    expect(soma(r.partilha)).toBe(10_001);
  });

  it("resultado de 1 centavo vai inteiro a quem tem o maior resto", () => {
    expect(
      apurarPeriodo({ receitasCentavos: 1, despesasCentavos: 0, participacoes: SESSENTA_QUARENTA }).partilha,
    ).toEqual([
      { socioId: A, centavos: 1 },
      { socioId: B, centavos: 0 },
    ]);
  });

  it("33,33 / 33,33 / 33,34 em R$ 1,00: o centavo que falta vai ao de 33,34", () => {
    const r = apurarPeriodo({ receitasCentavos: 100, despesasCentavos: 0, participacoes: TRES_PARTES });
    expect(r.partilha.map((p) => p.centavos)).toEqual([33, 33, 34]);
  });

  it("33,33 / 33,33 / 33,34 com 1 e 2 centavos: empate de resto desempata pela ordem recebida", () => {
    expect(
      apurarPeriodo({ receitasCentavos: 1, despesasCentavos: 0, participacoes: TRES_PARTES }).partilha.map(
        (p) => p.centavos,
      ),
    ).toEqual([0, 0, 1]);
    expect(
      apurarPeriodo({ receitasCentavos: 2, despesasCentavos: 0, participacoes: TRES_PARTES }).partilha.map(
        (p) => p.centavos,
      ),
    ).toEqual([1, 0, 1]);
  });

  it("empate de resto entre sócios de percentuais diferentes: o centavo vai ao MAIOR percentual, em qualquer ordem", () => {
    // 0,01% / 0,03% / 99,96% de 5000 centavos: as cotas são 0,5 / 1,5 / 4998 e falta 1 centavo.
    // Os restos de A e B empatam em 0,5; o desempate é o maior percentual (B), não a ordem recebida.
    const a = { socioId: A, percentual: 0.0001 };
    const b = { socioId: B, percentual: 0.0003 };
    const c = { socioId: C, percentual: 0.9996 };

    const aBC = apurarPeriodo({ receitasCentavos: 5_000, despesasCentavos: 0, participacoes: [a, b, c] });
    expect(aBC.partilha.map((p) => p.centavos)).toEqual([0, 2, 4_998]);

    const bAC = apurarPeriodo({ receitasCentavos: 5_000, despesasCentavos: 0, participacoes: [b, a, c] });
    expect(bAC.partilha.map((p) => p.centavos)).toEqual([2, 0, 4_998]);
  });

  it("33,33 / 33,33 / 33,34 num resultado ímpar grande", () => {
    const r = apurarPeriodo({ receitasCentavos: 99_999, despesasCentavos: 0, participacoes: TRES_PARTES });
    expect(r.partilha.map((p) => p.centavos)).toEqual([33_330, 33_330, 33_339]);
    expect(soma(r.partilha)).toBe(99_999);
  });

  it("prejuízo: o resultado fica negativo e se reparte pelos mesmos percentuais", () => {
    const r = apurarPeriodo({ receitasCentavos: 5_000, despesasCentavos: 12_001, participacoes: SESSENTA_QUARENTA });
    expect(r.resultadoCentavos).toBe(-7_001);
    expect(r.partilha).toEqual([
      { socioId: A, centavos: -4_201 },
      { socioId: B, centavos: -2_800 },
    ]);
    expect(soma(r.partilha)).toBe(-7_001);
    expect(situacaoDoResultado(r.resultadoCentavos)).toBe("prejuizo");
  });

  it("prejuízo ímpar em três partes também fecha", () => {
    const r = apurarPeriodo({ receitasCentavos: 0, despesasCentavos: 100_001, participacoes: TRES_PARTES });
    expect(soma(r.partilha)).toBe(-100_001);
    expect(r.partilha.every((p) => p.centavos < 0)).toBe(true);
  });

  it("resultado zero: cada sócio fica com 0 (nunca zero negativo)", () => {
    const r = apurarPeriodo({ receitasCentavos: 7_000, despesasCentavos: 7_000, participacoes: SESSENTA_QUARENTA });
    expect(r.resultadoCentavos).toBe(0);
    expect(r.partilha.map((p) => p.centavos)).toEqual([0, 0]);
    expect(r.partilha.every((p) => Object.is(p.centavos, 0))).toBe(true);
    expect(situacaoDoResultado(0)).toBe("zerado");
  });

  it("prejuízo de 1 centavo em 60/40: um sócio com -1 e o outro com 0 (sem -0)", () => {
    const r = apurarPeriodo({ receitasCentavos: 0, despesasCentavos: 1, participacoes: SESSENTA_QUARENTA });
    expect(r.partilha).toEqual([
      { socioId: A, centavos: -1 },
      { socioId: B, centavos: 0 },
    ]);
    expect(r.partilha.every((p) => !Object.is(p.centavos, -0))).toBe(true);
  });

  it("sócio único leva tudo", () => {
    const r = apurarPeriodo({
      receitasCentavos: 12_345,
      despesasCentavos: 0,
      participacoes: [{ socioId: A, percentual: 1 }],
    });
    expect(r.partilha).toEqual([{ socioId: A, centavos: 12_345 }]);
  });

  it("valores enormes (no limite de Decimal(14,2)) continuam exatos", () => {
    const r = apurarPeriodo({
      receitasCentavos: 99_999_999_999_999,
      despesasCentavos: 1,
      participacoes: SESSENTA_QUARENTA,
    });
    expect(r.resultadoCentavos).toBe(99_999_999_999_998);
    expect(soma(r.partilha)).toBe(99_999_999_999_998);
    expect(r.partilha[0].centavos).toBe(59_999_999_999_999);
    expect(r.partilha[1].centavos).toBe(39_999_999_999_999);
  });

  it("preserva a ordem recebida e não altera a entrada", () => {
    const entrada = [
      { socioId: C, percentual: 0.2 },
      { socioId: A, percentual: 0.5 },
      { socioId: B, percentual: 0.3 },
    ];
    const copia = JSON.parse(JSON.stringify(entrada));
    const r = apurarPeriodo({ receitasCentavos: 1_000, despesasCentavos: 0, participacoes: entrada });
    expect(r.partilha.map((p) => p.socioId)).toEqual([C, A, B]);
    expect(r.partilha.map((p) => p.centavos)).toEqual([200, 500, 300]);
    expect(entrada).toEqual(copia);
  });

  it("percentuais que fecham 100% só dentro da tolerância ainda partilham exatamente o resultado", () => {
    const r = apurarPeriodo({
      receitasCentavos: 123_456_789_012,
      despesasCentavos: 0,
      participacoes: [
        { socioId: A, percentual: 0.5 },
        { socioId: B, percentual: 0.5 + 5e-10 },
      ],
    });
    expect(soma(r.partilha)).toBe(123_456_789_012);
  });

  it("a soma da partilha sempre fecha no resultado (3000 casos pseudo-aleatórios)", () => {
    let semente = 20261026;
    const aleatorio = () => {
      semente = (semente * 1664525 + 1013904223) % 4294967296;
      return semente / 4294967296;
    };
    for (let i = 0; i < 3_000; i++) {
      // Pesos inteiros em 1/10000 (como o banco guarda) que somam 10000.
      const n = 1 + Math.floor(aleatorio() * 6);
      const cortes = new Set<number>();
      while (cortes.size < n - 1) cortes.add(1 + Math.floor(aleatorio() * 9_999));
      const pontos = [0, ...Array.from(cortes).sort((x, y) => x - y), 10_000];
      const participacoes = pontos.slice(1).map((p, k) => ({
        socioId: `socio-${k}`,
        percentual: (p - pontos[k]) / 10_000,
      }));
      const receitas = Math.floor(aleatorio() * 1_000_000_000);
      const despesas = Math.floor(aleatorio() * 1_000_000_000);

      const r = apurarPeriodo({ receitasCentavos: receitas, despesasCentavos: despesas, participacoes });
      expect(soma(r.partilha)).toBe(receitas - despesas);
      // cada parte fica a menos de 1 centavo da cota exata
      r.partilha.forEach((parte, k) => {
        expect(Math.abs(parte.centavos - r.resultadoCentavos * participacoes[k].percentual)).toBeLessThan(1);
      });
    }
  });

  it("recusa receitas ou despesas que não sejam inteiros de centavos >= 0", () => {
    const base = { receitasCentavos: 100, despesasCentavos: 0, participacoes: SESSENTA_QUARENTA };
    for (const ruim of [Number.NaN, Number.POSITIVE_INFINITY, -1, 10.5, 2 ** 53]) {
      expect(() => apurarPeriodo({ ...base, receitasCentavos: ruim })).toThrow(RangeError);
      expect(() => apurarPeriodo({ ...base, despesasCentavos: ruim })).toThrow(RangeError);
    }
    expect(() => apurarPeriodo({ ...base, receitasCentavos: "100" as unknown as number })).toThrow(RangeError);
  });

  it("recusa participações que não fecham 100% (lança o erro da validação)", () => {
    expect(() =>
      apurarPeriodo({ receitasCentavos: 100, despesasCentavos: 0, participacoes: [{ socioId: A, percentual: 0.9 }] }),
    ).toThrow(/100%/);
    expect(() => apurarPeriodo({ receitasCentavos: 100, despesasCentavos: 0, participacoes: [] })).toThrow(
      /ao menos um sócio/i,
    );
  });
});

// ───────────────────────────── faixas de vigência ─────────────────────────────

describe("apuração com a participação mudando no meio do período", () => {
  const outubro = periodoMensal(2026, 10)!;
  // Até 15/10: 60/40. De 16/10 em diante: 50/50 (valores inventados para o teste).
  const mudaNoMeio = [
    vigencia(A, 0.6, "2026-01-01", "2026-10-15"),
    vigencia(B, 0.4, "2026-01-01", "2026-10-15"),
    vigencia(A, 0.5, "2026-10-16"),
    vigencia(B, 0.5, "2026-10-16"),
  ];

  it("divide o período em dois trechos, cortando no dia seguinte ao fim da vigência", () => {
    const faixas = faixasDoPeriodo(outubro, mudaNoMeio);
    expect(faixas.map((f) => [iso(f.inicio), iso(f.fim)])).toEqual([
      ["2026-10-01", "2026-10-15"],
      ["2026-10-16", "2026-10-31"],
    ]);
    expect(faixas[0].participacoes.map((p) => p.percentual)).toEqual([0.6, 0.4]);
    expect(faixas[1].participacoes.map((p) => p.percentual)).toEqual([0.5, 0.5]);
  });

  it("sem mudança, o período inteiro é um trecho só", () => {
    expect(faixasDoPeriodo(outubro, [vigencia(A, 1, "2026-01-01")])).toHaveLength(1);
  });

  it("cada lançamento é partilhado pelos percentuais do dia em que ocorreu", () => {
    const r = apurarPorFaixas({
      periodo: outubro,
      receitas: [
        { data: dia("2026-10-10"), centavos: 10_000 },
        { data: dia("2026-10-20"), centavos: 20_000 },
      ],
      despesas: [{ data: dia("2026-10-20"), centavos: 5_000 }],
      participacoes: mudaNoMeio,
    });
    expect(r.receitasCentavos).toBe(30_000);
    expect(r.despesasCentavos).toBe(5_000);
    expect(r.resultadoCentavos).toBe(25_000);
    expect(r.faixas.map((f) => f.resultadoCentavos)).toEqual([10_000, 15_000]);
    expect(r.faixas[0].partilha.map((p) => p.centavos)).toEqual([6_000, 4_000]);
    expect(r.faixas[1].partilha.map((p) => p.centavos)).toEqual([7_500, 7_500]);
    expect(r.partilha).toEqual([
      { socioId: A, centavos: 13_500 },
      { socioId: B, centavos: 11_500 },
    ]);
    expect(soma(r.partilha)).toBe(r.resultadoCentavos);
  });

  it("o último dia da vigência antiga e o primeiro da nova caem cada um no seu trecho", () => {
    const r = apurarPorFaixas({
      periodo: outubro,
      receitas: [
        { data: dia("2026-10-15"), centavos: 1_000 },
        { data: dia("2026-10-16"), centavos: 1_000 },
      ],
      despesas: [],
      participacoes: mudaNoMeio,
    });
    expect(r.partilha).toEqual([
      { socioId: A, centavos: 600 + 500 },
      { socioId: B, centavos: 400 + 500 },
    ]);
  });

  it("ignora lançamentos fora do período e a hora do lançamento", () => {
    const r = apurarPorFaixas({
      periodo: outubro,
      receitas: [
        { data: dia("2026-09-30"), centavos: 777 },
        { data: dia("2026-11-01"), centavos: 99_999 },
        { data: new Date("2026-10-31T23:30:00.000Z"), centavos: 100 },
      ],
      despesas: [],
      participacoes: mudaNoMeio,
    });
    expect(r.receitasCentavos).toBe(100);
    expect(soma(r.partilha)).toBe(100);
  });

  it("um sócio que sai no meio do período só participa do trecho dele", () => {
    const r = apurarPorFaixas({
      periodo: outubro,
      receitas: [
        { data: dia("2026-10-05"), centavos: 10_000 },
        { data: dia("2026-10-25"), centavos: 10_000 },
      ],
      despesas: [],
      participacoes: [
        vigencia(A, 0.6, "2026-01-01", "2026-10-15"),
        vigencia(B, 0.4, "2026-01-01", "2026-10-15"),
        vigencia(B, 1, "2026-10-16"),
      ],
    });
    expect(r.partilha).toEqual([
      { socioId: A, centavos: 6_000 },
      { socioId: B, centavos: 4_000 + 10_000 },
    ]);
  });

  it("prejuízo num trecho e lucro no outro: cada trecho se reparte sozinho e o total fecha", () => {
    const r = apurarPorFaixas({
      periodo: outubro,
      receitas: [{ data: dia("2026-10-20"), centavos: 10_001 }],
      despesas: [{ data: dia("2026-10-05"), centavos: 7_001 }],
      participacoes: mudaNoMeio,
    });
    expect(r.faixas[0].resultadoCentavos).toBe(-7_001);
    expect(r.faixas[0].partilha.map((p) => p.centavos)).toEqual([-4_201, -2_800]);
    expect(r.resultadoCentavos).toBe(3_000);
    expect(soma(r.partilha)).toBe(3_000);
  });

  it("cada trecho fecha em centavos, então o total do período também fecha (centavo ímpar em cada trecho)", () => {
    const r = apurarPorFaixas({
      periodo: outubro,
      receitas: [
        { data: dia("2026-10-10"), centavos: 1 },
        { data: dia("2026-10-20"), centavos: 1 },
      ],
      despesas: [],
      participacoes: mudaNoMeio,
    });
    expect(soma(r.partilha)).toBe(2);
  });

  it("recusa lançamento com centavos inválidos ou data inválida", () => {
    const base = { periodo: outubro, receitas: [] as Lancamento[], despesas: [] as Lancamento[], participacoes: mudaNoMeio };
    const lanc = (centavos: number, data = dia("2026-10-10")): Lancamento => ({ data, centavos });
    expect(() => apurarPorFaixas({ ...base, receitas: [lanc(Number.NaN)] })).toThrow(RangeError);
    expect(() => apurarPorFaixas({ ...base, despesas: [lanc(-5)] })).toThrow(RangeError);
    expect(() => apurarPorFaixas({ ...base, despesas: [lanc(10.5)] })).toThrow(RangeError);
    expect(() => apurarPorFaixas({ ...base, receitas: [lanc(100, new Date("lixo"))] })).toThrow(/data inválida/);
  });

  it("recusa período invertido", () => {
    expect(() =>
      apurarPorFaixas({
        periodo: { inicio: dia("2026-10-31"), fim: dia("2026-10-01"), fimExclusivo: dia("2026-11-01") },
        receitas: [],
        despesas: [],
        participacoes: mudaNoMeio,
      }),
    ).toThrow(/Período inválido/);
  });

  it("período sem nenhuma movimentação dá tudo zero", () => {
    const r = apurarPorFaixas({ periodo: outubro, receitas: [], despesas: [], participacoes: mudaNoMeio });
    expect(r.resultadoCentavos).toBe(0);
    expect(r.partilha.every((p) => Object.is(p.centavos, 0))).toBe(true);
  });
});

describe("validarParticipacoesDoPeriodo", () => {
  const outubro = periodoMensal(2026, 10)!;

  it("aceita quando todos os trechos fecham 100%", () => {
    expect(
      validarParticipacoesDoPeriodo(outubro, [
        vigencia(A, 0.6, "2026-01-01", "2026-10-15"),
        vigencia(B, 0.4, "2026-01-01", "2026-10-15"),
        vigencia(A, 1, "2026-10-16"),
      ]).ok,
    ).toBe(true);
  });

  it("aponta o intervalo sem participação vigente", () => {
    const erro = erroDe(
      validarParticipacoesDoPeriodo(outubro, [vigencia(A, 0.6, "2026-10-10"), vigencia(B, 0.4, "2026-10-10")]),
    );
    expect(erro).toMatch(/01\/10\/2026 a 09\/10\/2026/);
  });

  it("aponta o trecho em que a soma não fecha", () => {
    const erro = erroDe(
      validarParticipacoesDoPeriodo(outubro, [
        vigencia(A, 0.6, "2026-01-01"),
        vigencia(B, 0.4, "2026-01-01", "2026-10-15"),
        vigencia(B, 0.3, "2026-10-16"),
      ]),
    );
    expect(erro).toMatch(/16\/10\/2026 a 31\/10\/2026/);
    expect(erro).toMatch(/90%/);
  });

  it("recusa sobreposição do mesmo sócio", () => {
    expect(
      validarParticipacoesDoPeriodo(outubro, [vigencia(A, 0.5, "2026-01-01"), vigencia(A, 0.5, "2026-10-10")]).ok,
    ).toBe(false);
  });

  it("apurarPorFaixas lança a mesma mensagem", () => {
    expect(() =>
      apurarPorFaixas({
        periodo: outubro,
        receitas: [],
        despesas: [],
        participacoes: [vigencia(A, 0.6, "2026-10-10"), vigencia(B, 0.4, "2026-10-10")],
      }),
    ).toThrow(/Não há participações vigentes de 01\/10\/2026 a 09\/10\/2026/);
  });
});

// ───────────────────────────── receita ─────────────────────────────

describe("receitaDeLiquidacao", () => {
  it("valor liquidado x percentual, em centavos", () => {
    expect(receitaDeLiquidacao({ valorLiquidado: "1000.00", percentualComissao: "0.0750" })).toBe(7_500);
    expect(receitaDeLiquidacao({ valorLiquidado: 1000, percentualComissao: 0.075 })).toBe(7_500);
  });

  it("meio centavo sobe, exatamente (o ponto flutuante puro erraria estes)", () => {
    // R$ 1,00 x 14,5% = 14,5 centavos -> 15 (Math.round(100 * 0.145) dá 14)
    expect(receitaDeLiquidacao({ valorLiquidado: 1, percentualComissao: 0.145 })).toBe(15);
    // R$ 2,00 x 7,25% = 14,5 centavos -> 15
    expect(receitaDeLiquidacao({ valorLiquidado: "2.00", percentualComissao: "0.0725" })).toBe(15);
    // R$ 3,60 x 8,75% = 31,5 centavos -> 32
    expect(receitaDeLiquidacao({ valorLiquidado: 3.6, percentualComissao: 0.0875 })).toBe(32);
    // abaixo de meio centavo desce
    expect(receitaDeLiquidacao({ valorLiquidado: "0.09", percentualComissao: "0.0500" })).toBe(0);
    // 0.0157 x 1e6 dá 15699,999999999998 em ponto flutuante: o percentual tem de ser ARREDONDADO, não truncado.
    // R$ 50,00 x 1,57% = 78,5 centavos -> 79
    expect(receitaDeLiquidacao({ valorLiquidado: "50.00", percentualComissao: "0.0157" })).toBe(79);
    expect(receitaDeLiquidacao({ valorLiquidado: 50, percentualComissao: 0.0157 })).toBe(79);
  });

  it("bate com a conta exata em inteiros para TODO percentual de 4 casas (como o banco guarda)", () => {
    // percentual = pontos / 10000; comissão = round(centavos x pontos / 10000), meio centavo sobe.
    const valores = [1, 7, 99, 100, 101, 5_000, 12_345, 99_999, 1_000_001, 987_654_321];
    for (let pontos = 0; pontos <= 10_000; pontos++) {
      const texto = (pontos / 10_000).toFixed(4);
      for (const centavos of valores) {
        const esperado = Number((BigInt(centavos) * BigInt(pontos) + BigInt(5_000)) / BigInt(10_000));
        const reais = `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, "0")}`;
        expect(receitaDeLiquidacao({ valorLiquidado: reais, percentualComissao: texto })).toBe(esperado);
      }
    }
  });

  it("aceita o objeto Decimal do banco (só toString)", () => {
    const decimal = (texto: string) => ({ toString: () => texto });
    // 1234,56 x 5% = 61,728 reais = 6172,8 centavos -> 6173
    expect(
      receitaDeLiquidacao({ valorLiquidado: decimal("1234.56"), percentualComissao: decimal("0.0500") }),
    ).toBe(6_173);
  });

  it("sem percentual (nulo ou ausente) não há comissão a calcular: 0", () => {
    expect(receitaDeLiquidacao({ valorLiquidado: "1000.00", percentualComissao: null })).toBe(0);
    expect(receitaDeLiquidacao({ valorLiquidado: "1000.00" })).toBe(0);
  });

  it("valor zero ou percentual zero dão 0", () => {
    expect(receitaDeLiquidacao({ valorLiquidado: 0, percentualComissao: 0.1 })).toBe(0);
    expect(receitaDeLiquidacao({ valorLiquidado: 500, percentualComissao: 0 })).toBe(0);
  });

  it("continua exato em valores no limite do Decimal(14,2)", () => {
    expect(receitaDeLiquidacao({ valorLiquidado: "999999999999.99", percentualComissao: 1 })).toBe(
      99_999_999_999_999,
    );
    // 99.999.999.999.999 x 15% = 14.999.999.999.999,85 -> 15.000.000.000.000
    expect(receitaDeLiquidacao({ valorLiquidado: "999999999999.99", percentualComissao: "0.1500" })).toBe(
      15_000_000_000_000,
    );
  });

  it("recusa valor que não é número finito ou é negativo", () => {
    for (const ruim of [Number.NaN, Number.POSITIVE_INFINITY, "", "  ", "abc", "1,5", -1, "-0.01"]) {
      expect(() => receitaDeLiquidacao({ valorLiquidado: ruim, percentualComissao: 0.1 })).toThrow(RangeError);
    }
  });

  it("recusa percentual fora de 0 a 1 (5 em vez de 0,05 é erro de digitação)", () => {
    for (const ruim of [Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01, 5, "abc"]) {
      expect(() => receitaDeLiquidacao({ valorLiquidado: 1000, percentualComissao: ruim })).toThrow(RangeError);
    }
  });
});

describe("receitaRecebidaNoPeriodo e somarReceitaRecebida", () => {
  const outubro = periodoMensal(2026, 10)!;
  const liq = (extra: Partial<Parameters<typeof somarReceitaRecebida>[0][number]> = {}) => ({
    valorLiquidado: "1000.00",
    percentualComissao: "0.0500",
    statusCobranca: "recebida",
    dataRecebimento: new Date("2026-10-05T15:00:00.000Z"),
    ...extra,
  });

  it("soma só o que foi RECEBIDO, no período", () => {
    const total = somarReceitaRecebida(
      [
        liq(), // R$ 50,00
        liq({ valorLiquidado: "2000.50", percentualComissao: "0.1000" }), // R$ 200,05
        liq({ statusCobranca: "cobrada" }),
        liq({ statusCobranca: "pendente", dataRecebimento: null }),
        liq({ dataRecebimento: new Date("2026-09-15T12:00:00.000Z") }), // setembro
        liq({ dataRecebimento: new Date("2026-11-15T12:00:00.000Z") }), // novembro
      ],
      outubro,
    );
    expect(total).toBe(5_000 + 20_005);
  });

  it("o dia do recebimento é o de Brasília: 31/10 às 23h59 ainda é outubro; 01/11 às 00h00 já é novembro", () => {
    const ultimoInstante = liq({ dataRecebimento: new Date("2026-11-01T02:59:59.000Z") }); // 31/10 23:59:59 em Brasília
    const primeiroDeNovembro = liq({ dataRecebimento: new Date("2026-11-01T03:00:00.000Z") }); // 01/11 00:00 em Brasília
    expect(somarReceitaRecebida([ultimoInstante], outubro)).toBe(5_000);
    expect(somarReceitaRecebida([primeiroDeNovembro], outubro)).toBe(0);
  });

  it("o primeiro instante de outubro em Brasília entra; o último de setembro não", () => {
    const entra = liq({ dataRecebimento: new Date("2026-10-01T03:00:00.000Z") });
    const nao = liq({ dataRecebimento: new Date("2026-10-01T02:59:59.000Z") });
    expect(somarReceitaRecebida([entra], outubro)).toBe(5_000);
    expect(somarReceitaRecebida([nao], outubro)).toBe(0);
  });

  it("avisa das recebidas sem data de recebimento (ficam de fora) e das sem percentual (entram com 0)", () => {
    const r = receitaRecebidaNoPeriodo(
      [liq(), liq({ dataRecebimento: null }), liq({ percentualComissao: null }), liq({ percentualComissao: undefined })],
      outubro,
    );
    expect(r.centavos).toBe(5_000);
    expect(r.semDataRecebimento).toBe(1);
    expect(r.semPercentual).toBe(2);
    expect(r.lancamentos).toHaveLength(3);
  });

  it("os lançamentos saem com o dia de Brasília, prontos para apurarPorFaixas", () => {
    const r = receitaRecebidaNoPeriodo([liq({ dataRecebimento: new Date("2026-11-01T02:00:00.000Z") })], outubro);
    expect(r.lancamentos).toHaveLength(1);
    expect(iso(r.lancamentos[0].data)).toBe("2026-10-31");
    expect(r.lancamentos[0].centavos).toBe(5_000);
  });

  it("arredonda cada liquidação e só então soma (uma nota de comissão por liquidação)", () => {
    // R$ 0,10 x 5% = 0,5 centavo -> 1 em cada; três delas somam 3 (e não 2, de 1,5 arredondado no fim).
    const tres = [liq({ valorLiquidado: "0.10" }), liq({ valorLiquidado: "0.10" }), liq({ valorLiquidado: "0.10" })];
    expect(somarReceitaRecebida(tres, outubro)).toBe(3);
  });

  it("lista vazia dá zero", () => {
    expect(somarReceitaRecebida([], outubro)).toBe(0);
  });

  it("liquidação recebida com valor impossível derruba a conta em vez de sumir com dinheiro", () => {
    expect(() => somarReceitaRecebida([liq({ valorLiquidado: Number.NaN })], outubro)).toThrow(RangeError);
  });

  it("fora do período, nem lê o valor (liquidação de outro mês com dado ruim não atrapalha)", () => {
    expect(
      somarReceitaRecebida([liq({ valorLiquidado: Number.NaN, dataRecebimento: new Date("2026-03-10T12:00:00Z") })], outubro),
    ).toBe(0);
  });
});

// ───────────────────────────── períodos e datas ─────────────────────────────

describe("periodoMensal", () => {
  it("fevereiro de 2026 vai de 01/02 a 28/02, com fim exclusivo em 01/03", () => {
    const p = periodoMensal(2026, 2)!;
    expect(p.inicio.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(p.fim.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(p.fimExclusivo.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("ano bissexto tem 29 de fevereiro", () => {
    expect(iso(periodoMensal(2028, 2)!.fim)).toBe("2028-02-29");
  });

  it("dezembro termina em 31/12 e o fim exclusivo cai em janeiro do ano seguinte", () => {
    const p = periodoMensal(2026, 12)!;
    expect(iso(p.fim)).toBe("2026-12-31");
    expect(iso(p.fimExclusivo)).toBe("2027-01-01");
  });

  it("recusa mês e ano impossíveis", () => {
    for (const [ano, mes] of [
      [2026, 0],
      [2026, 13],
      [2026, 1.5],
      [Number.NaN, 1],
      [2026, Number.NaN],
      [1999, 12],
      [2101, 1],
    ]) {
      expect(periodoMensal(ano, mes)).toBeNull();
    }
  });
});

describe("periodoMensalDeTexto", () => {
  it("lê AAAA-MM", () => {
    expect(iso(periodoMensalDeTexto("2026-10")!.fim)).toBe("2026-10-31");
    expect(iso(periodoMensalDeTexto(" 2026-10 ")!.inicio)).toBe("2026-10-01");
  });

  it("devolve nulo para o que não é um mês", () => {
    for (const ruim of ["", "2026-13", "2026-00", "2026-1", "26-10", "2026/10", "2026-10-01", "outubro"]) {
      expect(periodoMensalDeTexto(ruim)).toBeNull();
    }
    expect(periodoMensalDeTexto(undefined as unknown as string)).toBeNull();
  });
});

describe("periodoDeDias e periodoDeTextos", () => {
  it("descarta a hora e inclui as duas pontas", () => {
    const p = periodoDeDias(new Date("2026-10-01T15:30:00.000Z"), new Date("2026-10-03T23:59:59.000Z"))!;
    expect(iso(p.inicio)).toBe("2026-10-01");
    expect(iso(p.fim)).toBe("2026-10-03");
    expect(iso(p.fimExclusivo)).toBe("2026-10-04");
  });

  it("aceita um período de um dia só", () => {
    const p = periodoDeDias(dia("2026-10-05"), dia("2026-10-05"))!;
    expect(dataNoPeriodo(dia("2026-10-05"), p)).toBe(true);
    expect(dataNoPeriodo(dia("2026-10-06"), p)).toBe(false);
  });

  it("recusa fim antes do início e datas inválidas", () => {
    expect(periodoDeDias(dia("2026-10-05"), dia("2026-10-04"))).toBeNull();
    expect(periodoDeDias(new Date("lixo"), dia("2026-10-04"))).toBeNull();
    expect(periodoDeDias(dia("2026-10-04"), new Date("lixo"))).toBeNull();
  });

  it("lê duas datas de formulário", () => {
    expect(iso(periodoDeTextos("2026-10-01", "2026-10-31")!.fim)).toBe("2026-10-31");
    expect(periodoDeTextos("2026-10-31", "2026-10-01")).toBeNull();
    expect(periodoDeTextos("2026-02-30", "2026-03-01")).toBeNull();
    expect(periodoDeTextos("01/10/2026", "31/10/2026")).toBeNull();
    expect(periodoDeTextos("", "")).toBeNull();
  });

  it("dataNoPeriodo inclui as pontas, ignora a hora e recusa data inválida", () => {
    const p = periodoMensal(2026, 10)!;
    expect(dataNoPeriodo(dia("2026-10-01"), p)).toBe(true);
    expect(dataNoPeriodo(new Date("2026-10-31T22:00:00.000Z"), p)).toBe(true);
    expect(dataNoPeriodo(dia("2026-09-30"), p)).toBe(false);
    expect(dataNoPeriodo(dia("2026-11-01"), p)).toBe(false);
    expect(dataNoPeriodo(new Date("lixo"), p)).toBe(false);
  });
});

describe("dia de Brasília", () => {
  it("hoje em Brasília: 23h30 de 26/10 ainda é 26/10 (já é 27/10 em UTC)", () => {
    expect(iso(hojeEmSaoPaulo(new Date("2026-10-27T02:30:00.000Z")))).toBe("2026-10-26");
  });

  it("hoje em Brasília: meia-noite de 27/10 em Brasília já é 27/10", () => {
    expect(iso(hojeEmSaoPaulo(new Date("2026-10-27T03:00:00.000Z")))).toBe("2026-10-27");
  });

  it("devolve meia-noite UTC", () => {
    expect(hojeEmSaoPaulo(new Date("2026-10-27T15:00:00.000Z")).toISOString()).toBe("2026-10-27T00:00:00.000Z");
  });

  it("diaEmSaoPaulo devolve nulo para instante inválido; hojeEmSaoPaulo lança", () => {
    expect(diaEmSaoPaulo(new Date("lixo"))).toBeNull();
    expect(() => hojeEmSaoPaulo(new Date("lixo"))).toThrow(RangeError);
  });
});

// ───────────────────────────── dinheiro ─────────────────────────────

describe("reaisParaCentavos", () => {
  it("converte Decimal em texto, número e objeto sem perder centavo", () => {
    expect(reaisParaCentavos("1234.56")).toBe(123_456);
    expect(reaisParaCentavos(19.99)).toBe(1_999);
    expect(reaisParaCentavos(0.29)).toBe(29);
    expect(reaisParaCentavos(0.1 + 0.2)).toBe(30);
    expect(reaisParaCentavos({ toString: () => "10.50" })).toBe(1_050);
    expect(reaisParaCentavos("0")).toBe(0);
    expect(reaisParaCentavos("999999999999.99")).toBe(99_999_999_999_999);
  });

  it("nunca devolve zero negativo", () => {
    expect(Object.is(reaisParaCentavos("-0.001"), 0)).toBe(true);
  });

  it("lança erro para o que não é número finito", () => {
    for (const ruim of [Number.NaN, Number.POSITIVE_INFINITY, "", "abc", "1,5", 1e30]) {
      expect(() => reaisParaCentavos(ruim)).toThrow(RangeError);
    }
  });
});

describe("centavosParaDecimal", () => {
  it("monta o texto que o Prisma aceita em Decimal", () => {
    expect(centavosParaDecimal(123_456)).toBe("1234.56");
    expect(centavosParaDecimal(5)).toBe("0.05");
    expect(centavosParaDecimal(0)).toBe("0.00");
    expect(centavosParaDecimal(-10_001)).toBe("-100.01");
  });

  it("recusa o que não é inteiro", () => {
    expect(() => centavosParaDecimal(1.5)).toThrow(RangeError);
    expect(() => centavosParaDecimal(Number.NaN)).toThrow(RangeError);
  });
});

describe("formatarReais", () => {
  it("formata centavos em reais pt-BR", () => {
    expect(formatarReais(0)).toBe("R$ 0,00");
    expect(formatarReais(5)).toBe("R$ 0,05");
    expect(formatarReais(99)).toBe("R$ 0,99");
    expect(formatarReais(123_456)).toBe("R$ 1.234,56");
    expect(formatarReais(100_000_000)).toBe("R$ 1.000.000,00");
    expect(formatarReais(99_999_999_999_999)).toBe("R$ 999.999.999.999,99");
  });

  it("o sinal vem na frente do R$", () => {
    expect(formatarReais(-10_001)).toBe("-R$ 100,01");
    expect(formatarReais(-5)).toBe("-R$ 0,05");
  });

  it("usa espaço comum (o nbsp do Intl atrapalha comparação e cópia)", () => {
    expect(formatarReais(100)).not.toContain(" ");
  });

  it("devolve travessão para o que não é inteiro seguro", () => {
    expect(formatarReais(Number.NaN)).toBe("—");
    expect(formatarReais(12.5)).toBe("—");
    expect(formatarReais(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("interpretarReais", () => {
  const ok = (texto: string) => {
    const r = interpretarReais(texto);
    return r.ok ? r.centavos : `erro: ${r.erro}`;
  };

  it("lê os formatos comuns de digitação em pt-BR", () => {
    expect(ok("1234")).toBe(123_400);
    expect(ok("1234,5")).toBe(123_450);
    expect(ok("1234,56")).toBe(123_456);
    expect(ok("1.234,56")).toBe(123_456);
    expect(ok("1234.56")).toBe(123_456);
    expect(ok("R$ 1.234,56")).toBe(123_456);
    expect(ok("  10  ")).toBe(1_000);
    expect(ok("0,05")).toBe(5);
    expect(ok("0")).toBe(0);
  });

  it("ponto com 3 dígitos e sem vírgula é milhar; com 1 ou 2 dígitos é decimal", () => {
    expect(ok("1.234")).toBe(123_400);
    expect(ok("1.234.567")).toBe(123_456_700);
    expect(ok("12.5")).toBe(1_250);
  });

  it("ponto de milhar não começa por zero: '0.500' não vira R$ 500 em silêncio", () => {
    expect(interpretarReais("0.500").ok).toBe(false);
    expect(interpretarReais("0.500,00").ok).toBe(false);
    expect(interpretarReais("00.500").ok).toBe(false);
    expect(ok("0.50")).toBe(50);
    expect(ok("0,50")).toBe(50);
  });

  it("aceita o maior valor do Decimal(14,2) e recusa o seguinte", () => {
    expect(ok("999.999.999.999,99")).toBe(99_999_999_999_999);
    expect(interpretarReais("1.000.000.000.000,00").ok).toBe(false);
    expect(interpretarReais("1000000000000").ok).toBe(false);
  });

  it("recusa vazio, negativo, letras, notação científica e mais de 2 casas", () => {
    for (const ruim of ["", "   ", "abc", "-5", "1e5", "1,234", "1.234,567", "12.34.56", "1,2,3", "R$", ",5", "10 reais"]) {
      expect(interpretarReais(ruim).ok).toBe(false);
    }
    expect(interpretarReais(undefined as unknown as string).ok).toBe(false);
    expect(interpretarReais(10 as unknown as string).ok).toBe(false);
  });

  it("zeros à esquerda não contam como dígitos de tamanho", () => {
    expect(ok("000000000000010")).toBe(1_000);
  });
});

describe("interpretarPercentualParticipacao", () => {
  const fracao = (texto: string) => {
    const r = interpretarPercentualParticipacao(texto);
    return r.ok ? r.fracao : null;
  };

  it("lê porcentagem digitada e devolve a fração", () => {
    expect(fracao("60")).toBe(0.6);
    expect(fracao("33,33")).toBe(0.3333);
    expect(fracao("33.34%")).toBe(0.3334);
    expect(fracao(" 12,5 % ")).toBe(0.125);
    expect(fracao("100")).toBe(1);
    expect(fracao("0,01")).toBe(0.0001);
  });

  it("recusa 0, acima de 100, casas demais, vazio e lixo", () => {
    for (const ruim of ["0", "0,00", "100,01", "101", "33,333", "", "-5", "abc", "1e2", "6 0"]) {
      expect(interpretarPercentualParticipacao(ruim).ok).toBe(false);
    }
    expect(interpretarPercentualParticipacao(undefined as unknown as string).ok).toBe(false);
  });

  it("as frações lidas de 33,33 / 33,33 / 33,34 passam em validarParticipacoes", () => {
    const partes = ["33,33", "33,33", "33,34"].map((t, i) => ({ socioId: `s${i}`, percentual: fracao(t)! }));
    expect(validarParticipacoes(partes)).toEqual({ ok: true });
  });
});

describe("fracaoParaDecimal", () => {
  it("devolve 4 casas para gravar em Decimal(7,4)", () => {
    expect(fracaoParaDecimal(0.6)).toBe("0.6000");
    expect(fracaoParaDecimal(0.3333)).toBe("0.3333");
    expect(fracaoParaDecimal(1)).toBe("1.0000");
  });

  it("recusa o que não é finito", () => {
    expect(() => fracaoParaDecimal(Number.NaN)).toThrow(RangeError);
  });
});
