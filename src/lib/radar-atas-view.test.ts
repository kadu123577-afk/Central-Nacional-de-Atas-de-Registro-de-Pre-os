import { describe, expect, it } from "vitest";
import {
  calcularPaginacao,
  cartaoComContatoVencido,
  cnpjParaTela,
  cortarTexto,
  contatoVencido,
  dataParaCampo,
  diaBrasilia,
  diasRestantesBrasilia,
  ESTAGIOS_EM_CONTATO,
  filtroContatoVencido,
  fornecedorParaTela,
  hojeBrasilia,
  hrefRadar,
  ITENS_POR_PAGINA,
  lerDataSoDia,
  lerFiltrosRadar,
  limitarLista,
  listaDeCsv,
  normalizarObservacao,
  rotuloAtaPncp,
  textoDiasRestantes,
  tomDiasRestantes,
  ufValida,
  urlAtaPncp,
} from "./radar-atas-view";

describe("urlAtaPncp", () => {
  it("monta o endereço da ata a partir do número de controle, sem zeros à esquerda", () => {
    expect(urlAtaPncp("03532661000156-1-000075/2024-000001")).toBe(
      "https://pncp.gov.br/app/atas/03532661000156/2024/75/1",
    );
    expect(urlAtaPncp("01616520000196-1-000199/2025-000012")).toBe(
      "https://pncp.gov.br/app/atas/01616520000196/2025/199/12",
    );
  });
  it("mantém os zeros do CNPJ", () => {
    expect(urlAtaPncp("00394460000141-1-000001/2023-000001")).toBe("https://pncp.gov.br/app/atas/00394460000141/2023/1/1");
  });
  it("tolera espaços em volta", () => {
    expect(urlAtaPncp("  03532661000156-1-000075/2024-000001 ")).toBe(
      "https://pncp.gov.br/app/atas/03532661000156/2024/75/1",
    );
  });
  it.each([
    ["vazio", ""],
    ["só a compra, sem a ata", "03532661000156-1-000075/2024"],
    ["CNPJ curto", "3532661000156-1-000075/2024-000001"],
    ["letras", "0353266100015A-1-000075/2024-000001"],
    ["ano com 2 dígitos", "03532661000156-1-000075/24-000001"],
    ["sequencial zero", "03532661000156-1-000000/2024-000001"],
    ["ata zero", "03532661000156-1-000075/2024-000000"],
    ["tentativa de sair do domínio", "03532661000156-1-000075/2024-000001/../../x"],
    ["texto qualquer", "http://exemplo.com/?a=1"],
  ])("devolve null para %s", (_nome, entrada) => {
    expect(urlAtaPncp(entrada)).toBeNull();
  });
  it("devolve null para nulo e indefinido", () => {
    expect(urlAtaPncp(null)).toBeNull();
    expect(urlAtaPncp(undefined)).toBeNull();
  });
});

describe("rotuloAtaPncp", () => {
  it("mostra a compra de origem e a posição da ata", () => {
    expect(rotuloAtaPncp("03532661000156-1-000075/2024-000001")).toBe("Compra 75/2024 · ata 1");
  });
  it("fora do formato, devolve o texto como veio", () => {
    expect(rotuloAtaPncp("ATA-123")).toBe("ATA-123");
    expect(rotuloAtaPncp(null)).toBe("");
  });
});

describe("cnpjParaTela e fornecedorParaTela", () => {
  it("formata CNPJ de 14 dígitos, com ou sem máscara", () => {
    expect(cnpjParaTela("11222333000181")).toBe("11.222.333/0001-81");
    expect(cnpjParaTela("11.222.333/0001-81")).toBe("11.222.333/0001-81");
  });
  it("não mostra CPF, letras nem vazio", () => {
    expect(cnpjParaTela("12345678901")).toBeNull();
    expect(cnpjParaTela("1122233300018A")).toBeNull();
    expect(cnpjParaTela("")).toBeNull();
    expect(cnpjParaTela(null)).toBeNull();
  });
  it("empresa: nome sem CPF de MEI e CNPJ formatado", () => {
    expect(fornecedorParaTela("Fulano Comércio 12345678901", "11222333000181")).toEqual({
      nome: "Fulano Comércio",
      cnpj: "11.222.333/0001-81",
    });
  });
  it("pessoa física nunca mostra documento", () => {
    expect(fornecedorParaTela("pessoa física", "11222333000181")).toEqual({ nome: "pessoa física", cnpj: null });
    expect(fornecedorParaTela("pessoa física", null)).toEqual({ nome: "pessoa física", cnpj: null });
  });
  it("sem nome, devolve nome nulo (a tela escreve o aviso)", () => {
    expect(fornecedorParaTela(null, null)).toEqual({ nome: null, cnpj: null });
    expect(fornecedorParaTela("   ", "11222333000181")).toEqual({ nome: null, cnpj: "11.222.333/0001-81" });
  });
});

describe("lerFiltrosRadar", () => {
  it("sem parâmetros, não há filtro e a página é a primeira", () => {
    expect(lerFiltrosRadar({})).toEqual({ categoria: null, uf: null, fornecedor: null, pagina: 1 });
  });
  it("lê categoria, UF, fornecedor e página", () => {
    expect(
      lerFiltrosRadar({ categoria: "material-hospitalar", uf: "go", fornecedor: "11.222.333/0001-81", pagina: "3" }),
    ).toEqual({ categoria: "material-hospitalar", uf: "GO", fornecedor: "11222333000181", pagina: 3 });
  });
  it("aceita o filtro 'sem categoria'", () => {
    expect(lerFiltrosRadar({ categoria: "sem-categoria" }).categoria).toBe("sem-categoria");
  });
  it("usa o primeiro valor quando o parâmetro se repete", () => {
    expect(lerFiltrosRadar({ uf: ["MG", "GO"], pagina: ["2", "5"] })).toMatchObject({ uf: "MG", pagina: 2 });
  });
  it.each([
    ["categoria com maiúscula e espaço", { categoria: "Material Hospitalar" }],
    ["categoria com aspas", { categoria: "x'; DROP TABLE radar_atas;--" }],
    ["categoria com barra", { categoria: "../x" }],
    ["categoria longa demais", { categoria: "a".repeat(61) }],
    ["UF que não existe", { uf: "ZZ" }],
    ["UF com três letras", { uf: "GOI" }],
    ["fornecedor que é CPF", { fornecedor: "12345678901" }],
    ["fornecedor com letras", { fornecedor: "abc" }],
  ])("ignora %s", (_nome, params) => {
    expect(lerFiltrosRadar(params)).toEqual({ categoria: null, uf: null, fornecedor: null, pagina: 1 });
  });
  it.each(["0", "-1", "1.5", "abc", "", "123456", "1e3"])("página %j vira a primeira (ou o mínimo)", (pagina) => {
    expect(lerFiltrosRadar({ pagina }).pagina).toBe(1);
  });
});

describe("hrefRadar", () => {
  it("sem filtro, é a rota pura", () => {
    expect(hrefRadar({})).toBe("/admin/radar-atas");
    expect(hrefRadar({ categoria: null, uf: null, fornecedor: null })).toBe("/admin/radar-atas");
  });
  it("leva só os filtros que existem, em ordem fixa", () => {
    expect(hrefRadar({ fornecedor: "11222333000181", uf: "GO", categoria: "veiculos" })).toBe(
      "/admin/radar-atas?categoria=veiculos&uf=GO&fornecedor=11222333000181",
    );
  });
  it("a primeira página não aparece na URL; as outras sim", () => {
    expect(hrefRadar({ uf: "GO" }, 1)).toBe("/admin/radar-atas?uf=GO");
    expect(hrefRadar({ uf: "GO" }, 3)).toBe("/admin/radar-atas?uf=GO&pagina=3");
    expect(hrefRadar({}, 2)).toBe("/admin/radar-atas?pagina=2");
  });
  it("devolve filtros que lerFiltrosRadar entende", () => {
    const filtros = { categoria: "veiculos", uf: "GO", fornecedor: "11222333000181" };
    const query = Object.fromEntries(new URL(`http://x${hrefRadar(filtros, 4)}`).searchParams);
    expect(lerFiltrosRadar(query)).toEqual({ ...filtros, pagina: 4 });
  });
});

describe("calcularPaginacao", () => {
  it("cem por página por padrão", () => {
    expect(ITENS_POR_PAGINA).toBe(100);
  });
  it("sem linhas: uma página vazia", () => {
    expect(calcularPaginacao(0, 1)).toEqual({ pagina: 1, totalPaginas: 1, pular: 0, de: 0, ate: 0 });
  });
  it("primeira página cheia", () => {
    expect(calcularPaginacao(250, 1)).toEqual({ pagina: 1, totalPaginas: 3, pular: 0, de: 1, ate: 100 });
  });
  it("última página parcial", () => {
    expect(calcularPaginacao(250, 3)).toEqual({ pagina: 3, totalPaginas: 3, pular: 200, de: 201, ate: 250 });
  });
  it("múltiplo exato do tamanho não cria página vazia", () => {
    expect(calcularPaginacao(200, 2)).toEqual({ pagina: 2, totalPaginas: 2, pular: 100, de: 101, ate: 200 });
  });
  it("passar da última cai na última; menor que 1 cai na primeira", () => {
    expect(calcularPaginacao(250, 99).pagina).toBe(3);
    expect(calcularPaginacao(250, 0).pagina).toBe(1);
    expect(calcularPaginacao(250, -4).pagina).toBe(1);
  });
  it("número inválido não vira skip: NaN", () => {
    const p = calcularPaginacao(Number.NaN, Number.NaN);
    expect(p).toEqual({ pagina: 1, totalPaginas: 1, pular: 0, de: 0, ate: 0 });
  });
  it("aceita outro tamanho de página", () => {
    expect(calcularPaginacao(25, 2, 10)).toEqual({ pagina: 2, totalPaginas: 3, pular: 10, de: 11, ate: 20 });
  });
});

describe("prazo da ata", () => {
  it("escreve os dias restantes", () => {
    expect(textoDiasRestantes(-3)).toBe("vencida");
    expect(textoDiasRestantes(0)).toBe("vence hoje");
    expect(textoDiasRestantes(1)).toBe("1 dia");
    expect(textoDiasRestantes(120)).toBe("120 dias");
    expect(textoDiasRestantes(Number.NaN)).toBe("—");
  });
  it("tom: vencida crítico, abaixo de 45 alerta, abaixo de 90 atenção, o resto neutro", () => {
    expect(tomDiasRestantes(-1)).toBe("critico");
    expect(tomDiasRestantes(Number.NaN)).toBe("critico");
    expect(tomDiasRestantes(0)).toBe("alerta");
    expect(tomDiasRestantes(44)).toBe("alerta");
    expect(tomDiasRestantes(45)).toBe("atencao");
    expect(tomDiasRestantes(89)).toBe("atencao");
    expect(tomDiasRestantes(90)).toBe("neutro");
    expect(tomDiasRestantes(400)).toBe("neutro");
  });
});

describe("diaBrasilia", () => {
  it("usa o dia de Brasília, não o de UTC", () => {
    expect(diaBrasilia(new Date("2026-10-23T01:30:00Z"))).toBe("22/10/2026");
    expect(diaBrasilia(new Date("2026-10-22T15:00:00Z"))).toBe("22/10/2026");
  });
  it("sem data ou data inválida, devolve travessão", () => {
    expect(diaBrasilia(null)).toBe("—");
    expect(diaBrasilia(undefined)).toBe("—");
    expect(diaBrasilia(new Date("lixo"))).toBe("—");
  });
});

describe("hojeBrasilia e contatoVencido", () => {
  it("o dia de Brasília vira meia-noite UTC", () => {
    expect(hojeBrasilia(new Date("2026-10-22T15:00:00Z")).toISOString()).toBe("2026-10-22T00:00:00.000Z");
    // 01h UTC ainda é a noite do dia anterior em Brasília.
    expect(hojeBrasilia(new Date("2026-10-22T01:00:00Z")).toISOString()).toBe("2026-10-21T00:00:00.000Z");
    // 03h UTC = meia-noite em Brasília: já é o dia novo.
    expect(hojeBrasilia(new Date("2026-10-22T03:00:00Z")).toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });
  const agora = new Date("2026-10-22T15:00:00Z");
  it("data anterior a hoje está vencida", () => {
    expect(contatoVencido(new Date("2026-10-21T00:00:00Z"), agora)).toBe(true);
    expect(contatoVencido(new Date("2026-01-05T00:00:00Z"), agora)).toBe(true);
  });
  it("hoje e o futuro não estão vencidos", () => {
    expect(contatoVencido(new Date("2026-10-22T00:00:00Z"), agora)).toBe(false);
    expect(contatoVencido(new Date("2026-10-23T00:00:00Z"), agora)).toBe(false);
  });
  it("sem data (ou data inválida) nunca vence", () => {
    expect(contatoVencido(null, agora)).toBe(false);
    expect(contatoVencido(undefined, agora)).toBe(false);
    expect(contatoVencido(new Date("lixo"), agora)).toBe(false);
  });
  it("de madrugada em UTC (noite em Brasília), o dia marcado para ontem de lá ainda não venceu", () => {
    // 22/10 01h UTC = 21/10 22h em Brasília: contato de 21/10 é "hoje".
    expect(contatoVencido(new Date("2026-10-21T00:00:00Z"), new Date("2026-10-22T01:00:00Z"))).toBe(false);
    expect(contatoVencido(new Date("2026-10-20T00:00:00Z"), new Date("2026-10-22T01:00:00Z"))).toBe(true);
  });
});

describe("diasRestantesBrasilia", () => {
  const fim = new Date("2026-12-31T00:00:00Z");
  it("conta do dia de hoje em Brasília até o fim da vigência", () => {
    expect(diasRestantesBrasilia(fim, new Date("2026-12-01T15:00:00Z"))).toBe(30);
    expect(diasRestantesBrasilia(fim, new Date("2026-12-31T15:00:00Z"))).toBe(0);
    expect(diasRestantesBrasilia(fim, new Date("2027-01-01T15:00:00Z"))).toBe(-1);
  });
  it("às 22h de Brasília (já é o dia seguinte em UTC) a ata ainda vence hoje, não está vencida", () => {
    // 01/01 01h UTC = 31/12 22h em Brasília.
    expect(diasRestantesBrasilia(fim, new Date("2027-01-01T01:00:00Z"))).toBe(0);
    // 03h UTC = meia-noite em Brasília: o dia 31 acabou.
    expect(diasRestantesBrasilia(fim, new Date("2027-01-01T03:00:00Z"))).toBe(-1);
  });
  it("sem data de fim (ou inválida), devolve NaN, que a tela escreve como travessão", () => {
    expect(diasRestantesBrasilia(null, new Date("2026-12-01T15:00:00Z"))).toBeNaN();
    expect(diasRestantesBrasilia(new Date("lixo"), new Date("2026-12-01T15:00:00Z"))).toBeNaN();
    expect(textoDiasRestantes(diasRestantesBrasilia(null, new Date()))).toBe("—");
  });
});

describe("cartaoComContatoVencido", () => {
  const agora = new Date("2026-10-22T15:00:00Z");
  const ontem = new Date("2026-10-21T00:00:00Z");
  const hoje = new Date("2026-10-22T00:00:00Z");

  it.each(["contatado", "interessado"])("em %s, data anterior a hoje é vencida", (estagio) => {
    expect(cartaoComContatoVencido(estagio, ontem, agora)).toBe(true);
  });
  it.each(["contatado", "interessado"])("em %s, data de hoje ou sem data não é vencida", (estagio) => {
    expect(cartaoComContatoVencido(estagio, hoje, agora)).toBe(false);
    expect(cartaoComContatoVencido(estagio, null, agora)).toBe(false);
  });
  it.each(["identificado", "credenciado", "recusou", "qualquer-outro"])(
    "em %s o destaque não aparece, para bater com a contagem do painel",
    (estagio) => {
      expect(cartaoComContatoVencido(estagio, ontem, agora)).toBe(false);
    },
  );
  it("concorda com o filtro do banco: os estágios do filtro são os que o cartão destaca", () => {
    for (const estagio of filtroContatoVencido(agora).estagio.in) {
      expect(cartaoComContatoVencido(estagio, ontem, agora)).toBe(true);
    }
  });
});

describe("filtroContatoVencido", () => {
  it("só contatado e interessado, com data anterior ao dia de hoje em Brasília", () => {
    const f = filtroContatoVencido(new Date("2026-10-22T15:00:00Z"));
    expect(f.estagio.in).toEqual(["contatado", "interessado"]);
    expect(f.proximoContatoEm.lt.toISOString()).toBe("2026-10-22T00:00:00.000Z");
    expect([...ESTAGIOS_EM_CONTATO]).toEqual(["contatado", "interessado"]);
  });
  it("não altera a lista de estágios compartilhada", () => {
    filtroContatoVencido(new Date()).estagio.in.push("recusou");
    expect([...ESTAGIOS_EM_CONTATO]).toEqual(["contatado", "interessado"]);
  });
});

describe("lerDataSoDia", () => {
  it("lê AAAA-MM-DD como meia-noite UTC", () => {
    const r = lerDataSoDia("2026-11-05");
    expect(r.ok).toBe(true);
    expect(r.ok && r.data?.toISOString()).toBe("2026-11-05T00:00:00.000Z");
  });
  it("vazio ou só espaços = sem data", () => {
    expect(lerDataSoDia("")).toEqual({ ok: true, data: null });
    expect(lerDataSoDia("   ")).toEqual({ ok: true, data: null });
  });
  it("aceita 29/02 de ano bissexto e recusa o de ano comum", () => {
    expect(lerDataSoDia("2028-02-29").ok).toBe(true);
    expect(lerDataSoDia("2027-02-29").ok).toBe(false);
  });
  it.each([
    "2026-02-31",
    "2026-13-01",
    "2026-00-10",
    "2026-10-00",
    "2026-10-32",
    "05/11/2026",
    "2026-1-5",
    "2026-11-05T10:00:00Z",
    "26-11-05",
    "abc",
    "1999-12-31",
    "2101-01-01",
  ])("recusa %j", (texto) => {
    expect(lerDataSoDia(texto)).toEqual({ ok: false });
  });
  it("dataParaCampo faz o caminho de volta", () => {
    const r = lerDataSoDia("2026-11-05");
    expect(r.ok && dataParaCampo(r.data)).toBe("2026-11-05");
    expect(dataParaCampo(null)).toBe("");
    expect(dataParaCampo(undefined)).toBe("");
    expect(dataParaCampo(new Date("lixo"))).toBe("");
  });
});

describe("normalizarObservacao", () => {
  it("apara as pontas e junta quebras de linha do Windows", () => {
    expect(normalizarObservacao("  ligar\r\nsegunda  ")).toBe("ligar\nsegunda");
  });
  it("tira caracteres de controle e troca tab por espaço", () => {
    expect(normalizarObservacao("a\u0000b\u0007c\td")).toBe("abc d");
  });
  it("limita linhas em branco seguidas a uma", () => {
    expect(normalizarObservacao("a\n\n\n\n\nb")).toBe("a\n\nb");
  });
  it("tira espaço no fim da linha", () => {
    expect(normalizarObservacao("a   \nb")).toBe("a\nb");
  });
  it("só espaços vira vazio", () => {
    expect(normalizarObservacao("  \n \t ")).toBe("");
  });
  it("tira os caracteres que mudam a direção do texto e os separadores de linha incomuns", () => {
    expect(normalizarObservacao("ligar\u202eamanhã\u202c")).toBe("ligaramanhã");
    expect(normalizarObservacao("a\u2066b\u2069c")).toBe("abc");
    expect(normalizarObservacao("a\u2028b\u2029c\u0085d")).toBe("abcd");
  });
  it("mantém acentos, emoji e a quebra de linha comum", () => {
    expect(normalizarObservacao("Atenção: é com o João 👍\nvoltar")).toBe("Atenção: é com o João 👍\nvoltar");
  });
});

describe("listas do cartão", () => {
  it("listaDeCsv tira vazios e repetições", () => {
    expect(listaDeCsv("veiculos, limpeza,,veiculos ")).toEqual(["veiculos", "limpeza"]);
    expect(listaDeCsv("")).toEqual([]);
    expect(listaDeCsv(null)).toEqual([]);
    expect(listaDeCsv(undefined)).toEqual([]);
  });
  it("limitarLista corta e conta o resto", () => {
    expect(limitarLista(["a", "b", "c", "d"], 2)).toEqual({ mostrar: ["a", "b"], resto: 2 });
    expect(limitarLista(["a"], 3)).toEqual({ mostrar: ["a"], resto: 0 });
    expect(limitarLista([], 3)).toEqual({ mostrar: [], resto: 0 });
  });
});

describe("cortarTexto", () => {
  it("não mexe no que cabe e corta o resto com reticências", () => {
    expect(cortarTexto("ligar segunda", 20)).toBe("ligar segunda");
    expect(cortarTexto("ligar na segunda-feira", 10)).toBe("ligar na…");
    expect(cortarTexto("ABC DEF", 4)).toBe("ABC…");
  });
});

describe("ufValida", () => {
  it("só as 27 siglas, em maiúsculas", () => {
    expect(ufValida("GO")).toBe(true);
    expect(ufValida("go")).toBe(false);
    expect(ufValida("XX")).toBe(false);
    expect(ufValida(null)).toBe(false);
  });
});
