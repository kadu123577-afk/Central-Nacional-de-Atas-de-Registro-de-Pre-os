import { describe, expect, it } from "vitest";
import {
  limitePorOrgao,
  limiteAgregado,
  saldoAgregadoDisponivel,
  verificarAdesao,
} from "./saldo";

describe("limitePorOrgao", () => {
  it("é 50% da quantidade registrada", () => {
    expect(limitePorOrgao(1000)).toBe(500);
    expect(limitePorOrgao(37)).toBe(18.5);
  });
});

describe("limiteAgregado", () => {
  it("é o dobro da quantidade registrada", () => {
    expect(limiteAgregado(1000)).toBe(2000);
  });
});

describe("saldoAgregadoDisponivel", () => {
  it("desconta o que já foi consumido do limite agregado", () => {
    expect(saldoAgregadoDisponivel(1000, 400)).toBe(1600);
    expect(saldoAgregadoDisponivel(1000, 2000)).toBe(0);
  });
});

describe("verificarAdesao", () => {
  it("recusa pedido de um único órgão acima de 50% da quantidade registrada", () => {
    // ata com 1000 unidades; órgão tenta 60% (600) de uma vez
    const resultado = verificarAdesao(1000, 0, 0, 600);
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivo).toBe("LIMITE_POR_ORGAO_EXCEDIDO");
  });

  it("recusa pedido que, somado ao que o próprio órgão já aderiu, ultrapassa 50%", () => {
    // órgão já aderiu 400 de 1000; novo pedido de 200 estouraria os 500 permitidos
    const resultado = verificarAdesao(1000, 400, 400, 200);
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivo).toBe("LIMITE_POR_ORGAO_EXCEDIDO");
  });

  it("aceita pedido de exatamente 50% da quantidade registrada", () => {
    const resultado = verificarAdesao(1000, 0, 0, 500);
    expect(resultado.permitido).toBe(true);
  });

  it("aceita pedido dentro do limite individual e do saldo agregado", () => {
    const resultado = verificarAdesao(1000, 0, 0, 400);
    expect(resultado.permitido).toBe(true);
    expect(resultado.saldoAgregadoDisponivel).toBe(2000);
  });

  it("recusa pedido que respeita o limite por órgão mas estoura o teto agregado do dobro", () => {
    // ata de 1000: teto agregado é 2000. Já foram consumidos 1900 por outros
    // órgãos. Um novo órgão (que nunca aderiu) pede 400 — dentro dos 50%
    // individuais (500), mas só sobram 100 no agregado.
    const resultado = verificarAdesao(1000, 1900, 0, 400);
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivo).toBe("LIMITE_AGREGADO_EXCEDIDO");
  });

  it("aceita pedido que consome exatamente o saldo agregado restante", () => {
    const resultado = verificarAdesao(1000, 1900, 0, 100);
    expect(resultado.permitido).toBe(true);
    expect(resultado.saldoAgregadoDisponivel).toBe(100);
  });

  it("recusa qualquer pedido quando o saldo agregado já está zerado", () => {
    const resultado = verificarAdesao(1000, 2000, 0, 1);
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivo).toBe("LIMITE_AGREGADO_EXCEDIDO");
  });
});
