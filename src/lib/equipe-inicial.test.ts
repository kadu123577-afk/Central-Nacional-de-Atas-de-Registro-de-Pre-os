import { describe, expect, it } from "vitest";
import { lerEquipeInicial } from "./equipe-inicial";

describe("lerEquipeInicial", () => {
  it("lê equipe interna (por permissões ou por perfil) e consultor", () => {
    const { contas, problemas } = lerEquipeInicial([
      { nome: "Fulana", email: "Fulana@Exemplo.com.br", cargo: "Captação", permissoes: ["atas.captar", "adesao.registrar"] },
      { nome: "Beltrano", email: "beltrano@exemplo.com.br", perfil: "estagiario" },
      { tipo: "consultor", nome: "Ciclana", email: "ciclana@exemplo.com.br" },
    ]);
    expect(problemas).toEqual([]);
    expect(contas).toEqual([
      { tipo: "equipe", nome: "Fulana", email: "fulana@exemplo.com.br", cargo: "Captação", permissoes: ["atas.captar", "adesao.registrar"] },
      { tipo: "equipe", nome: "Beltrano", email: "beltrano@exemplo.com.br", cargo: null, permissoes: ["atas.itens", "adesao.registrar"] },
      { tipo: "consultor", nome: "Ciclana", email: "ciclana@exemplo.com.br", tipoVendedor: "interno" },
    ]);
  });

  it("o e-mail vai para minúsculas e as permissões saem limpas, na ordem da tabela e sem repetição", () => {
    const { contas } = lerEquipeInicial([{ nome: "A", email: "A@B.CO", permissoes: ["adesao.registrar", "atas.captar", "atas.captar"] }]);
    expect(contas[0]).toMatchObject({ email: "a@b.co", permissoes: ["atas.captar", "adesao.registrar"] });
  });

  it.each([
    ["não é lista", {}],
    ["lista vazia", []],
  ])("recusa o arquivo que %s", (_n, json) => {
    expect(lerEquipeInicial(json).problemas).toHaveLength(1);
  });

  it("aponta cada problema com o número da pessoa, sem parar no primeiro", () => {
    const { contas, problemas } = lerEquipeInicial([
      { nome: "", email: "x@y.com", permissoes: ["atas.captar"] },
      { nome: "Sem e-mail", email: "invalido", permissoes: ["atas.captar"] },
      { nome: "Permissão errada", email: "p@y.com", permissoes: ["atas.inexistente"] },
      { nome: "Perfil errado", email: "q@y.com", perfil: "diretor" },
      { nome: "Sem nada", email: "r@y.com" },
      { nome: "Lista vazia", email: "s@y.com", permissoes: [] },
      { nome: "Tipo errado", email: "t@y.com", tipo: "visitante", permissoes: ["atas.captar"] },
      { tipo: "consultor", nome: "Vendedor", email: "v@y.com", tipoVendedor: "terceiro" },
      "lixo",
    ]);
    expect(contas).toEqual([]);
    expect(problemas.map((p) => p.slice(0, 9))).toEqual([
      "Pessoa 1:",
      "Pessoa 2 ",
      "Pessoa 3 ",
      "Pessoa 4 ",
      "Pessoa 5 ",
      "Pessoa 6 ",
      "Pessoa 7 ",
      "Pessoa 8 ",
      "Pessoa 9:",
    ]);
  });

  it("e-mail repetido na lista é problema (a segunda conta nunca seria criada)", () => {
    const { problemas } = lerEquipeInicial([
      { nome: "A", email: "a@b.co", permissoes: ["atas.captar"] },
      { nome: "B", email: "A@B.co", permissoes: ["atas.captar"] },
    ]);
    expect(problemas).toEqual(["Pessoa 2 (B): e-mail repetido na lista."]);
  });
});
