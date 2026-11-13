import { describe, expect, it } from "vitest";
import {
  MENSAGEM_AGUARDANDO_LIBERACAO,
  MENSAGEM_CONTA_DESATIVADA,
  lerCnpjDoCadastro,
  mensagemDeContaInativa,
  variantesDoCnpj,
} from "./cadastro-publico";

describe("lerCnpjDoCadastro", () => {
  it("aceita CNPJ com ou sem máscara e devolve os 14 dígitos", () => {
    expect(lerCnpjDoCadastro("12.345.678/0001-95")).toEqual({ ok: true, digitos: "12345678000195" });
    expect(lerCnpjDoCadastro(" 12345678000195 ")).toEqual({ ok: true, digitos: "12345678000195" });
  });

  it.each(["12.345.678/0001-96", "123.456.789-09", "00000000000000", "11111111111111", "", "abc", "1234"])("recusa %j", (texto) => {
    expect(lerCnpjDoCadastro(texto)).toMatchObject({ ok: false });
  });
});

describe("variantesDoCnpj", () => {
  it("devolve a forma só com dígitos e a mascarada, que são as duas que existem no banco", () => {
    expect(variantesDoCnpj("12345678000195")).toEqual(["12345678000195", "12.345.678/0001-95"]);
  });
});

describe("mensagemDeContaInativa", () => {
  it("separa cadastro aguardando liberação de conta desativada", () => {
    expect(mensagemDeContaInativa(true)).toBe(MENSAGEM_AGUARDANDO_LIBERACAO);
    expect(mensagemDeContaInativa(false)).toBe(MENSAGEM_CONTA_DESATIVADA);
  });
});
