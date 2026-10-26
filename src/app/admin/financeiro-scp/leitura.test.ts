import { describe, expect, it } from "vitest";
import {
  campoBruto,
  centavosParaCampo,
  diaCampo,
  diaTexto,
  escolherMes,
  fracaoParaCampo,
  idComFormaDeCuid,
  lerDespesa,
  mesVizinho,
  normalizarTexto,
  rotuloDoMes,
  textoDoMes,
} from "./leitura";
import { periodoMensal } from "@/lib/financeiro-scp";

/** Só valores fictícios de teste. */
const ID_SOCIO = "csocioaaaaaaaaaaaaaaaaaa";

const DESPESA_VALIDA = {
  data: "2026-11-05",
  descricao: "Despesa de teste",
  categoria: "",
  valor: "1.234,56",
  pagaPorSocioId: "",
};

describe("escolherMes", () => {
  // 26/10/2026 ao meio-dia em Brasília.
  const AGORA = new Date("2026-10-26T15:00:00Z");

  it("sem ?mes= usa o mês atual de Brasília, sem aviso", () => {
    const r = escolherMes(undefined, AGORA);
    expect(r.texto).toBe("2026-10");
    expect(r.erro).toBeUndefined();
    expect(r.periodo.inicio.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r.periodo.fim.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("o mês atual é o de Brasília: 31/10 às 23h em Brasília ainda é outubro (01h UTC de novembro)", () => {
    expect(escolherMes(undefined, new Date("2026-11-01T02:00:00Z")).texto).toBe("2026-10");
    expect(escolherMes(undefined, new Date("2026-11-01T03:00:00Z")).texto).toBe("2026-11");
  });

  it("vazio ou só espaços também é o mês atual, sem aviso", () => {
    expect(escolherMes("   ", AGORA).texto).toBe("2026-10");
    expect(escolherMes("", AGORA).erro).toBeUndefined();
  });

  it("mês válido é respeitado (inclusive ano bissexto)", () => {
    expect(escolherMes("2026-07", AGORA).texto).toBe("2026-07");
    const fevereiro = escolherMes("2028-02", AGORA);
    expect(fevereiro.periodo.fim.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(fevereiro.erro).toBeUndefined();
  });

  it.each(["2026-13", "2026-00", "1999-12", "2101-01", "abc", "2026-7", "2026-07-15", "07/2026", "2026-07; DROP"])(
    "mês inválido %j cai no mês atual e avisa",
    (bruto) => {
      const r = escolherMes(bruto, AGORA);
      expect(r.texto).toBe("2026-10");
      expect(r.erro).toMatch(/Mês inválido/);
    },
  );

  it("parâmetro repetido (?mes=a&mes=b): vale o primeiro", () => {
    expect(escolherMes(["2026-03", "2026-04"], AGORA).texto).toBe("2026-03");
    expect(escolherMes(["lixo", "2026-04"], AGORA).erro).toMatch(/Mês inválido/);
  });

  it("não repete o texto digitado no aviso (nada da URL volta para a tela)", () => {
    expect(escolherMes("<script>alert(1)</script>", AGORA).erro).not.toContain("script");
  });
});

describe("mês: texto, rótulo e vizinhos", () => {
  const outubro = periodoMensal(2026, 10)!;

  it("textoDoMes e rotuloDoMes", () => {
    expect(textoDoMes(outubro)).toBe("2026-10");
    expect(rotuloDoMes(outubro)).toBe("outubro de 2026");
    expect(rotuloDoMes(periodoMensal(2026, 3)!)).toBe("março de 2026");
  });

  it("os 12 nomes de mês, em ordem", () => {
    const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    nomes.forEach((nome, i) => expect(rotuloDoMes(periodoMensal(2026, i + 1)!)).toBe(`${nome} de 2026`));
  });

  it("mesVizinho vira o ano nas duas pontas e para nos limites de 2000 e 2100", () => {
    expect(textoDoMes(mesVizinho(outubro, 1)!)).toBe("2026-11");
    expect(textoDoMes(mesVizinho(periodoMensal(2026, 12)!, 1)!)).toBe("2027-01");
    expect(textoDoMes(mesVizinho(periodoMensal(2026, 1)!, -1)!)).toBe("2025-12");
    expect(mesVizinho(periodoMensal(2000, 1)!, -1)).toBeNull();
    expect(mesVizinho(periodoMensal(2100, 12)!, 1)).toBeNull();
  });
});

describe("textos de apoio", () => {
  it("idComFormaDeCuid recusa o que não parece id", () => {
    expect(idComFormaDeCuid(ID_SOCIO)).toBe(true);
    for (const ruim of ["", "abc", "x'; DROP TABLE socios_scp;--", "CSOCIOAAAAAAAAAAAAAAAAAA", "csocio aaaaaaaaaaaaaaaaa"]) {
      expect(idComFormaDeCuid(ruim)).toBe(false);
    }
  });

  it("campoBruto devolve vazio para arquivo e para campo ausente", () => {
    const f = new FormData();
    f.set("a", "texto");
    f.set("b", new File(["x"], "x.txt"));
    expect(campoBruto(f, "a")).toBe("texto");
    expect(campoBruto(f, "b")).toBe("");
    expect(campoBruto(f, "c")).toBe("");
  });

  it("normalizarTexto junta espaços, tira controle e apara", () => {
    expect(normalizarTexto("  uma \n  linha\t só\u0000 ")).toBe("uma linha só");
  });

  it("dia só-data vira texto e campo sem deslocar o dia", () => {
    const dia = new Date("2026-11-05T00:00:00.000Z");
    expect(diaTexto(dia)).toBe("05/11/2026");
    expect(diaCampo(dia)).toBe("2026-11-05");
  });

  it("centavosParaCampo e fracaoParaCampo repõem o que o campo aceita de volta", () => {
    expect(centavosParaCampo(123456)).toBe("1234,56");
    expect(centavosParaCampo(5)).toBe("0,05");
    expect(centavosParaCampo(100)).toBe("1,00");
    expect(fracaoParaCampo(0.6)).toBe("60");
    expect(fracaoParaCampo(0.3333)).toBe("33,33");
    expect(fracaoParaCampo(0.0001)).toBe("0,01");
  });
});

describe("lerDespesa", () => {
  it("lê uma despesa válida: data só-dia, centavos exatos, categoria e sócio nulos quando vazios", () => {
    const r = lerDespesa(DESPESA_VALIDA);
    expect(r).toEqual({
      ok: true,
      despesa: {
        data: new Date("2026-11-05T00:00:00.000Z"),
        descricao: "Despesa de teste",
        categoria: null,
        centavos: 123456,
        pagaPorSocioId: null,
      },
    });
  });

  it("normaliza descrição e categoria, e aceita o sócio com forma de id", () => {
    const r = lerDespesa({ ...DESPESA_VALIDA, descricao: "  duas   palavras ", categoria: " Cat  X ", pagaPorSocioId: ` ${ID_SOCIO} ` });
    expect(r.ok && r.despesa).toMatchObject({ descricao: "duas palavras", categoria: "Cat X", pagaPorSocioId: ID_SOCIO });
  });

  it.each([
    ["valor zero", { valor: "0" }, /maior que zero/],
    ["valor zero com centavos", { valor: "0,00" }, /maior que zero/],
    ["valor negativo", { valor: "-10" }, /Valor inválido/],
    ["valor ilegível", { valor: "dez reais" }, /Valor inválido/],
    ["valor com 3 casas", { valor: "10,555" }, /Valor inválido/],
    ["valor vazio", { valor: "  " }, /Informe o valor/],
    ["valor de R$ 100 bilhões", { valor: "100.000.000.000,00" }, /grande demais/],
    ["data inexistente (30/02)", { data: "2026-02-30" }, /data válida/],
    ["data em outro formato", { data: "05/11/2026" }, /data válida/],
    ["data vazia", { data: "" }, /data válida/],
    ["ano antes de 2000", { data: "1999-12-31" }, /data válida/],
    ["ano depois de 2100", { data: "2101-01-01" }, /data válida/],
    ["descrição vazia", { descricao: "   " }, /Descreva/],
    ["descrição de 201 caracteres", { descricao: "x".repeat(201) }, /limite é 200/],
    ["categoria de 61 caracteres", { categoria: "x".repeat(61) }, /categoria tem 61/],
    ["sócio com cara de injeção", { pagaPorSocioId: "x'; DROP--" }, /Sócio inválido/],
  ])("%s é recusado", (_nome, extra, mensagem) => {
    const r = lerDespesa({ ...DESPESA_VALIDA, ...extra });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(mensagem);
  });

  it("os limites passam: descrição de 200, categoria de 60, valor de R$ 0,01 e de R$ 99.999.999.999,99", () => {
    expect(lerDespesa({ ...DESPESA_VALIDA, descricao: "x".repeat(200), categoria: "y".repeat(60) }).ok).toBe(true);
    expect(lerDespesa({ ...DESPESA_VALIDA, valor: "0,01" })).toMatchObject({ ok: true, despesa: { centavos: 1 } });
    expect(lerDespesa({ ...DESPESA_VALIDA, valor: "99.999.999.999,99" })).toMatchObject({
      ok: true,
      despesa: { centavos: 9_999_999_999_999 },
    });
  });
});
