import { describe, expect, it } from "vitest";
import { centavosDaLinha, formatarValorUnitario, temMaisDeQuatroCasas, textoDoValorUnitario } from "./valor-unitario";

const norm = (s: string) => s.replace(/\s/g, " ");

describe("textoDoValorUnitario: até quatro casas, no mínimo duas", () => {
  it.each([
    [25.9, "25.90"],
    [25, "25.00"],
    [0.1005, "0.1005"],
    [0.105, "0.105"],
    [12.34, "12.34"],
    [1234567.89, "1234567.89"],
    [0.1, "0.10"],
  ])("%s vira %s", (valor, texto) => {
    expect(textoDoValorUnitario(valor)).toBe(texto);
  });

  it("mais de quatro casas é arredondado a quatro", () => {
    expect(textoDoValorUnitario(0.10055)).toBe("0.1006");
  });
});

describe("temMaisDeQuatroCasas", () => {
  it("até quatro casas não conta; a quinta conta", () => {
    expect(temMaisDeQuatroCasas(0.1005)).toBe(false);
    expect(temMaisDeQuatroCasas(25.9)).toBe(false);
    expect(temMaisDeQuatroCasas(0.10055)).toBe(true);
  });
});

describe("formatarValorUnitario", () => {
  it("duas casas quando o preço é de centavos, quatro quando ele as tem", () => {
    expect(norm(formatarValorUnitario(25.9))).toBe("R$ 25,90");
    expect(norm(formatarValorUnitario(1234.5))).toBe("R$ 1.234,50");
    expect(norm(formatarValorUnitario(0.1005))).toBe("R$ 0,1005");
    expect(norm(formatarValorUnitario(0.105))).toBe("R$ 0,105");
  });
});

describe("centavosDaLinha: o arredondamento ao centavo é feito uma vez, no total da linha", () => {
  it("preço de centavos dá o mesmo que antes", () => {
    expect(centavosDaLinha("25.90", 10)).toBe(25900);
    expect(centavosDaLinha("0.10", 3)).toBe(30);
    expect(centavosDaLinha("1234567.89", 2)).toBe(246913578);
  });

  it("preço de quatro casas: 0,1005 x 1.000 são R$ 100,50 exatos (arredondar o unitário daria R$ 100,00)", () => {
    expect(centavosDaLinha("0.1005", 1000)).toBe(10050);
    expect(centavosDaLinha("0.1005", 1)).toBe(10); // R$ 0,1005 arredonda a R$ 0,10
    expect(centavosDaLinha("0.1005", 5)).toBe(50); // R$ 0,5025 → R$ 0,50
    expect(centavosDaLinha("0.1005", 10)).toBe(101); // R$ 1,005 → meio centavo sobe: R$ 1,01
  });

  it("não perde precisão com quantidade grande", () => {
    expect(centavosDaLinha("0.1005", 2_000_000_000)).toBe(20_100_000_000);
  });
});
