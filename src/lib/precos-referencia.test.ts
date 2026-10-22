import { describe, expect, it } from "vitest";
import {
  agruparPorUnidade,
  chaveUnidade,
  codigoCatalogoValido,
  dedupePorIdItemCompra,
  escolherGrupoDeUnidade,
  janelaDaAmostra,
  janelaDeDatas,
  lerPaginaDaApi,
  mensagemCurtaDeErro,
  normalizarUnidade,
  pareceCodigoDeServico,
  precisaConsultar,
  registroParaAmostra,
  rotuloUnidade,
  separarChave,
  siglaDaUnidadeDoItem,
  unidadeMaisComum,
  urlPrecoMaterial,
  urlPrecoServico,
  type AmostraRegistro,
} from "./precos-referencia";
import { estatisticasDePrecos } from "./vantajosidade";

/** Registro como a API devolve (campos que importam; idCompra passa de 2^53 e não é lido). */
function registro(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    precoUnitario: 0.7,
    quantidade: 100,
    dataCompra: "2026-03-10T00:00:00",
    estado: "GO",
    siglaUnidadeFornecimento: "UN",
    nomeUnidadeFornecimento: "UNIDADE",
    capacidadeUnidadeFornecimento: 1,
    codigoItemCatalogo: 631014,
    idItemCompra: 123456789,
    idCompraItem: "92500005900052026-00001",
    idCompra: 92500005900052026,
    ...extra,
  };
}

function amostra(preco: number, chave: string, id: string | null = null): AmostraRegistro {
  return { valorUnitario: preco, chaveUnidade: chave, idItemCompra: id };
}

describe("codigoCatalogoValido", () => {
  it("aceita só dígitos, com ou sem espaços nas pontas", () => {
    expect(codigoCatalogoValido("631014")).toBe("631014");
    expect(codigoCatalogoValido(" 25089 ")).toBe("25089");
    expect(codigoCatalogoValido(3670)).toBe("3670");
    expect(codigoCatalogoValido("1234567890")).toBe("1234567890");
  });

  it("tira zeros à esquerda (mesmo código digitado de dois jeitos)", () => {
    expect(codigoCatalogoValido("000123")).toBe("123");
  });

  it("recusa vazio, letras, sinais e códigos longos demais", () => {
    for (const ruim of ["", "  ", "12a", "-5", "1.5", "1e3", "12345678901", "0", "000", null, undefined, 0, -1, 1.5, {}]) {
      expect(codigoCatalogoValido(ruim)).toBeNull();
    }
  });
});

describe("janelaDeDatas", () => {
  it("12 meses até hoje", () => {
    expect(janelaDeDatas(new Date(2026, 9, 22, 12))).toEqual({ inicio: "2025-10-22", fim: "2026-10-22" });
  });

  it("aceita outra quantidade de meses", () => {
    expect(janelaDeDatas(new Date(2026, 9, 22, 12), 6)).toEqual({ inicio: "2026-04-22", fim: "2026-10-22" });
    expect(janelaDeDatas(new Date(2026, 0, 15, 12), 3)).toEqual({ inicio: "2025-10-15", fim: "2026-01-15" });
  });

  it("dia que não existe no mês de início vira o último dia do mês", () => {
    expect(janelaDeDatas(new Date(2026, 2, 31, 12), 1)).toEqual({ inicio: "2026-02-28", fim: "2026-03-31" });
    // 29 de fevereiro de 2028 menos 12 meses: 2027 não é bissexto.
    expect(janelaDeDatas(new Date(2028, 1, 29, 12))).toEqual({ inicio: "2027-02-28", fim: "2028-02-29" });
  });

  it("quantidade de meses inválida volta ao padrão e data inválida lança erro", () => {
    expect(janelaDeDatas(new Date(2026, 9, 22, 12), Number.NaN).inicio).toBe("2025-10-22");
    expect(janelaDeDatas(new Date(2026, 9, 22, 12), 0).inicio).toBe("2026-09-22");
    expect(() => janelaDeDatas(new Date("lixo"))).toThrow();
    // Fora do calendário: erro claro, não "NaN-NaN-NaN" numa consulta.
    expect(() => janelaDeDatas(new Date(2026, 9, 22, 12), 1e9)).toThrow(/calendário/);
  });
});

describe("URLs", () => {
  const base = { codigo: "631014", inicio: "2025-10-22", fim: "2026-10-22" };

  it("material: tipo + codigo + janela + paginação", () => {
    const url = urlPrecoMaterial({ ...base, pagina: 2, tamanhoPagina: 500 });
    expect(url).toBe(
      "https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial?tipo=codigoItemCatalogo&codigo=631014&dataCompraInicio=2025-10-22&dataCompraFim=2026-10-22&pagina=2&tamanhoPagina=500",
    );
  });

  it("serviço: codigoItemCatalogo, sem tipo nem codigo", () => {
    const url = urlPrecoServico({ ...base, codigo: 25089 });
    expect(url).toBe(
      "https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/3_consultarServico?codigoItemCatalogo=25089&dataCompraInicio=2025-10-22&dataCompraFim=2026-10-22&pagina=1&tamanhoPagina=500",
    );
    expect(url).not.toContain("tipo=");
    expect(url).not.toContain("codigo=");
  });

  it("padrões, limites da página e filtro de estado", () => {
    expect(urlPrecoMaterial(base)).toContain("pagina=1&tamanhoPagina=500");
    expect(urlPrecoMaterial({ ...base, tamanhoPagina: 5000 })).toContain("tamanhoPagina=500");
    expect(urlPrecoMaterial({ ...base, tamanhoPagina: 1 })).toContain("tamanhoPagina=10");
    expect(urlPrecoMaterial({ ...base, pagina: 0 })).toContain("pagina=1");
    expect(urlPrecoMaterial({ ...base, estado: "go" })).toMatch(/&estado=GO$/);
    expect(urlPrecoMaterial({ ...base, estado: "" })).not.toContain("estado");
  });

  it("aceita Date nas datas e tira zeros à esquerda do código", () => {
    const url = urlPrecoMaterial({ codigo: "000123", inicio: new Date(2025, 9, 22, 12), fim: new Date(2026, 9, 22, 12) });
    expect(url).toContain("codigo=123&");
    expect(url).toContain("dataCompraInicio=2025-10-22&dataCompraFim=2026-10-22");
  });

  it("recusa código, data ou estado inválidos (nada de montar consulta ampla por engano)", () => {
    expect(() => urlPrecoMaterial({ ...base, codigo: "12&x=1" })).toThrow(/Código/);
    expect(() => urlPrecoMaterial({ ...base, codigo: "" })).toThrow();
    expect(() => urlPrecoMaterial({ ...base, inicio: "22/10/2025" })).toThrow(/inicio/);
    expect(() => urlPrecoMaterial({ ...base, fim: "2026-02-30" })).toThrow(/fim/);
    expect(() => urlPrecoMaterial({ ...base, estado: "Goiás" })).toThrow(/Estado/);
    expect(() => urlPrecoServico({ ...base, codigo: "abc" })).toThrow();
  });
});

describe("normalizarUnidade", () => {
  it("formas de unidade, caixa, pacote, frasco e quilo viram a sigla padrão", () => {
    for (const t of ["UNIDADE", "UND", "UN", "und.", "Unid", " unidade "]) expect(normalizarUnidade(t)).toBe("UN");
    for (const t of ["CAIXA", "CX", "cx.", "Caixa"]) expect(normalizarUnidade(t)).toBe("CX");
    for (const t of ["PACOTE", "PCT", "pct"]) expect(normalizarUnidade(t)).toBe("PCT");
    for (const t of ["FRASCO", "FR", "FRS"]) expect(normalizarUnidade(t)).toBe("FR");
    for (const t of ["KG", "kg", "QUILOGRAMA", "Quilo"]) expect(normalizarUnidade(t)).toBe("KG");
  });

  it("outras unidades comuns", () => {
    expect(normalizarUnidade("Litro")).toBe("L");
    expect(normalizarUnidade("LT")).toBe("L");
    expect(normalizarUnidade("Metro quadrado")).toBe("M2");
    expect(normalizarUnidade("m²")).toBe("M2");
    expect(normalizarUnidade("Galão")).toBe("GL");
    expect(normalizarUnidade("Peça")).toBe("PC");
    expect(normalizarUnidade("Dúzia")).toBe("DZ");
    expect(normalizarUnidade("Serviço")).toBe("SERV");
    expect(normalizarUnidade("Mês")).toBe("MES");
  });

  it("tira acento e espaços sobrando; desconhecida sai limpa, como veio", () => {
    expect(normalizarUnidade("  Metro   Cúbico ")).toBe("M3");
    expect(normalizarUnidade("  Tambor   Térmico ")).toBe("TAMBOR TERMICO");
    expect(normalizarUnidade("XPTO")).toBe("XPTO");
  });

  it("vazio ou não texto vira texto vazio", () => {
    for (const ruim of ["", "   ", null, undefined, 5, {}]) expect(normalizarUnidade(ruim)).toBe("");
  });
});

describe("siglaDaUnidadeDoItem", () => {
  it("reconhece a unidade inteira ou a primeira palavra", () => {
    expect(siglaDaUnidadeDoItem("kg")).toBe("KG");
    expect(siglaDaUnidadeDoItem("Caixa c/ 50")).toBe("CX");
    expect(siglaDaUnidadeDoItem("CX/12")).toBe("CX");
    expect(siglaDaUnidadeDoItem("Pacote com 100 folhas")).toBe("PCT");
    expect(siglaDaUnidadeDoItem("metro quadrado")).toBe("M2");
  });

  it("não reconhecida ou vazia => texto vazio", () => {
    for (const t of ["", "2x500ml", "tambor", null, undefined, 3]) expect(siglaDaUnidadeDoItem(t)).toBe("");
  });
});

describe("chaveUnidade", () => {
  it("sigla normalizada + capacidade", () => {
    expect(chaveUnidade({ siglaUnidadeFornecimento: "PCT", capacidadeUnidadeFornecimento: 100 })).toBe("PCT|100");
    expect(chaveUnidade({ siglaUnidadeFornecimento: "pacote", capacidadeUnidadeFornecimento: 100 })).toBe("PCT|100");
    expect(chaveUnidade({ siglaUnidadeFornecimento: "CX", capacidadeUnidadeFornecimento: 12 })).toBe("CX|12");
    expect(chaveUnidade({ siglaUnidadeFornecimento: "PCT", capacidadeUnidadeFornecimento: 1 })).toBe("PCT|1");
  });

  it("capacidade zero, ausente ou inválida vale 0; PCT|0 e PCT|100 são grupos diferentes", () => {
    expect(chaveUnidade({ siglaUnidadeFornecimento: "PCT", capacidadeUnidadeFornecimento: 0 })).toBe("PCT|0");
    expect(chaveUnidade({ siglaUnidadeFornecimento: "PCT" })).toBe("PCT|0");
    expect(chaveUnidade({ siglaUnidadeFornecimento: "PCT", capacidadeUnidadeFornecimento: -3 })).toBe("PCT|0");
    expect(chaveUnidade({ siglaUnidadeFornecimento: "PCT", capacidadeUnidadeFornecimento: "abc" })).toBe("PCT|0");
    expect(chaveUnidade({ siglaUnidadeFornecimento: "PCT", capacidadeUnidadeFornecimento: null })).toBe("PCT|0");
    expect(chaveUnidade({ siglaUnidadeFornecimento: "PCT", capacidadeUnidadeFornecimento: 0.5 })).toBe("PCT|0.5");
  });

  it("UN de capacidade 1 e UN sem capacidade são o mesmo grupo (só para UN)", () => {
    expect(chaveUnidade({ siglaUnidadeFornecimento: "UN", capacidadeUnidadeFornecimento: 1 })).toBe("UN|0");
    expect(chaveUnidade({ siglaUnidadeFornecimento: "UNIDADE", capacidadeUnidadeFornecimento: 0 })).toBe("UN|0");
    expect(chaveUnidade({ siglaUnidadeFornecimento: "UN", capacidadeUnidadeFornecimento: 50 })).toBe("UN|50");
  });

  it("registro de serviço: só tem unidade de medida (sem capacidade), que vale como segunda opção", () => {
    expect(chaveUnidade({ siglaUnidadeMedida: "UN", nomeUnidadeMedida: "UNIDADE" })).toBe("UN|0");
    expect(chaveUnidade({ nomeUnidadeMedida: "HORA" })).toBe("H|0");
    // Com unidade de fornecimento, ela manda.
    expect(chaveUnidade({ siglaUnidadeFornecimento: "CX", capacidadeUnidadeFornecimento: 12, siglaUnidadeMedida: "UN" })).toBe("CX|12");
  });

  it("serviço de verdade (CATSER 25089): 'D'/'DIA' e 'UN'/'UNIDADE' ficam em grupos separados", () => {
    expect(chaveUnidade({ siglaUnidadeMedida: "D", nomeUnidadeMedida: "DIA", siglaUnidadeFornecimento: null })).toBe("DIA|0");
    expect(chaveUnidade({ siglaUnidadeMedida: "UN", nomeUnidadeMedida: "UNIDADE" })).toBe("UN|0");
    expect(chaveUnidade({ siglaUnidadeMedida: "KMR", nomeUnidadeMedida: "QUILOMETRO RODADO" })).toBe("KMR|0");
  });

  it("sigla que não é conhecida cede à do nome, quando o nome é conhecido", () => {
    expect(chaveUnidade({ siglaUnidadeFornecimento: "XX", nomeUnidadeFornecimento: "CAIXA", capacidadeUnidadeFornecimento: 10 })).toBe("CX|10");
    expect(chaveUnidade({ siglaUnidadeFornecimento: "XX", nomeUnidadeFornecimento: "YY" })).toBe("XX|0");
  });

  it("sem sigla usa o nome; sem nada, '?'", () => {
    expect(chaveUnidade({ nomeUnidadeFornecimento: "Caixa", capacidadeUnidadeFornecimento: 12 })).toBe("CX|12");
    expect(chaveUnidade({})).toBe("?|0");
    expect(chaveUnidade(null)).toBe("?|0");
    expect(chaveUnidade("lixo")).toBe("?|0");
  });

  it("rótulo e separação da chave", () => {
    expect(separarChave("PCT|100")).toEqual({ sigla: "PCT", capacidade: 100 });
    expect(separarChave("UN|0")).toEqual({ sigla: "UN", capacidade: 0 });
    expect(rotuloUnidade("PCT|100")).toBe("PCT 100");
    expect(rotuloUnidade("UN|0")).toBe("UN");
    expect(rotuloUnidade("?|0")).toBeNull();
  });
});

describe("registroParaAmostra", () => {
  it("converte um registro bom, sem dado de fornecedor", () => {
    const a = registroParaAmostra(registro({ nomeFornecedor: "ACME LTDA", niFornecedor: "123" }));
    expect(a).toEqual({
      valorUnitario: 0.7,
      idItemCompra: "123456789",
      chaveUnidade: "UN|0",
      data: "2026-03-10",
      uf: "GO",
      unidade: "UN",
    });
    expect(JSON.stringify(a)).not.toContain("ACME");
  });

  it("descarta registro sem precoUnitario numérico maior que zero", () => {
    for (const ruim of [null, undefined, 0, -1, -0.5, Number.NaN, Number.POSITIVE_INFINITY, "", "abc", "12,50", "1e3", "Infinity", "-3", {}, [], true, 1e12]) {
      expect(registroParaAmostra(registro({ precoUnitario: ruim }))).toBeNull();
    }
    const semCampo = registro();
    delete semCampo.precoUnitario;
    expect(registroParaAmostra(semCampo)).toBeNull();
  });

  it("preço em texto só vale com dígitos e ponto decimal", () => {
    expect(registroParaAmostra(registro({ precoUnitario: "12.5" }))?.valorUnitario).toBe(12.5);
    expect(registroParaAmostra(registro({ precoUnitario: " 7 " }))?.valorUnitario).toBe(7);
  });

  it("registro que não é objeto é descartado", () => {
    for (const ruim of [null, undefined, "texto", 5, [], [registro()]]) expect(registroParaAmostra(ruim)).toBeNull();
  });

  it("campos opcionais sujos não derrubam a amostra, só ficam de fora", () => {
    const a = registroParaAmostra(
      registro({ dataCompra: null, estado: "Goiás", siglaUnidadeFornecimento: null, nomeUnidadeFornecimento: undefined, capacidadeUnidadeFornecimento: "x", idItemCompra: "abc" }),
    );
    expect(a).toEqual({ valorUnitario: 0.7, idItemCompra: null, chaveUnidade: "?|0" });
  });

  it("idItemCompra: número seguro ou texto de dígitos; idCompra nunca é usado", () => {
    expect(registroParaAmostra(registro({ idItemCompra: "987654" }))?.idItemCompra).toBe("987654");
    expect(registroParaAmostra(registro({ idItemCompra: Number.MAX_SAFE_INTEGER + 2 }))?.idItemCompra).toBeNull();
    expect(registroParaAmostra(registro({ idItemCompra: undefined }))?.idItemCompra).toBeNull();
    const a = registroParaAmostra(registro({ idItemCompra: undefined, idCompra: 92500005900052026 }));
    expect(a?.idItemCompra).toBeNull();
    expect(JSON.stringify(a)).not.toContain("9250000590005");
  });

  it("a unidade fica separada da chave: PCT 100 e PCT sem capacidade", () => {
    expect(registroParaAmostra(registro({ siglaUnidadeFornecimento: "PCT", capacidadeUnidadeFornecimento: 100 }))).toMatchObject({
      chaveUnidade: "PCT|100",
      unidade: "PCT 100",
    });
    expect(registroParaAmostra(registro({ siglaUnidadeFornecimento: "PCT", capacidadeUnidadeFornecimento: 0 }))).toMatchObject({
      chaveUnidade: "PCT|0",
      unidade: "PCT",
    });
  });
});

describe("dedupePorIdItemCompra", () => {
  it("mantém a primeira ocorrência de cada idItemCompra, na ordem", () => {
    const lista = [amostra(1, "UN|0", "10"), amostra(2, "UN|0", "11"), amostra(3, "UN|0", "10"), amostra(4, "UN|0", "11"), amostra(5, "UN|0", "12")];
    expect(dedupePorIdItemCompra(lista).map((a) => a.valorUnitario)).toEqual([1, 2, 5]);
  });

  it("o mesmo id como número e como texto é o mesmo item", () => {
    const lista = [{ idItemCompra: 10, v: 1 }, { idItemCompra: "10", v: 2 }];
    expect(dedupePorIdItemCompra(lista)).toEqual([{ idItemCompra: 10, v: 1 }]);
  });

  it("amostra sem id é mantida (não dá para comparar)", () => {
    const lista = [amostra(1, "UN|0", null), amostra(2, "UN|0", null), amostra(3, "UN|0", "7"), amostra(4, "UN|0", "7")];
    expect(dedupePorIdItemCompra(lista).map((a) => a.valorUnitario)).toEqual([1, 2, 3]);
  });

  it("lista vazia e não altera a original", () => {
    expect(dedupePorIdItemCompra([])).toEqual([]);
    const lista = [amostra(1, "UN|0", "1"), amostra(2, "UN|0", "1")];
    dedupePorIdItemCompra(lista);
    expect(lista).toHaveLength(2);
  });
});

describe("grupos de unidade: o caso real UN a 0,70 x PCT/100 a 7,20 x PCT/0 a 116", () => {
  const registros = [
    ...[0.7, 0.7, 0.72, 0.68, 0.7, 0.71].map((p, i) => registro({ precoUnitario: p, siglaUnidadeFornecimento: "UN", capacidadeUnidadeFornecimento: 0, idItemCompra: 100 + i })),
    ...[7.2, 7.2, 7.5, 7.0].map((p, i) => registro({ precoUnitario: p, siglaUnidadeFornecimento: "PCT", capacidadeUnidadeFornecimento: 100, idItemCompra: 200 + i })),
    registro({ precoUnitario: 116, siglaUnidadeFornecimento: "PCT", capacidadeUnidadeFornecimento: 0, idItemCompra: 300 }),
  ];
  const amostras = registros.map((r) => registroParaAmostra(r)!);
  const grupos = agruparPorUnidade(amostras);

  it("separa em três grupos, sem misturar", () => {
    expect([...grupos.keys()].sort()).toEqual(["PCT|0", "PCT|100", "UN|0"]);
    expect(grupos.get("UN|0")).toHaveLength(6);
    expect(grupos.get("PCT|100")).toHaveLength(4);
    expect(grupos.get("PCT|0")).toHaveLength(1);
  });

  it("item em UN: escolhe o grupo UN, mesmo sendo o maior de qualquer jeito, e as estatísticas ficam em torno de R$ 0,70", () => {
    const g = escolherGrupoDeUnidade(grupos, "Unidade")!;
    expect(g.chave).toBe("UN|0");
    expect(g.unidadeConfere).toBe(true);
    expect(g.amostras).toHaveLength(6);
    const est = estatisticasDePrecos(g.amostras)!;
    expect(est.mediana).toBeCloseTo(0.7, 2);
    expect(est.maximo).toBeLessThan(1);
    expect(g.motivo).toContain("PCT 100 (4)");
    expect(g.motivo).toContain("PCT (1)");
  });

  it("item em UN escolhe UN mesmo quando outro grupo é maior", () => {
    const outros = new Map(grupos);
    outros.set("PCT|100", Array.from({ length: 50 }, (_, i) => amostra(7.2, "PCT|100", `p${i}`)));
    const g = escolherGrupoDeUnidade(outros, "UN")!;
    expect(g.chave).toBe("UN|0");
    expect(g.amostras).toHaveLength(6);
  });

  it("item em pacote: só grupos PCT; o maior é PCT|100 e o aviso diz que a capacidade pode divergir", () => {
    const g = escolherGrupoDeUnidade(grupos, "Pacote")!;
    expect(g.chave).toBe("PCT|100");
    expect(g.unidadeConfere).toBe(true);
    expect(g.amostras.every((a) => a.valorUnitario < 10)).toBe(true);
    expect(g.motivo).toContain("capacidade");
  });

  it("unidade do item não reconhecida: o maior grupo, com aviso de que a unidade pode divergir", () => {
    const g = escolherGrupoDeUnidade(grupos, "tambor")!;
    expect(g.chave).toBe("UN|0");
    expect(g.unidadeConfere).toBe(false);
    expect(g.motivo).toContain("não foi reconhecida");
    expect(g.motivo).toContain("pode divergir");
    for (const vazio of ["", null, undefined]) expect(escolherGrupoDeUnidade(grupos, vazio)!.unidadeConfere).toBe(false);
  });

  it("nenhum grupo tem a unidade do item: o maior grupo, com aviso", () => {
    const g = escolherGrupoDeUnidade(grupos, "Caixa")!;
    expect(g.chave).toBe("UN|0");
    expect(g.unidadeConfere).toBe(false);
    expect(g.motivo).toContain("Nenhum grupo");
    expect(g.motivo).toContain("(CX)");
    expect(g.motivo).toContain("pode divergir");
  });

  it("nunca mistura: o grupo escolhido tem uma única chave de unidade", () => {
    for (const unidade of ["UN", "Pacote", "Caixa", "", "kg"]) {
      const g = escolherGrupoDeUnidade(grupos, unidade)!;
      expect(new Set(g.amostras.map((a) => a.chaveUnidade)).size).toBe(1);
      expect(g.amostras.every((a) => a.chaveUnidade === g.chave)).toBe(true);
    }
  });

  it("empate de tamanho: ordem da chave, sempre o mesmo resultado", () => {
    const empate = new Map([
      ["UN|0", [amostra(1, "UN|0"), amostra(1, "UN|0")]],
      ["CX|12", [amostra(9, "CX|12"), amostra(9, "CX|12")]],
    ]);
    expect(escolherGrupoDeUnidade(empate, "")!.chave).toBe("CX|12");
  });

  it("aceita objeto no lugar de Map e devolve nulo sem amostras", () => {
    expect(escolherGrupoDeUnidade({ "UN|0": [amostra(1, "UN|0")] }, "un")!.chave).toBe("UN|0");
    expect(escolherGrupoDeUnidade(new Map(), "UN")).toBeNull();
    expect(escolherGrupoDeUnidade({ "UN|0": [] }, "UN")).toBeNull();
  });

  it("sem unidade que confira, o grupo 'sem unidade informada' só vale se não houver outro", () => {
    const semUnidade = new Map([
      ["?|0", Array.from({ length: 10 }, (_, i) => amostra(5, "?|0", `s${i}`))],
      ["DIA|0", Array.from({ length: 3 }, (_, i) => amostra(238, "DIA|0", `d${i}`))],
    ]);
    expect(escolherGrupoDeUnidade(semUnidade, "")!.chave).toBe("DIA|0");
    expect(escolherGrupoDeUnidade(new Map([["?|0", [amostra(5, "?|0")]]]), "")!.chave).toBe("?|0");
  });

  it("serviço: item em 'Dia' fica com o grupo DIA, mesmo com 'UN' a R$ 19.998 e maior", () => {
    const servico = new Map([
      ["UN|0", Array.from({ length: 275 }, (_, i) => amostra(19998.6, "UN|0", `u${i}`))],
      ["DIA|0", Array.from({ length: 5 }, (_, i) => amostra(238.01, "DIA|0", `d${i}`))],
    ]);
    const g = escolherGrupoDeUnidade(servico, "Dia")!;
    expect(g.chave).toBe("DIA|0");
    expect(g.unidadeConfere).toBe(true);
  });

  it("um grupo só e sem 'outros grupos' no motivo", () => {
    const g = escolherGrupoDeUnidade({ "UN|0": [amostra(1, "UN|0")] }, "UN")!;
    expect(g.motivo).not.toContain("ignorados");
  });
});

describe("pareceCodigoDeServico", () => {
  it("até 5 dígitos e unidade de serviço (serviço, mês, hora, dia, diária)", () => {
    expect(pareceCodigoDeServico("25089", "serviço")).toBe(true);
    expect(pareceCodigoDeServico("3670", "mês")).toBe(true);
    expect(pareceCodigoDeServico("3670", "Hora")).toBe(true);
    expect(pareceCodigoDeServico("3670", "diária")).toBe(true);
    expect(pareceCodigoDeServico(3670, "dia")).toBe(true);
  });

  it("na dúvida (unidade 'unidade', vazia ou desconhecida) não parece: só a opção --servico tenta serviço", () => {
    expect(pareceCodigoDeServico("3670", "unidade")).toBe(false);
    expect(pareceCodigoDeServico("3670", "UN")).toBe(false);
    expect(pareceCodigoDeServico("3670", "")).toBe(false);
    expect(pareceCodigoDeServico("3670", undefined)).toBe(false);
    expect(pareceCodigoDeServico("3670", "tambor")).toBe(false);
  });

  it("6 dígitos (CATMAT) ou unidade de coisa não parece serviço", () => {
    expect(pareceCodigoDeServico("631014", "serviço")).toBe(false);
    expect(pareceCodigoDeServico("25089", "caixa")).toBe(false);
    expect(pareceCodigoDeServico("25089", "kg")).toBe(false);
    expect(pareceCodigoDeServico("abc", "serviço")).toBe(false);
    expect(pareceCodigoDeServico("", "serviço")).toBe(false);
  });
});

describe("unidadeMaisComum (dica da unidade para o código)", () => {
  it("a unidade que mais itens usam ganha, mesmo sem ser a primeira em ordem alfabética", () => {
    expect(unidadeMaisComum([["CAIXA", 1], ["UNIDADE", 40]])).toBe("UNIDADE");
    expect(unidadeMaisComum([["UNIDADE", 40], ["CAIXA", 1]])).toBe("UNIDADE");
  });

  it("junta as grafias da mesma unidade antes de contar", () => {
    // Sozinhas, "Caixa" (2) e "cx" (2) perdem para "Unidade" (3); juntas (4) ganham.
    expect(unidadeMaisComum([["Caixa", 2], ["cx", 2], ["Unidade", 3]])).toBe("Caixa");
    expect(unidadeMaisComum([["TAMBOR TÉRMICO", 2], ["tambor termico", 2], ["Unidade", 3]])).toBe("TAMBOR TÉRMICO");
  });

  it("empate: a reconhecida primeiro, depois a ordem do texto (sempre o mesmo resultado)", () => {
    expect(unidadeMaisComum([["Tambor", 1], ["Caixa", 1]])).toBe("Caixa");
    expect(unidadeMaisComum([["Caixa", 1], ["Tambor", 1]])).toBe("Caixa");
    expect(unidadeMaisComum([["Pacote", 1], ["Caixa", 1]])).toBe("Caixa");
  });

  it("ignora texto vazio, quantidade inválida e dado que não é texto", () => {
    expect(unidadeMaisComum([])).toBeNull();
    expect(unidadeMaisComum([["", 5], ["   ", 3]])).toBeNull();
    expect(unidadeMaisComum([["Caixa", 0], ["Caixa", -2]])).toBeNull();
    expect(unidadeMaisComum([[null as unknown as string, 4], ["Kg", 1]])).toBe("Kg");
  });
});

describe("lerPaginaDaApi", () => {
  it("lê o envelope: registros e páginas que faltam", () => {
    const p = lerPaginaDaApi({ resultado: [{ a: 1 }, { a: 2 }], totalRegistros: 1200, totalPaginas: 3, paginasRestantes: 2 }, 1);
    expect(p).toEqual({ registros: [{ a: 1 }, { a: 2 }], restantes: 2 });
    expect(lerPaginaDaApi({ resultado: [], totalPaginas: 3, paginasRestantes: 0 }, 3)?.restantes).toBe(0);
  });

  it("sem resultado em lista, não é resposta da API", () => {
    for (const ruim of [null, undefined, "texto", 5, [], {}, { resultado: null }, { resultado: "x" }, { resultado: {} }]) {
      expect(lerPaginaDaApi(ruim, 1)).toBeNull();
    }
  });

  it("paginasRestantes nulo ou texto inútil NÃO vira zero: cai no totalPaginas", () => {
    // Number(null) e Number("") dão 0 e a leitura pararia no meio.
    expect(lerPaginaDaApi({ resultado: [1], totalPaginas: 5, paginasRestantes: null }, 2)?.restantes).toBe(3);
    expect(lerPaginaDaApi({ resultado: [1], totalPaginas: 5, paginasRestantes: "" }, 2)?.restantes).toBe(3);
    expect(lerPaginaDaApi({ resultado: [1], totalPaginas: 5, paginasRestantes: "abc" }, 2)?.restantes).toBe(3);
    expect(lerPaginaDaApi({ resultado: [1], totalPaginas: 5 }, 5)?.restantes).toBe(0);
    expect(lerPaginaDaApi({ resultado: [1], totalPaginas: 5 }, 9)?.restantes).toBe(0);
  });

  it("aceita número em texto e, sem nenhum dos dois campos, considera a última página", () => {
    expect(lerPaginaDaApi({ resultado: [1], paginasRestantes: "4" }, 1)?.restantes).toBe(4);
    expect(lerPaginaDaApi({ resultado: [1] }, 1)?.restantes).toBe(0);
    expect(lerPaginaDaApi({ resultado: [1], paginasRestantes: -1, totalPaginas: 3 }, 1)?.restantes).toBe(2);
  });
});

describe("janelaDaAmostra", () => {
  const janela = { inicio: "2025-10-22", fim: "2026-10-22" };

  it("sem truncamento vale a janela pedida, mesmo que as datas lidas sejam mais novas", () => {
    expect(janelaDaAmostra(janela, ["2026-09-01", "2026-10-01"], false)).toEqual(janela);
  });

  it("truncado: o início passa a ser a compra mais antiga lida, e o fim continua o mesmo", () => {
    expect(janelaDaAmostra(janela, ["2026-10-21", "2026-08-03", "2026-09-15"], true)).toEqual({ inicio: "2026-08-03", fim: "2026-10-22" });
  });

  it("truncado: ignora data ausente, malformada ou fora da janela", () => {
    expect(janelaDaAmostra(janela, [undefined, "lixo", "2024-01-01", "2027-01-01", "2026-07-07"], true)).toEqual({
      inicio: "2026-07-07",
      fim: "2026-10-22",
    });
  });

  it("truncado sem nenhuma data utilizável: volta à janela pedida", () => {
    expect(janelaDaAmostra(janela, [], true)).toEqual(janela);
    expect(janelaDaAmostra(janela, [undefined, "x"], true)).toEqual(janela);
  });
});

describe("mensagemCurtaDeErro", () => {
  it("nunca devolve texto vazio: mensagem do Prisma começa com linha em branco", () => {
    const prisma = new Error("\nInvalid `prisma.referenciaPreco.upsert()` invocation:\n\n\nValor fora do limite da coluna");
    expect(mensagemCurtaDeErro(prisma)).toBe("Invalid `prisma.referenciaPreco.upsert()` invocation:");
    expect(mensagemCurtaDeErro(prisma, { linha: "ultima" })).toBe("Valor fora do limite da coluna");
  });

  it("sem mensagem útil, texto padrão (nunca '')", () => {
    for (const ruim of [new Error(""), new Error("\n \n"), "", null, undefined, 42, {}]) {
      expect(mensagemCurtaDeErro(ruim)).toBe("Falha desconhecida");
    }
  });

  it("texto simples, corte no tamanho máximo", () => {
    expect(mensagemCurtaDeErro("HTTP 500")).toBe("HTTP 500");
    expect(mensagemCurtaDeErro(new Error("x".repeat(500)))).toHaveLength(200);
    expect(mensagemCurtaDeErro(new Error("abcdef"), { maximo: 3 })).toBe("abc");
  });
});

describe("precisaConsultar", () => {
  const agora = new Date("2026-10-22T12:00:00Z");
  const diasAtras = (d: number) => new Date(agora.getTime() - d * 86_400_000);

  it("sem referência, consulta", () => {
    expect(precisaConsultar(null, agora)).toBe(true);
    expect(precisaConsultar(undefined, agora)).toBe(true);
  });

  it("referência recente não precisa; mais velha que 30 dias precisa", () => {
    expect(precisaConsultar({ consultadoEm: diasAtras(5), erro: null }, agora)).toBe(false);
    expect(precisaConsultar({ consultadoEm: diasAtras(30), erro: null }, agora)).toBe(false);
    expect(precisaConsultar({ consultadoEm: diasAtras(31), erro: null }, agora)).toBe(true);
  });

  it("consulta que falhou é tentada de novo depois de 1 dia, não só em 30", () => {
    expect(precisaConsultar({ consultadoEm: diasAtras(0.2), erro: "timeout" }, agora)).toBe(false);
    expect(precisaConsultar({ consultadoEm: diasAtras(2), erro: "timeout" }, agora)).toBe(true);
  });

  it("aceita outros prazos", () => {
    expect(precisaConsultar({ consultadoEm: diasAtras(10), erro: null }, agora, { diasValidade: 7 })).toBe(true);
    expect(precisaConsultar({ consultadoEm: diasAtras(10), erro: null }, agora, { diasValidade: 60 })).toBe(false);
  });
});
