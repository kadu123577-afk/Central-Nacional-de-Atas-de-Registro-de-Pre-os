import { describe, expect, it } from "vitest";
import { dataIso, diasUteisEntre, ehDiaUtil, feriadosNacionais, somarDiasUteis } from "./dias-uteis";

/** Instante às 12h de Brasília (15h UTC) no dia pedido: longe da virada do dia em qualquer fuso. */
const meioDia = (iso: string) => new Date(`${iso}T15:00:00Z`);

describe("feriados nacionais e pontos facultativos de todo ano", () => {
  it("2026: fixos, Carnaval, Sexta-feira Santa e Corpus Christi (Páscoa em 5 de abril)", () => {
    const datas = feriadosNacionais(2026).map((f) => f.data);
    expect(datas).toEqual([
      "2026-01-01",
      "2026-02-16",
      "2026-02-17",
      "2026-04-03",
      "2026-04-21",
      "2026-05-01",
      "2026-06-04",
      "2026-09-07",
      "2026-10-12",
      "2026-11-02",
      "2026-11-15",
      "2026-11-20",
      "2026-12-25",
    ]);
  });

  it("a Sexta-feira Santa acompanha a Páscoa de cada ano", () => {
    const sexta = (ano: number) => feriadosNacionais(ano).find((f) => f.nome === "Sexta-feira Santa")?.data;
    expect(sexta(2025)).toBe("2025-04-18"); // Páscoa em 20/04
    expect(sexta(2027)).toBe("2027-03-26"); // Páscoa em 28/03
    expect(sexta(2028)).toBe("2028-04-14"); // Páscoa em 16/04
  });

  it("20 de novembro só é feriado nacional a partir de 2024", () => {
    expect(feriadosNacionais(2023).some((f) => f.data === "2023-11-20")).toBe(false);
    expect(feriadosNacionais(2024).some((f) => f.data === "2024-11-20")).toBe(true);
  });

  it("Carnaval (segunda e terça) e Corpus Christi entram sozinhos, marcados como ponto facultativo", () => {
    const lista = feriadosNacionais(2026);
    const facultativos = lista.filter((f) => f.tipo === "ponto_facultativo");
    expect(facultativos.map((f) => [f.data, f.nome])).toEqual([
      ["2026-02-16", "Carnaval (segunda-feira)"],
      ["2026-02-17", "Carnaval (terça-feira)"],
      ["2026-06-04", "Corpus Christi"],
    ]);
    expect(lista.find((f) => f.nome === "Natal")?.tipo).toBe("feriado");
  });

  it("acompanham a Páscoa de cada ano", () => {
    const de = (ano: number, nome: string) => feriadosNacionais(ano).find((f) => f.nome === nome)?.data;
    expect(de(2027, "Carnaval (terça-feira)")).toBe("2027-02-09"); // Páscoa em 28/03
    expect(de(2027, "Corpus Christi")).toBe("2027-05-27");
    expect(de(2028, "Carnaval (segunda-feira)")).toBe("2028-02-28"); // Páscoa em 16/04
    expect(de(2028, "Corpus Christi")).toBe("2028-06-15");
  });

  it("um prazo que atravessa o Carnaval conta os dois dias como sem expediente", () => {
    // Sexta 13/2/2026 + 1 dia útil: segunda 16 e terça 17 são Carnaval, então vence quarta 18.
    expect(dataIso(somarDiasUteis(meioDia("2026-02-13"), 1))).toBe("2026-02-18");
  });
});

describe("ehDiaUtil", () => {
  it("fim de semana, feriado nacional e feriado extra não são dia útil", () => {
    expect(ehDiaUtil(meioDia("2026-11-14"))).toBe(false); // sábado
    expect(ehDiaUtil(meioDia("2026-11-15"))).toBe(false); // domingo e feriado
    expect(ehDiaUtil(meioDia("2026-11-20"))).toBe(false); // sexta, Consciência Negra
    expect(ehDiaUtil(meioDia("2026-11-16"))).toBe(true); // segunda comum
    expect(ehDiaUtil(meioDia("2026-11-16"), new Set(["2026-11-16"]))).toBe(false);
  });

  it("usa o dia de Brasília, não o de UTC", () => {
    // Sexta 13/11 às 22h em Brasília = sábado 14/11 01h em UTC: ainda é sexta, dia útil.
    expect(ehDiaUtil(new Date("2026-11-14T01:00:00Z"))).toBe(true);
    // Segunda 16/11 às 01h em Brasília = segunda 04h UTC; domingo 15/11 às 23h em Brasília = segunda 02h UTC: domingo.
    expect(ehDiaUtil(new Date("2026-11-16T02:00:00Z"))).toBe(false);
  });
});

describe("dataIso", () => {
  it("devolve o dia de Brasília", () => {
    expect(dataIso(new Date("2026-11-14T01:00:00Z"))).toBe("2026-11-13");
    expect(dataIso(new Date("2026-11-14T03:00:00Z"))).toBe("2026-11-14");
  });
});

describe("somarDiasUteis", () => {
  it("10 dias úteis a partir de segunda 9/11/2026 pulam o fim de semana e o feriado de 20/11", () => {
    expect(somarDiasUteis(meioDia("2026-11-09"), 10).toISOString()).toBe("2026-11-24T15:00:00.000Z");
  });

  it("o dia do começo não conta: 1 dia útil a partir da sexta é a segunda", () => {
    expect(dataIso(somarDiasUteis(meioDia("2026-11-06"), 1))).toBe("2026-11-09");
  });

  it("começando num sábado, 1 dia útil é a segunda", () => {
    expect(dataIso(somarDiasUteis(meioDia("2026-11-07"), 1))).toBe("2026-11-09");
  });

  it("o vencimento nunca cai em dia sem expediente", () => {
    for (let dias = 1; dias <= 30; dias++) {
      expect(ehDiaUtil(somarDiasUteis(meioDia("2026-12-18"), dias))).toBe(true);
    }
  });

  it("feriados extras empurram o prazo", () => {
    const extras = new Set(["2026-11-10", "2026-11-11"]);
    // 9/11 + 1 d.u.: 10 e 11 são feriados extras, então vence quinta 12/11.
    expect(dataIso(somarDiasUteis(meioDia("2026-11-09"), 1, extras))).toBe("2026-11-12");
  });

  it("zero dias devolve o próprio instante", () => {
    const d = meioDia("2026-11-14");
    expect(somarDiasUteis(d, 0).getTime()).toBe(d.getTime());
  });

  it("recusa dias negativos ou fracionados", () => {
    expect(() => somarDiasUteis(meioDia("2026-11-09"), -1)).toThrow(RangeError);
    expect(() => somarDiasUteis(meioDia("2026-11-09"), 1.5)).toThrow(RangeError);
  });

  it("mantém a hora do instante de partida", () => {
    const inicio = new Date("2026-11-09T18:45:30.000Z");
    expect(somarDiasUteis(inicio, 5).toISOString().slice(10)).toBe("T18:45:30.000Z");
  });
});

describe("diasUteisEntre", () => {
  it("conta só os dias úteis depois do começo até o fim, inclusive", () => {
    expect(diasUteisEntre(meioDia("2026-11-09"), meioDia("2026-11-24"))).toBe(10);
    expect(diasUteisEntre(meioDia("2026-11-09"), meioDia("2026-11-09"))).toBe(0);
  });

  it("é o inverso de somarDiasUteis", () => {
    const inicio = meioDia("2026-11-09");
    for (const n of [1, 2, 5, 10, 15, 30]) {
      expect(diasUteisEntre(inicio, somarDiasUteis(inicio, n))).toBe(n);
    }
  });

  it("negativo quando o fim já passou", () => {
    expect(diasUteisEntre(meioDia("2026-11-24"), meioDia("2026-11-09"))).toBe(-10);
  });
});
