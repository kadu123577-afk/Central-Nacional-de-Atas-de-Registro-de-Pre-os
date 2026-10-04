import { describe, expect, it } from "vitest";
import {
  CARGO_ADMINISTRACAO,
  CARGO_EDUCACAO,
  CARGO_PREFEITO,
  CARGO_SAUDE,
  escolherDecisorPrincipal,
  ordemCargos,
  ordenarDecisores,
} from "./decisores";

const c = (cargo: string, telefone: string | null = null, email: string | null = null) => ({ cargo, telefone, email });

describe("ordemCargos", () => {
  it("educação primeiro para categorias escolares", () => {
    expect(ordemCargos("kit-escolar")[0]).toBe(CARGO_EDUCACAO);
    expect(ordemCargos("merenda-escolar")[0]).toBe(CARGO_EDUCACAO);
  });

  it("saúde primeiro para hospitalar", () => {
    expect(ordemCargos("material-hospitalar")[0]).toBe(CARGO_SAUDE);
  });

  it("administração por padrão e prefeito sempre por último", () => {
    const ordem = ordemCargos("veiculos");
    expect(ordem[0]).toBe(CARGO_ADMINISTRACAO);
    expect(ordem[ordem.length - 1]).toBe(CARGO_PREFEITO);
    expect(ordemCargos(null)[0]).toBe(CARGO_ADMINISTRACAO);
  });
});

describe("escolherDecisorPrincipal", () => {
  it("sem contatos", () => {
    expect(escolherDecisorPrincipal([], "veiculos")).toEqual({ principal: null, semCanal: true });
  });

  it("pega o primeiro da ordem que tem canal", () => {
    const adm = c(CARGO_ADMINISTRACAO);
    const pref = c(CARGO_PREFEITO, "(62) 3000-0000");
    const r = escolherDecisorPrincipal([pref, adm], "veiculos");
    expect(r.principal).toBe(pref);
    expect(r.semCanal).toBe(false);
  });

  it("ninguém com canal: primeiro da ordem, marcado sem canal", () => {
    const adm = c(CARGO_ADMINISTRACAO);
    const pref = c(CARGO_PREFEITO);
    const r = escolherDecisorPrincipal([pref, adm], "veiculos");
    expect(r.principal).toBe(adm);
    expect(r.semCanal).toBe(true);
  });
});

describe("ordenarDecisores", () => {
  it("mesmo cargo: quem tem canal vem antes", () => {
    const sem = c(CARGO_SAUDE);
    const com = c(CARGO_SAUDE, null, "a@b.gov.br");
    expect(ordenarDecisores([sem, com], "material-hospitalar")[0]).toBe(com);
  });
});
