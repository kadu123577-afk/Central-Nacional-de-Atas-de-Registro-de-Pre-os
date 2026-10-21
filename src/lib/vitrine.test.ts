import { describe, expect, it } from "vitest";
import { percentualSaldo, percentualSaldoItem, UFS } from "./vitrine";

describe("percentualSaldo", () => {
  it("ata sem consumo tem 100% de saldo", () => {
    expect(percentualSaldo([{ quantidadeRegistrada: 100, saldo: null }])).toBe(100);
  });

  it("mede o consumo contra o teto agregado (o dobro do registrado)", () => {
    // teto = 200; consumido 50 → sobram 150 = 75%
    expect(percentualSaldoItem({ quantidadeRegistrada: 100, saldo: { quantidadeConsumida: 50 } })).toBe(75);
  });

  it("soma os itens pelo peso da quantidade, não pela média simples", () => {
    const itens = [
      { quantidadeRegistrada: 100, saldo: { quantidadeConsumida: 200 } }, // teto 200, esgotado
      { quantidadeRegistrada: 300, saldo: { quantidadeConsumida: 0 } }, // teto 600, livre
    ];
    expect(percentualSaldo(itens)).toBe(75);
  });

  it("nunca fica negativo quando o consumo passa do teto", () => {
    expect(percentualSaldo([{ quantidadeRegistrada: 10, saldo: { quantidadeConsumida: 50 } }])).toBe(0);
  });

  it("devolve nulo sem item com quantidade", () => {
    expect(percentualSaldo([])).toBeNull();
    expect(percentualSaldo([{ quantidadeRegistrada: 0, saldo: null }])).toBeNull();
  });
});

describe("UFS", () => {
  it("tem as 27 unidades da federação, sem repetição", () => {
    expect(new Set(UFS).size).toBe(27);
  });
});
