import { describe, expect, it } from "vitest";
import { periodoMensal } from "@/lib/financeiro-scp";
import type { FinanceiroDoPeriodo, ParticipacaoDados, ReceitaDoPeriodo, SocioDados } from "@/lib/financeiro-scp-db";
import { calcularPartilha, numerosDoPeriodo } from "./apuracao";

/** Só dados fictícios: "Sócio A", "Sócio B", 60% e 40%, valores redondos de teste. */
const OUTUBRO = periodoMensal(2026, 10)!;
const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);

function participacao(
  id: string,
  socioId: string,
  percentual: number,
  desde: string,
  ate: string | null = null,
): ParticipacaoDados {
  return { id, socioId, percentual, vigenteDesde: dia(desde), vigenteAte: ate ? dia(ate) : null };
}

function socio(id: string, nome: string, participacoes: ParticipacaoDados[]): SocioDados {
  return { id, nome, tipo: "participante", ativo: true, participacoes };
}

const RECEITA_VAZIA: ReceitaDoPeriodo = {
  centavos: 0,
  lancamentos: [],
  porOportunidade: [],
  quantidade: 0,
  semPercentual: 0,
  semDataRecebimento: 0,
  invalidas: 0,
  truncada: false,
};

function financeiro(extra: {
  socios?: SocioDados[];
  receitaCentavos?: number;
  receitaDia?: string;
  despesaCentavos?: number;
  despesaDia?: string;
  receita?: Partial<ReceitaDoPeriodo>;
}): FinanceiroDoPeriodo {
  const receitaCentavos = extra.receitaCentavos ?? 0;
  const despesaCentavos = extra.despesaCentavos ?? 0;
  return {
    periodo: OUTUBRO,
    socios: extra.socios ?? [],
    receita: {
      ...RECEITA_VAZIA,
      centavos: receitaCentavos,
      quantidade: receitaCentavos > 0 ? 1 : 0,
      lancamentos: receitaCentavos > 0 ? [{ data: dia(extra.receitaDia ?? "2026-10-10"), centavos: receitaCentavos }] : [],
      ...extra.receita,
    },
    despesas: {
      lista: [],
      listaTruncada: false,
      quantidade: despesaCentavos > 0 ? 1 : 0,
      centavos: despesaCentavos,
      porDia: despesaCentavos > 0 ? [{ data: dia(extra.despesaDia ?? "2026-10-20"), centavos: despesaCentavos }] : [],
    },
  };
}

const SOCIOS_60_40 = [
  socio("a", "Sócio A", [participacao("p1", "a", 0.6, "2026-01-01")]),
  socio("b", "Sócio B", [participacao("p2", "b", 0.4, "2026-01-01")]),
];

describe("calcularPartilha", () => {
  it("sem sócios, ou sócios sem nenhuma participação: sem cadastro (a tela explica o que fazer)", () => {
    expect(calcularPartilha(financeiro({}))).toEqual({ situacao: "sem_cadastro" });
    expect(calcularPartilha(financeiro({ socios: [socio("a", "Sócio A", [])] }))).toEqual({ situacao: "sem_cadastro" });
  });

  it("60/40 sobre o resultado do mês: cada sócio recebe a sua parte e a soma é o resultado", () => {
    const r = calcularPartilha(financeiro({ socios: SOCIOS_60_40, receitaCentavos: 100_000, despesaCentavos: 20_000 }));
    expect(r.situacao).toBe("ok");
    if (r.situacao !== "ok") return;
    expect(r.apuracao.resultadoCentavos).toBe(80_000);
    expect(r.linhas).toEqual([
      { socioId: "a", nome: "Sócio A", participacao: "60%", centavos: 48_000 },
      { socioId: "b", nome: "Sócio B", participacao: "40%", centavos: 32_000 },
    ]);
    expect(r.variaNoPeriodo).toBe(false);
  });

  it("resultado que não divide exato: o centavo que sobra vai a quem tem o maior resto e a soma fecha", () => {
    const r = calcularPartilha(financeiro({ socios: SOCIOS_60_40, receitaCentavos: 100_001 }));
    if (r.situacao !== "ok") throw new Error("esperava partilha calculada");
    expect(r.linhas.map((l) => l.centavos)).toEqual([60_001, 40_000]);
    expect(r.linhas.reduce((soma, l) => soma + l.centavos, 0)).toBe(100_001);
  });

  it("prejuízo é repartido pelos mesmos percentuais, com valores negativos", () => {
    const r = calcularPartilha(financeiro({ socios: SOCIOS_60_40, receitaCentavos: 10_000, despesaCentavos: 60_000 }));
    if (r.situacao !== "ok") throw new Error("esperava partilha calculada");
    expect(r.apuracao.resultadoCentavos).toBe(-50_000);
    expect(r.linhas.map((l) => l.centavos)).toEqual([-30_000, -20_000]);
  });

  it("mês sem movimento: partilha zerada, sem zero negativo", () => {
    const r = calcularPartilha(financeiro({ socios: SOCIOS_60_40 }));
    if (r.situacao !== "ok") throw new Error("esperava partilha calculada");
    expect(r.linhas.map((l) => l.centavos)).toEqual([0, 0]);
    expect(Object.is(r.linhas[0].centavos, -0)).toBe(false);
  });

  it("participações que não fecham 100%: bloqueia e mostra o erro, sem calcular partilha", () => {
    const socios = [
      socio("a", "Sócio A", [participacao("p1", "a", 0.6, "2026-01-01")]),
      socio("b", "Sócio B", [participacao("p2", "b", 0.3, "2026-01-01")]),
    ];
    const r = calcularPartilha(financeiro({ socios, receitaCentavos: 100_000 }));
    expect(r.situacao).toBe("bloqueada");
    if (r.situacao !== "bloqueada") return;
    expect(r.erro).toMatch(/soma das participações vigentes deve ser exatamente 100%/);
    expect(r.erro).toContain("90%");
    expect(r.erro).toContain("01/10/2026 a 31/10/2026");
  });

  it("sócios cadastrados, mas nenhuma participação vigente no mês: bloqueia explicando o trecho", () => {
    const socios = [socio("a", "Sócio A", [participacao("p1", "a", 1, "2026-11-01")])];
    const r = calcularPartilha(financeiro({ socios, receitaCentavos: 100_000 }));
    expect(r).toMatchObject({ situacao: "bloqueada" });
    expect(r.situacao === "bloqueada" && r.erro).toMatch(/Não há participações vigentes de 01\/10\/2026 a 31\/10\/2026/);
  });

  it("vigências sobrepostas de um mesmo sócio: bloqueia", () => {
    const socios = [
      socio("a", "Sócio A", [participacao("p1", "a", 0.5, "2026-01-01"), participacao("p2", "a", 0.5, "2026-06-01")]),
    ];
    const r = calcularPartilha(financeiro({ socios }));
    expect(r.situacao === "bloqueada" && r.erro).toMatch(/se sobrepõem/);
  });

  it("receita incompleta (liquidação inválida ou limite estourado): não calcula a partilha", () => {
    const invalida = calcularPartilha(financeiro({ socios: SOCIOS_60_40, receita: { invalidas: 2 } }));
    expect(invalida.situacao === "bloqueada" && invalida.erro).toMatch(/2 comissões recebidas têm valor ou percentual inválido/);

    const umaSo = calcularPartilha(financeiro({ socios: SOCIOS_60_40, receita: { invalidas: 1 } }));
    expect(umaSo.situacao === "bloqueada" && umaSo.erro).toMatch(/1 comissão recebida tem valor/);

    const truncada = calcularPartilha(financeiro({ socios: SOCIOS_60_40, receita: { truncada: true } }));
    expect(truncada.situacao === "bloqueada" && truncada.erro).toMatch(/comissões recebidas demais/);
  });

  it("participação que muda no meio do mês: cada trecho é partilhado pelos percentuais dele", () => {
    // A: 60% até 15/10, 50% a partir de 16/10. B: 40% até 15/10, 50% a partir de 16/10.
    const socios = [
      socio("a", "Sócio A", [
        participacao("p1", "a", 0.6, "2026-01-01", "2026-10-15"),
        participacao("p3", "a", 0.5, "2026-10-16"),
      ]),
      socio("b", "Sócio B", [
        participacao("p2", "b", 0.4, "2026-01-01", "2026-10-15"),
        participacao("p4", "b", 0.5, "2026-10-16"),
      ]),
    ];
    // Receita de R$ 1.000,00 em 10/10 (trecho 60/40) e despesa de R$ 200,00 em 20/10 (trecho 50/50).
    const r = calcularPartilha(
      financeiro({ socios, receitaCentavos: 100_000, receitaDia: "2026-10-10", despesaCentavos: 20_000, despesaDia: "2026-10-20" }),
    );
    if (r.situacao !== "ok") throw new Error("esperava partilha calculada");

    expect(r.variaNoPeriodo).toBe(true);
    expect(r.apuracao.faixas).toHaveLength(2);
    expect(r.linhas).toEqual([
      {
        socioId: "a",
        nome: "Sócio A",
        participacao: "60% (01/10/2026 a 15/10/2026) · 50% (16/10/2026 a 31/10/2026)",
        centavos: 50_000, // 60.000 do trecho 1, menos 10.000 do trecho 2
      },
      {
        socioId: "b",
        nome: "Sócio B",
        participacao: "40% (01/10/2026 a 15/10/2026) · 50% (16/10/2026 a 31/10/2026)",
        centavos: 30_000, // 40.000 do trecho 1, menos 10.000 do trecho 2
      },
    ]);
    expect(r.linhas.reduce((soma, l) => soma + l.centavos, 0)).toBe(r.apuracao.resultadoCentavos);
  });

  it("sócio que só entra no meio do mês aparece com o trecho dele; quem não muda mostra um percentual só", () => {
    // Sócio A fica com 100% até 14/10; a partir de 15/10, A 70% e B 30%.
    const socios = [
      socio("a", "Sócio A", [
        participacao("p1", "a", 1, "2026-01-01", "2026-10-14"),
        participacao("p2", "a", 0.7, "2026-10-15"),
      ]),
      socio("b", "Sócio B", [participacao("p3", "b", 0.3, "2026-10-15")]),
    ];
    const r = calcularPartilha(financeiro({ socios, receitaCentavos: 100_000, receitaDia: "2026-10-20" }));
    if (r.situacao !== "ok") throw new Error("esperava partilha calculada");
    const b = r.linhas.find((l) => l.socioId === "b")!;
    expect(b.participacao).toBe("30% (15/10/2026 a 31/10/2026)");
    expect(b.centavos).toBe(30_000);
    expect(r.linhas.find((l) => l.socioId === "a")!.centavos).toBe(70_000);
  });

  it("trechos cortados só por causa de outro sócio mostram o percentual como um bloco só", () => {
    // C muda no dia 16, A e B não: o percentual de A é o mesmo nos dois trechos.
    const socios = [
      socio("a", "Sócio A", [participacao("p1", "a", 0.5, "2026-01-01")]),
      socio("b", "Sócio B", [
        participacao("p2", "b", 0.3, "2026-01-01", "2026-10-15"),
        participacao("p3", "b", 0.2, "2026-10-16"),
      ]),
      socio("c", "Sócio C", [
        participacao("p4", "c", 0.2, "2026-01-01", "2026-10-15"),
        participacao("p5", "c", 0.3, "2026-10-16"),
      ]),
    ];
    const r = calcularPartilha(financeiro({ socios, receitaCentavos: 100_000 }));
    if (r.situacao !== "ok") throw new Error("esperava partilha calculada");
    expect(r.linhas.find((l) => l.socioId === "a")!.participacao).toBe("50%");
    expect(r.variaNoPeriodo).toBe(true);
  });

  it("sócio que sai da partilha no meio do mês e volta com o mesmo percentual: os trechos não viram um bloco só", () => {
    // A e B têm 50% até 10/10 e de novo a partir de 21/10; de 11/10 a 20/10 só C (100%).
    const socios = [
      socio("a", "Sócio A", [participacao("p1", "a", 0.5, "2026-01-01", "2026-10-10"), participacao("p2", "a", 0.5, "2026-10-21")]),
      socio("b", "Sócio B", [participacao("p3", "b", 0.5, "2026-01-01", "2026-10-10"), participacao("p4", "b", 0.5, "2026-10-21")]),
      socio("c", "Sócio C", [participacao("p5", "c", 1, "2026-10-11", "2026-10-20")]),
    ];
    const r = calcularPartilha(financeiro({ socios, receitaCentavos: 100_000, receitaDia: "2026-10-05" }));
    if (r.situacao !== "ok") throw new Error("esperava partilha calculada");
    expect(r.linhas.map((l) => [l.socioId, l.participacao, l.centavos])).toEqual([
      ["a", "50% (01/10/2026 a 10/10/2026) · 50% (21/10/2026 a 31/10/2026)", 50_000],
      ["b", "50% (01/10/2026 a 10/10/2026) · 50% (21/10/2026 a 31/10/2026)", 50_000],
      ["c", "100% (11/10/2026 a 20/10/2026)", 0],
    ]);
  });

  it("percentuais que diferem só na segunda casa (33,33% e 33,34%) aparecem como trechos diferentes", () => {
    const socios = [
      socio("a", "Sócio A", [
        participacao("p1", "a", 0.3333, "2026-01-01", "2026-10-15"),
        participacao("p2", "a", 0.3334, "2026-10-16"),
      ]),
      socio("b", "Sócio B", [
        participacao("p3", "b", 0.6667, "2026-01-01", "2026-10-15"),
        participacao("p4", "b", 0.6666, "2026-10-16"),
      ]),
    ];
    const r = calcularPartilha(financeiro({ socios, receitaCentavos: 100_000 }));
    if (r.situacao !== "ok") throw new Error("esperava partilha calculada");
    expect(r.linhas[0].participacao).toBe("33,33% (01/10/2026 a 15/10/2026) · 33,34% (16/10/2026 a 31/10/2026)");
    expect(r.linhas[1].participacao).toBe("66,67% (01/10/2026 a 15/10/2026) · 66,66% (16/10/2026 a 31/10/2026)");
  });

  it("não escreve cor nem nome de sócio real: só o que veio nos dados", () => {
    const r = calcularPartilha(financeiro({ socios: SOCIOS_60_40, receitaCentavos: 1 }));
    expect(JSON.stringify(r)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("numerosDoPeriodo", () => {
  it("receita, despesas e resultado em reais, com o resultado em verde quando positivo", () => {
    const f = financeiro({ receitaCentavos: 123_456, despesaCentavos: 23_456 });
    f.receita.quantidade = 3;
    f.despesas.quantidade = 2;
    const [receita, despesas, resultado] = numerosDoPeriodo(f);
    expect(receita).toMatchObject({ valor: "R$ 1.234,56", rotulo: "Receita recebida", nota: "3 comissões recebidas no período" });
    expect(despesas).toMatchObject({ valor: "R$ 234,56", rotulo: "Despesas", nota: "2 lançamentos" });
    expect(resultado).toMatchObject({ valor: "R$ 1.000,00", rotulo: "Resultado", tom: "marca" });
  });

  it("prejuízo: valor negativo e tom de atenção; zerado: sem tom", () => {
    const prejuizo = numerosDoPeriodo(financeiro({ receitaCentavos: 10_000, despesaCentavos: 25_000 }))[2];
    expect(prejuizo).toMatchObject({ valor: "-R$ 150,00", tom: "atencao", nota: "Prejuízo no período" });

    const zerado = numerosDoPeriodo(financeiro({}))[2];
    expect(zerado.valor).toBe("R$ 0,00");
    expect(zerado.tom).toBeUndefined();
  });

  it("singular: 1 comissão recebida, 1 lançamento", () => {
    const [receita, despesas] = numerosDoPeriodo(financeiro({ receitaCentavos: 100, despesaCentavos: 100 }));
    expect(receita.nota).toBe("1 comissão recebida no período");
    expect(despesas.nota).toBe("1 lançamento");
  });
});
