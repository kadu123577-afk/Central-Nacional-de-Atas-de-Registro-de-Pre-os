import { describe, expect, it } from "vitest";
import {
  CHAVES_INDICADOR,
  calcularVariacao,
  contarContatos,
  dadosVazios,
  emReais,
  escolherSemana,
  fotoExata,
  hojeEmBrasilia,
  montarResumo,
  resumirMovimentos,
  rotuloSemana,
  semanaAnterior,
  semanaDe,
  semanaSeguinte,
  somarComissoes,
  qualidadeDaComparacaoDeNegociacoes,
  textoVariacao,
  textoVariacaoComQualidade,
  type DadosDaSemana,
  type LiquidacaoParaSomar,
} from "./indicadores-semanais";

const SEMANA_19_10 = semanaDe(new Date("2026-10-21T12:00:00-03:00"));

describe("semanaDe", () => {
  it("vai de segunda a domingo, em Brasília", () => {
    const s = semanaDe(new Date("2026-10-21T12:00:00-03:00")); // quarta-feira
    expect(s.segunda).toBe("2026-10-19");
    expect(s.domingo).toBe("2026-10-25");
    expect(s.inicio.toISOString()).toBe("2026-10-19T03:00:00.000Z");
    expect(s.fim.toISOString()).toBe("2026-10-26T03:00:00.000Z");
    expect(s.fim.getTime() - s.inicio.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("domingo 23:59:59 ainda é da semana que termina", () => {
    expect(semanaDe(new Date("2026-10-25T23:59:00-03:00")).segunda).toBe("2026-10-19");
    expect(semanaDe(new Date("2026-10-25T23:59:59.999-03:00")).segunda).toBe("2026-10-19");
  });

  it("segunda 00:00 já é da semana seguinte", () => {
    expect(semanaDe(new Date("2026-10-26T00:00:00-03:00")).segunda).toBe("2026-10-26");
    expect(semanaDe(new Date("2026-10-26T00:00:00-03:00")).domingo).toBe("2026-11-01");
  });

  it("usa Brasília e não UTC: segunda 00:00 UTC ainda é domingo à noite no Brasil", () => {
    // 2026-10-26T00:00Z = domingo 21:00 em Brasília -> semana que começou em 19/10.
    expect(semanaDe(new Date("2026-10-26T00:00:00Z")).segunda).toBe("2026-10-19");
    // 02:59:59.999Z = domingo 23:59:59.999 em Brasília; 03:00Z = segunda 00:00 em Brasília.
    expect(semanaDe(new Date("2026-10-26T02:59:59.999Z")).segunda).toBe("2026-10-19");
    expect(semanaDe(new Date("2026-10-26T03:00:00Z")).segunda).toBe("2026-10-26");
  });

  it("atravessa a mudança de ano", () => {
    const s = semanaDe(new Date("2027-01-01T10:00:00-03:00")); // sexta-feira
    expect(s.segunda).toBe("2026-12-28");
    expect(s.domingo).toBe("2027-01-03");
    const virada = semanaDe(new Date("2026-01-01T10:00:00-03:00")); // quinta-feira
    expect(virada.segunda).toBe("2025-12-29");
    expect(virada.domingo).toBe("2026-01-04");
    expect(rotuloSemana(virada)).toBe("29/12/2025 a 04/01/2026");
  });

  it("atravessa o 29 de fevereiro de ano bissexto", () => {
    const s = semanaDe(new Date("2024-02-29T10:00:00-03:00"));
    expect(s.segunda).toBe("2024-02-26");
    expect(s.domingo).toBe("2024-03-03");
  });

  it("acerta o início de semana mesmo em data com horário de verão (2018)", () => {
    // Em 2018 o horário de verão voltou em 4/11 (domingo): a segunda 5/11 começou a UTC-2.
    const s = semanaDe(new Date("2018-11-07T12:00:00Z"));
    expect(s.segunda).toBe("2018-11-05");
    expect(s.inicio.toISOString()).toBe("2018-11-05T02:00:00.000Z");
  });

  it("devolve também os dias à meia-noite UTC, para os campos só-data", () => {
    expect(SEMANA_19_10.diaInicio.toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(SEMANA_19_10.diaFim.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("recusa data inválida", () => {
    expect(() => semanaDe(new Date("lixo"))).toThrow(RangeError);
  });
});

describe("semanaAnterior e semanaSeguinte", () => {
  it("andam de 7 em 7 dias, inclusive na virada do ano", () => {
    expect(semanaAnterior(SEMANA_19_10).segunda).toBe("2026-10-12");
    expect(semanaAnterior(SEMANA_19_10).domingo).toBe("2026-10-18");
    expect(semanaSeguinte(SEMANA_19_10).segunda).toBe("2026-10-26");
    const primeira = semanaDe(new Date("2027-01-04T10:00:00-03:00"));
    expect(primeira.segunda).toBe("2027-01-04");
    expect(semanaAnterior(primeira).segunda).toBe("2026-12-28");
  });

  it("a anterior termina exatamente onde a atual começa", () => {
    expect(semanaAnterior(SEMANA_19_10).fim.getTime()).toBe(SEMANA_19_10.inicio.getTime());
    expect(semanaAnterior(SEMANA_19_10).diaFim.getTime()).toBe(SEMANA_19_10.diaInicio.getTime());
  });
});

describe("hojeEmBrasilia e fotoExata", () => {
  it("o dia de Brasília, não o de UTC", () => {
    expect(hojeEmBrasilia(new Date("2026-10-23T01:30:00Z"))).toBe("2026-10-22");
    expect(hojeEmBrasilia(new Date("2026-10-23T03:00:00Z"))).toBe("2026-10-23");
  });

  it("só a semana em andamento tem foto exata", () => {
    const agora = new Date("2026-10-23T15:00:00-03:00");
    expect(fotoExata(SEMANA_19_10, agora)).toBe(true);
    expect(fotoExata(semanaAnterior(SEMANA_19_10), agora)).toBe(false);
    expect(fotoExata(semanaSeguinte(SEMANA_19_10), agora)).toBe(false);
  });
});

describe("rotuloSemana", () => {
  it("mostra o ano uma vez quando a semana está dentro do ano", () => {
    expect(rotuloSemana(SEMANA_19_10)).toBe("19/10 a 25/10/2026");
  });
});

describe("escolherSemana", () => {
  const agora = new Date("2026-10-23T15:00:00-03:00");

  it("sem valor, é a semana atual", () => {
    expect(escolherSemana(undefined, agora)).toEqual({ semana: SEMANA_19_10 });
    expect(escolherSemana("", agora).semana.segunda).toBe("2026-10-19");
    expect(escolherSemana("   ", agora).erro).toBeUndefined();
  });

  it("qualquer dia da semana escolhe a semana inteira", () => {
    expect(escolherSemana("2026-10-14", agora).semana.segunda).toBe("2026-10-12");
    expect(escolherSemana("2026-10-18", agora).semana.segunda).toBe("2026-10-12"); // domingo
    expect(escolherSemana("2026-10-12", agora).semana.segunda).toBe("2026-10-12"); // segunda
    expect(escolherSemana("2026-10-14", agora).erro).toBeUndefined();
  });

  it("aceita a lista de valores do Next (usa o primeiro)", () => {
    expect(escolherSemana(["2026-10-14", "2026-10-01"], agora).semana.segunda).toBe("2026-10-12");
  });

  it("data inválida volta para a semana atual com a mensagem", () => {
    for (const ruim of ["2026-02-30", "10/10/2026", "ontem", "2026-13-01", "1999-12-31", "2026-10-14T10:00"]) {
      const r = escolherSemana(ruim, agora);
      expect(r.semana.segunda).toBe("2026-10-19");
      expect(r.erro).toMatch(/não é válida/);
    }
  });

  it("semana futura volta para a atual com a mensagem", () => {
    const r = escolherSemana("2026-10-26", agora);
    expect(r.semana.segunda).toBe("2026-10-19");
    expect(r.erro).toMatch(/ainda não começou/);
  });

  it("dia de hoje (no fim da semana atual) é aceito", () => {
    expect(escolherSemana("2026-10-25", agora)).toEqual({ semana: SEMANA_19_10 });
  });
});

describe("calcularVariacao", () => {
  it("variação em número e em %", () => {
    expect(calcularVariacao(5, 4)).toEqual({ diferenca: 1, percentual: 25 });
    expect(calcularVariacao(4, 5)).toEqual({ diferenca: -1, percentual: -20 });
    expect(calcularVariacao(1, 3)).toEqual({ diferenca: -2, percentual: -66.7 });
  });

  it("base zero não divide por zero", () => {
    expect(calcularVariacao(3, 0)).toEqual({ diferenca: 3, percentual: null });
    expect(calcularVariacao(0, 0)).toEqual({ diferenca: 0, percentual: 0 });
    expect(calcularVariacao(0, 3)).toEqual({ diferenca: -3, percentual: -100 });
  });

  it("não deixa ruído de ponto flutuante nem zero negativo", () => {
    const v = calcularVariacao(0.1 + 0.2, 0.3);
    expect(v).toEqual({ diferenca: 0, percentual: 0 });
    expect(Object.is(v.diferenca, -0)).toBe(false);
    expect(calcularVariacao(100.1, 100)).toEqual({ diferenca: 0.1, percentual: 0.1 });
    expect(Object.is(calcularVariacao(1000, 1000.01).percentual, -0)).toBe(false);
  });
});

describe("textoVariacao", () => {
  it("escreve sinal, número e percentual", () => {
    expect(textoVariacao(calcularVariacao(5, 4))).toBe("+1 (+25%)");
    expect(textoVariacao(calcularVariacao(4, 5))).toBe("-1 (-20%)");
    expect(textoVariacao(calcularVariacao(1, 3))).toBe("-2 (-66,7%)");
  });

  it("sem variação e base zero", () => {
    expect(textoVariacao(calcularVariacao(2, 2))).toBe("sem variação");
    expect(textoVariacao(calcularVariacao(0, 0))).toBe("sem variação");
    expect(textoVariacao(calcularVariacao(3, 0))).toBe("+3 (anterior era zero)");
  });

  it("aceita um formatador de valores", () => {
    expect(textoVariacao(calcularVariacao(150, 100), (n) => `R$ ${n}`)).toBe("+R$ 50 (+50%)");
  });

  it("percentual que arredonda para zero não troca o sinal da variação", () => {
    // +R$ 1 sobre R$ 100 mil: 0,001% -> 0,0 na conta; não pode sair "+1 (-0%)".
    const sobe = calcularVariacao(100_001, 100_000);
    expect(sobe).toEqual({ diferenca: 1, percentual: 0 });
    expect(textoVariacao(sobe)).toBe("+1 (menos de 0,1%)");
    expect(textoVariacao(calcularVariacao(99_999, 100_000))).toBe("-1 (menos de 0,1%)");
    expect(textoVariacao(sobe)).not.toMatch(/\(-0|\(\+0/);
  });
});

describe("textoVariacaoComQualidade", () => {
  it("comparação exata é o texto normal", () => {
    expect(textoVariacaoComQualidade(calcularVariacao(5, 4), "exata")).toBe("+1 (+25%)");
  });

  it("contra um número mínimo (≥), a variação é só um teto: \"no máximo\"", () => {
    expect(textoVariacaoComQualidade(calcularVariacao(5, 3), "teto")).toBe("no máximo +2 (+66,7%)");
    expect(textoVariacaoComQualidade(calcularVariacao(2, 3), "teto")).toBe("no máximo -1 (-33,3%)");
    expect(textoVariacaoComQualidade(calcularVariacao(3, 3), "teto")).toBe("no máximo 0");
    expect(textoVariacaoComQualidade(calcularVariacao(3, 0), "teto")).toBe("no máximo +3 (anterior era zero)");
  });

  it("dois mínimos não se comparam", () => {
    expect(textoVariacaoComQualidade(calcularVariacao(5, 3), "inexata")).toBe("não comparável");
    expect(textoVariacaoComQualidade(calcularVariacao(0, 0), "inexata")).toBe("não comparável");
  });

  it("negociações: foto exata na semana em andamento dá teto; semana passada, inexata", () => {
    expect(qualidadeDaComparacaoDeNegociacoes(true)).toBe("teto");
    expect(qualidadeDaComparacaoDeNegociacoes(false)).toBe("inexata");
  });
});

describe("emReais", () => {
  it("arredonda ao centavo", () => {
    expect(emReais(0.1 + 0.2)).toBe(0.3);
    expect(emReais(-0.001)).toBe(0);
    expect(Object.is(emReais(-0.001), -0)).toBe(false);
  });
});

function dados(parcial: Partial<Record<(typeof CHAVES_INDICADOR)[number], [string, number][]>>): DadosDaSemana {
  const base = dadosVazios();
  const resultado = { ...base } as Record<string, ReadonlyMap<string, number>>;
  for (const [chave, pares] of Object.entries(parcial)) resultado[chave] = new Map(pares);
  return resultado as DadosDaSemana;
}

describe("montarResumo", () => {
  const anterior = semanaAnterior(SEMANA_19_10);
  const consultores = [
    { id: "v-bia", nome: "Bia Souza", ativo: true },
    { id: "v-ana", nome: "Ana Lima", ativo: true },
    { id: "v-inativo-zerado", nome: "Antigo Zerado", ativo: false },
    { id: "v-inativo-com-numero", nome: "Antigo Com Número", ativo: false },
  ];

  const resumo = montarResumo({
    semana: SEMANA_19_10,
    anterior,
    consultores,
    dadosAtual: dados({
      contatos: [["v-ana", 12], ["v-bia", 3]],
      negociacoesAtivas: [["v-ana", 4]],
      avancaram: [["v-ana", 2]],
      adesoes: [["v-bia", 1]],
      valorAderido: [["v-bia", 100_000.1]],
      comissaoLiquidada: [["v-ana", 0.1], ["v-bia", 0.2]],
      comissaoRecebida: [["v-bia", 50]],
    }),
    dadosAnterior: dados({
      contatos: [["v-ana", 10], ["v-inativo-com-numero", 2]],
      adesoes: [],
      valorAderido: [],
    }),
    liquidacoesSemPercentual: 2,
  });

  it("calcula atual, anterior e variação por consultor", () => {
    const ana = resumo.consultores.find((c) => c.consultorId === "v-ana");
    expect(ana?.atual.contatos).toBe(12);
    expect(ana?.anterior.contatos).toBe(10);
    expect(ana?.variacao.contatos).toEqual({ diferenca: 2, percentual: 20 });
    // anterior zero: sem divisão por zero.
    expect(ana?.variacao.negociacoesAtivas).toEqual({ diferenca: 4, percentual: null });
    const bia = resumo.consultores.find((c) => c.consultorId === "v-bia");
    expect(bia?.variacao.adesoes).toEqual({ diferenca: 1, percentual: null });
    expect(bia?.atual.valorAderido).toBe(100_000.1);
  });

  it("o total soma os consultores pedidos, sem ruído de centavos", () => {
    expect(resumo.total.nome).toBe("Total");
    expect(resumo.total.consultorId).toBeNull();
    expect(resumo.total.atual.contatos).toBe(15);
    expect(resumo.total.anterior.contatos).toBe(12);
    expect(resumo.total.variacao.contatos).toEqual({ diferenca: 3, percentual: 25 });
    expect(resumo.total.atual.comissaoLiquidada).toBe(0.3);
    expect(resumo.total.atual.comissaoRecebida).toBe(50);
  });

  it("lista consultores ativos e inativos com número, por ordem de nome; esconde inativo zerado", () => {
    expect(resumo.consultores.map((c) => c.nome)).toEqual(["Ana Lima", "Antigo Com Número", "Bia Souza"]);
  });

  it("repassa o aviso de liquidações sem percentual e as semanas", () => {
    expect(resumo.liquidacoesSemPercentual).toBe(2);
    expect(resumo.semana).toBe(SEMANA_19_10);
    expect(resumo.anterior).toBe(anterior);
  });

  it("sem nenhum dado, tudo zero e sem divisão por zero", () => {
    const vazio = montarResumo({
      semana: SEMANA_19_10,
      anterior,
      consultores: [{ id: "v1", nome: "Ana", ativo: true }],
      dadosAtual: dadosVazios(),
      dadosAnterior: dadosVazios(),
    });
    expect(vazio.liquidacoesSemPercentual).toBe(0);
    for (const chave of CHAVES_INDICADOR) {
      expect(vazio.total.atual[chave]).toBe(0);
      expect(vazio.total.variacao[chave]).toEqual({ diferenca: 0, percentual: 0 });
    }
    expect(vazio.consultores).toHaveLength(1);
  });

  it("ignora dados de quem não está na lista de consultores (filtro por consultor)", () => {
    const so = montarResumo({
      semana: SEMANA_19_10,
      anterior,
      consultores: [{ id: "v1", nome: "Ana", ativo: true }],
      dadosAtual: dados({ contatos: [["v1", 2], ["v2", 99]], comissaoLiquidada: [["v2", 1000]] }),
      dadosAnterior: dadosVazios(),
    });
    expect(so.total.atual.contatos).toBe(2);
    expect(so.total.atual.comissaoLiquidada).toBe(0);
    expect(so.consultores.map((c) => c.consultorId)).toEqual(["v1"]);
  });
});

describe("contarContatos", () => {
  const donos = [
    { ataId: "a1", entidadeAlvoId: "m1", vendedorId: "v1" },
    { ataId: "a1", entidadeAlvoId: "m2", vendedorId: "v2" },
    { ataId: "a2", entidadeAlvoId: "m1", vendedorId: "v2" },
  ];

  it("atribui pelo par ata + município e conta só a semana", () => {
    const interacoes = [
      { ataId: "a1", entidadeAlvoId: "m1", criadoEm: new Date("2026-10-20T10:00:00-03:00") },
      { ataId: "a1", entidadeAlvoId: "m1", criadoEm: new Date("2026-10-21T10:00:00-03:00") },
      { ataId: "a1", entidadeAlvoId: "m2", criadoEm: new Date("2026-10-22T10:00:00-03:00") },
      { ataId: "a2", entidadeAlvoId: "m1", criadoEm: new Date("2026-10-22T11:00:00-03:00") },
      // outra semana:
      { ataId: "a1", entidadeAlvoId: "m1", criadoEm: new Date("2026-10-15T10:00:00-03:00") },
    ];
    const r = contarContatos(interacoes, donos, SEMANA_19_10);
    expect(r.get("v1")).toBe(2);
    expect(r.get("v2")).toBe(2);
  });

  it("respeita as bordas da semana em Brasília", () => {
    const interacoes = [
      { ataId: "a1", entidadeAlvoId: "m1", criadoEm: new Date("2026-10-19T00:00:00-03:00") }, // segunda 00:00: dentro
      { ataId: "a1", entidadeAlvoId: "m1", criadoEm: new Date("2026-10-18T23:59:59.999-03:00") }, // domingo anterior: fora
      { ataId: "a1", entidadeAlvoId: "m1", criadoEm: new Date("2026-10-25T23:59:59.999-03:00") }, // domingo: dentro
      { ataId: "a1", entidadeAlvoId: "m1", criadoEm: new Date("2026-10-26T00:00:00-03:00") }, // segunda seguinte: fora
    ];
    expect(contarContatos(interacoes, donos, SEMANA_19_10).get("v1")).toBe(2);
    expect(contarContatos(interacoes, donos, semanaAnterior(SEMANA_19_10)).get("v1")).toBe(1);
  });

  it("registro sem ata ou sem negociação conhecida não é de ninguém", () => {
    const interacoes = [
      { ataId: null, entidadeAlvoId: "m1", criadoEm: new Date("2026-10-20T10:00:00-03:00") },
      { ataId: "a9", entidadeAlvoId: "m1", criadoEm: new Date("2026-10-20T10:00:00-03:00") },
    ];
    expect(contarContatos(interacoes, donos, SEMANA_19_10).size).toBe(0);
  });
});

describe("resumirMovimentos", () => {
  it("avançaram = em negociação + aderiu; adesões e valor só do aderiu", () => {
    const r = resumirMovimentos([
      { vendedorId: "v1", estagio: "em_negociacao", quantidade: 3, valorAderido: null },
      { vendedorId: "v1", estagio: "aderiu", quantidade: 2, valorAderido: 150_000.5 },
      { vendedorId: "v2", estagio: "aderiu", quantidade: 1, valorAderido: null },
      { vendedorId: "v2", estagio: "a_contatar", quantidade: 9, valorAderido: null },
      { vendedorId: "v2", estagio: "recusado", quantidade: 4, valorAderido: null },
    ]);
    expect(r.avancaram.get("v1")).toBe(5);
    expect(r.avancaram.get("v2")).toBe(1);
    expect(r.adesoes.get("v1")).toBe(2);
    expect(r.adesoes.get("v2")).toBe(1);
    expect(r.valorAderido.get("v1")).toBe(150_000.5);
    expect(r.valorAderido.get("v2")).toBe(0);
  });
});

describe("somarComissoes", () => {
  function liq(extra: Partial<LiquidacaoParaSomar>): LiquidacaoParaSomar {
    return {
      vendedorId: "v1",
      valorLiquidado: 100_000,
      percentualComissao: 0.05,
      dataLiquidacao: new Date("2026-10-20T00:00:00Z"),
      statusCobranca: "pendente",
      dataRecebimento: null,
      ...extra,
    };
  }

  it("comissão liquidada = valor liquidado x percentual da negociação", () => {
    const r = somarComissoes([liq({}), liq({ valorLiquidado: 40_000, percentualComissao: 0.1 })], SEMANA_19_10);
    expect(r.liquidada.get("v1")).toBeCloseTo(9000, 6);
    expect(r.recebida.size).toBe(0);
  });

  it("a data da liquidação é só-data: segunda à meia-noite UTC é da semana que começa nela", () => {
    const segunda = liq({ dataLiquidacao: new Date("2026-10-19T00:00:00Z") });
    const domingo = liq({ dataLiquidacao: new Date("2026-10-25T00:00:00Z") });
    const segundaSeguinte = liq({ dataLiquidacao: new Date("2026-10-26T00:00:00Z") });
    const sabadoAntes = liq({ dataLiquidacao: new Date("2026-10-18T00:00:00Z") });
    expect(somarComissoes([segunda, domingo], SEMANA_19_10).liquidada.get("v1")).toBeCloseTo(10_000, 6);
    expect(somarComissoes([segundaSeguinte, sabadoAntes], SEMANA_19_10).liquidada.size).toBe(0);
    expect(somarComissoes([segunda], semanaAnterior(SEMANA_19_10)).liquidada.size).toBe(0);
  });

  it("recebida usa a data de recebimento (instante) e só vale com status recebida", () => {
    const recebidaNaSemana = liq({
      dataLiquidacao: new Date("2026-09-01T00:00:00Z"),
      statusCobranca: "recebida",
      dataRecebimento: new Date("2026-10-22T10:00:00-03:00"),
    });
    const cobradaNaSemana = liq({
      statusCobranca: "cobrada",
      dataLiquidacao: new Date("2026-09-01T00:00:00Z"),
      dataRecebimento: new Date("2026-10-22T10:00:00-03:00"),
    });
    const r = somarComissoes([recebidaNaSemana, cobradaNaSemana], SEMANA_19_10);
    expect(r.recebida.get("v1")).toBeCloseTo(5000, 6);
    expect(r.liquidada.size).toBe(0);
  });

  it("recebimento nas bordas da semana em Brasília", () => {
    const base = { dataLiquidacao: new Date("2026-09-01T00:00:00Z"), statusCobranca: "recebida" };
    const domingoNoite = liq({ ...base, dataRecebimento: new Date("2026-10-25T23:59:59.999-03:00") });
    const segundaSeguinte = liq({ ...base, dataRecebimento: new Date("2026-10-26T00:00:00-03:00") });
    expect(somarComissoes([domingoNoite], SEMANA_19_10).recebida.get("v1")).toBeCloseTo(5000, 6);
    expect(somarComissoes([segundaSeguinte], SEMANA_19_10).recebida.size).toBe(0);
  });

  it("liquidada e recebida na mesma semana contam nas duas", () => {
    const r = somarComissoes(
      [liq({ statusCobranca: "recebida", dataRecebimento: new Date("2026-10-23T09:00:00-03:00") })],
      SEMANA_19_10,
    );
    expect(r.liquidada.get("v1")).toBeCloseTo(5000, 6);
    expect(r.recebida.get("v1")).toBeCloseTo(5000, 6);
  });

  it("sem percentual na negociação: não inventa comissão, só conta o aviso", () => {
    const r = somarComissoes([liq({ percentualComissao: null }), liq({})], SEMANA_19_10);
    expect(r.semPercentual).toBe(1);
    expect(r.liquidada.get("v1")).toBeCloseTo(5000, 6);
  });

  it("separa por consultor", () => {
    const r = somarComissoes([liq({ vendedorId: "v1" }), liq({ vendedorId: "v2", valorLiquidado: 200_000 })], SEMANA_19_10);
    expect(r.liquidada.get("v1")).toBeCloseTo(5000, 6);
    expect(r.liquidada.get("v2")).toBeCloseTo(10_000, 6);
  });
});
