import { describe, expect, it } from "vitest";
import {
  calcularRegistroDeAdesao,
  centavosDoValor,
  formatarReaisDeCentavos,
  lerQuantidadesDoFormulario,
  type ItemParaRegistro,
} from "./registrar-adesao";

function item(extra: Partial<ItemParaRegistro> = {}): ItemParaRegistro {
  return {
    itemId: "i1",
    descricao: "Papel sulfite A4",
    unidade: "Caixa",
    quantidadeRegistrada: 1000,
    valorUnitario: "25.90",
    consumidoNoTotal: 0,
    consumidoPeloMunicipio: 0,
    ...extra,
  };
}

describe("valores em centavos", () => {
  it("conta em centavos inteiros, sem erro de ponto flutuante", () => {
    expect(centavosDoValor("25.90")).toBe(2590);
    expect(centavosDoValor("0.10")).toBe(10);
    expect(centavosDoValor("1234567.89")).toBe(123456789);
    expect(formatarReaisDeCentavos(2590 * 100)).toBe("R$ 2.590,00");
  });
});

describe("lerQuantidadesDoFormulario", () => {
  const itens = [
    { itemId: "i1", descricao: "Papel" },
    { itemId: "i2", descricao: "Caneta" },
    { itemId: "i3", descricao: "Lápis" },
  ];

  it("só entram os itens com quantidade; vazio e zero ficam de fora", () => {
    const f = new FormData();
    f.set("qtd_i1", "100");
    f.set("qtd_i2", "");
    f.set("qtd_i3", "0");
    const { pedidos, erros } = lerQuantidadesDoFormulario(f, itens);
    expect([...pedidos]).toEqual([["i1", 100]]);
    expect(erros).toEqual([]);
  });

  it("aceita ponto de milhar e recusa decimal, negativo e texto (nunca arredonda)", () => {
    const f = new FormData();
    f.set("qtd_i1", "1.500");
    f.set("qtd_i2", "2,5");
    f.set("qtd_i3", "-4");
    const { pedidos, erros } = lerQuantidadesDoFormulario(f, itens);
    expect([...pedidos]).toEqual([["i1", 1500]]);
    expect(erros).toHaveLength(2);
  });

  it("campo que veio como arquivo não conta", () => {
    const f = new FormData();
    f.set("qtd_i1", new File(["5"], "x.txt"));
    expect(lerQuantidadesDoFormulario(f, itens).pedidos.size).toBe(0);
  });
});

describe("calcularRegistroDeAdesao", () => {
  it("dentro dos limites: soma o valor em centavos por item e no total", () => {
    const r = calcularRegistroDeAdesao(
      [item(), item({ itemId: "i2", descricao: "Caneta", valorUnitario: "1.50" })],
      new Map([["i1", 100], ["i2", 400]]),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.linhas).toEqual([
        { itemId: "i1", descricao: "Papel sulfite A4", quantidade: 100, valorCentavos: 259000 },
        { itemId: "i2", descricao: "Caneta", quantidade: 400, valorCentavos: 60000 },
      ]);
      expect(r.valorTotalCentavos).toBe(319000);
    }
  });

  it("sem nenhum item pedido", () => {
    expect(calcularRegistroDeAdesao([item()], new Map())).toEqual({
      ok: false,
      erros: ["Informe a quantidade aderida de pelo menos um item."],
    });
  });

  it("50% por órgão: exatamente no limite passa, uma unidade a mais não", () => {
    expect(calcularRegistroDeAdesao([item()], new Map([["i1", 500]])).ok).toBe(true);
    const r = calcularRegistroDeAdesao([item()], new Map([["i1", 501]]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros[0]).toContain("no máximo 500 (50% do registrado)");
  });

  it("o que o município já aderiu antes conta no limite de 50%", () => {
    const r = calcularRegistroDeAdesao([item({ consumidoPeloMunicipio: 450 })], new Map([["i1", 100]]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros[0]).toContain("restam 50");
  });

  it("200% no total: o consumo de todos os órgãos limita, mesmo dentro dos 50% do município", () => {
    const r = calcularRegistroDeAdesao([item({ consumidoNoTotal: 1950 })], new Map([["i1", 100]]));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erros[0]).toContain("200% do registrado");
      expect(r.erros[0]).toContain("restam 50");
    }
  });

  it("junta os erros de todos os itens em vez de parar no primeiro", () => {
    const r = calcularRegistroDeAdesao(
      [item(), item({ itemId: "i2", descricao: "Caneta" })],
      new Map([["i1", 999], ["i2", 999]]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros).toHaveLength(2);
  });

  it("pedido para item que não é da ata é recusado", () => {
    const r = calcularRegistroDeAdesao([item()], new Map([["i1", 10], ["outro", 5]]));
    expect(r).toEqual({ ok: false, erros: ["Há um item que não pertence a esta ata."] });
  });
});
