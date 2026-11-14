import { describe, expect, it } from "vitest";
import { avisoDoPncp, buscarItensDaAtaNoPncp, compraDaAtaNoPncp, itensDoPncpParaTexto, jsonOuNull, type BuscarJson } from "./itens-pncp";
import { interpretarPlanilhaDeItens } from "./importar-itens";

const COMPRA = { cnpj: "03532661000156", ano: 2024, sequencialCompra: 75 };
const EMPRESA_A = "20720905000224";
const EMPRESA_B = "11222333000181";

function item(numeroItem: number, extra: Record<string, unknown> = {}) {
  return {
    numeroItem,
    materialOuServico: "M",
    descricao: `Item ${numeroItem}`,
    quantidade: 100,
    unidadeMedida: "Unidade",
    valorUnitarioEstimado: 10,
    ...extra,
  };
}

function resultado(numeroItem: number, niFornecedor: string, extra: Record<string, unknown> = {}) {
  return {
    numeroItem,
    quantidadeHomologada: 90,
    valorUnitarioHomologado: 8.5,
    tipoPessoa: "PJ",
    niFornecedor,
    nomeRazaoSocialFornecedor: "Empresa",
    dataCancelamento: null,
    ...extra,
  };
}

/** Um PNCP de mentira: a lista de itens da compra e os resultados de cada item. */
function pncp(itens: unknown[], resultados: Record<number, unknown[] | null>): { buscar: BuscarJson; chamadas: string[] } {
  const chamadas: string[] = [];
  const buscar: BuscarJson = async (url) => {
    chamadas.push(url);
    if (url.includes("/resultados")) {
      const n = Number(/itens\/(\d+)\/resultados/.exec(url)?.[1]);
      return resultados[n] ?? null;
    }
    const pagina = Number(/pagina=(\d+)/.exec(url)?.[1] ?? 1);
    return itens.slice((pagina - 1) * 100, pagina * 100);
  };
  return { buscar, chamadas };
}

describe("compraDaAtaNoPncp", () => {
  it("acha a compra pelo link da ata", () => {
    expect(compraDaAtaNoPncp({ linkPncp: "https://pncp.gov.br/app/atas/03532661000156/2024/75/1" })).toEqual(COMPRA);
  });

  it("acha pelo número de controle da ata ou da compra", () => {
    expect(compraDaAtaNoPncp({ numeroControlePncp: "03532661000156-1-000075/2024-000001" })).toEqual(COMPRA);
    expect(compraDaAtaNoPncp({ numeroControlePncp: "03532661000156-1-000075/2024" })).toEqual(COMPRA);
  });

  it("o link vale mais que o número; sem nenhum dos dois, ou com formato estranho, nada", () => {
    expect(compraDaAtaNoPncp({ linkPncp: "https://pncp.gov.br/app/atas/03532661000156/2024/75/1", numeroControlePncp: "99999999000199-1-000001/2020-1" })).toEqual(COMPRA);
    expect(compraDaAtaNoPncp({})).toBeNull();
    expect(compraDaAtaNoPncp({ linkPncp: "https://pncp.gov.br/app/editais/1/2/3" })).toBeNull();
    expect(compraDaAtaNoPncp({ numeroControlePncp: "PNCP-demo-00456" })).toBeNull();
  });
});

describe("buscarItensDaAtaNoPncp", () => {
  it("usa a quantidade e o valor HOMOLOGADOS (não os estimados) dos itens que a empresa da ata ganhou", async () => {
    const { buscar } = pncp([item(1), item(2)], { 1: [resultado(1, EMPRESA_A)], 2: [resultado(2, EMPRESA_A, { quantidadeHomologada: 40, valorUnitarioHomologado: 3.2 })] });
    const r = await buscarItensDaAtaNoPncp(COMPRA, { fornecedorCnpj: EMPRESA_A, buscarJson: buscar });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens.map((i) => [i.descricao, i.quantidadeRegistrada, i.valorUnitario])).toEqual([
      ["Item 1", 90, 8.5],
      ["Item 2", 40, 3.2],
    ]);
    expect(r).toMatchObject({ semResultado: 0, deOutraEmpresa: 0, comMaisDeQuatroCasas: 0, truncado: false, empresaNaoConfirmada: false });
  });

  it("separa os itens da empresa da ata: o que outra empresa ganhou e o que ninguém ganhou ficam de fora", async () => {
    const { buscar } = pncp([item(1), item(2), item(3), item(4)], {
      1: [resultado(1, EMPRESA_A)],
      2: [resultado(2, EMPRESA_B)],
      3: [],
      4: null,
    });
    const r = await buscarItensDaAtaNoPncp(COMPRA, { fornecedorCnpj: EMPRESA_A, buscarJson: buscar });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens.map((i) => i.numeroItem)).toEqual([1]);
    expect(r.deOutraEmpresa).toBe(1);
    expect(r.semResultado).toBe(2);
  });

  it("nenhum item ganho pela empresa da ata: erro claro", async () => {
    const { buscar } = pncp([item(1)], { 1: [resultado(1, EMPRESA_B)] });
    const r = await buscarItensDaAtaNoPncp(COMPRA, { fornecedorCnpj: EMPRESA_A, buscarJson: buscar });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toContain("ganho pela empresa da ata");
  });

  it("aceita o CNPJ da empresa com máscara e, entre vários classificados do item, escolhe o resultado dela", async () => {
    const { buscar } = pncp([item(1)], {
      1: [resultado(1, EMPRESA_B, { valorUnitarioHomologado: 7 }), resultado(1, EMPRESA_A, { valorUnitarioHomologado: 9 })],
    });
    const r = await buscarItensDaAtaNoPncp(COMPRA, { fornecedorCnpj: "20.720.905/0002-24", buscarJson: buscar });
    expect(r.ok && r.itens[0].valorUnitario).toBe(9);
  });

  it("resultado cancelado não conta", async () => {
    const { buscar } = pncp([item(1)], { 1: [resultado(1, EMPRESA_A, { dataCancelamento: "2025-01-01T00:00:00" })] });
    const r = await buscarItensDaAtaNoPncp(COMPRA, { fornecedorCnpj: EMPRESA_A, buscarJson: buscar });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toContain("Nenhum item");
  });

  it("sem CNPJ confirmado da empresa (ou com o provisório) usa o primeiro resultado de cada item e avisa", async () => {
    const { buscar } = pncp([item(1)], { 1: [resultado(1, EMPRESA_B)] });
    for (const cnpj of [null, "", "00000000000000"]) {
      const r = await buscarItensDaAtaNoPncp(COMPRA, { fornecedorCnpj: cnpj, buscarJson: buscar });
      expect(r.ok && r.empresaNaoConfirmada).toBe(true);
      expect(r.ok && r.itens).toHaveLength(1);
    }
  });

  it("conta só os preços com mais de quatro casas, que o sistema vai arredondar (0,1005 cabe)", async () => {
    const { buscar } = pncp([item(1), item(2), item(3)], { 1: [resultado(1, EMPRESA_A, { valorUnitarioHomologado: 0.10055 })], 2: [resultado(2, EMPRESA_A, { valorUnitarioHomologado: 0.1005 })], 3: [resultado(3, EMPRESA_A, { valorUnitarioHomologado: 4.25 })] });
    const r = await buscarItensDaAtaNoPncp(COMPRA, { fornecedorCnpj: EMPRESA_A, buscarJson: buscar });
    expect(r.ok && r.comMaisDeQuatroCasas).toBe(1);
  });

  it("lê todas as páginas de itens e respeita o teto, avisando que cortou", async () => {
    const muitos = Array.from({ length: 350 }, (_, i) => item(i + 1));
    const resultados = Object.fromEntries(muitos.map((m) => [m.numeroItem, [resultado(m.numeroItem, EMPRESA_A)]]));
    const { buscar } = pncp(muitos, resultados);
    const r = await buscarItensDaAtaNoPncp(COMPRA, { fornecedorCnpj: EMPRESA_A, buscarJson: buscar });
    expect(r.ok && r.itens.length).toBe(300);
    expect(r.ok && r.truncado).toBe(true);
  });

  it("compra com 120 itens: duas páginas, sem cortar", async () => {
    const itens = Array.from({ length: 120 }, (_, i) => item(i + 1));
    const resultados = Object.fromEntries(itens.map((m) => [m.numeroItem, [resultado(m.numeroItem, EMPRESA_A)]]));
    const { buscar, chamadas } = pncp(itens, resultados);
    const r = await buscarItensDaAtaNoPncp(COMPRA, { fornecedorCnpj: EMPRESA_A, buscarJson: buscar });
    expect(r.ok && r.itens.length).toBe(120);
    expect(r.ok && r.truncado).toBe(false);
    expect(chamadas.filter((c) => c.includes("/itens?"))).toHaveLength(2);
  });

  it("PNCP fora do ar, compra que não existe ou sem itens: erro claro, sem derrubar", async () => {
    const fora = await buscarItensDaAtaNoPncp(COMPRA, { buscarJson: async () => null });
    expect(fora.ok === false && fora.erro).toContain("Não consegui consultar o PNCP");
    const quebrou = await buscarItensDaAtaNoPncp(COMPRA, {
      buscarJson: async () => {
        throw new Error("rede");
      },
    });
    expect(quebrou.ok).toBe(false);
    const vazia = await buscarItensDaAtaNoPncp(COMPRA, { buscarJson: async () => [] });
    expect(vazia.ok === false && vazia.erro).toContain("nenhum item");
  });

  it("a consulta dos resultados que falha no meio do caminho vira erro, não lista pela metade", async () => {
    let n = 0;
    const r = await buscarItensDaAtaNoPncp(COMPRA, {
      fornecedorCnpj: EMPRESA_A,
      buscarJson: async (url) => {
        if (!url.includes("/resultados")) return [item(1), item(2)];
        n += 1;
        if (n === 2) throw new Error("timeout");
        return [resultado(1, EMPRESA_A)];
      },
    });
    expect(r.ok === false && r.erro).toContain("interrompida");
  });
});

describe("texto e aviso", () => {
  it("o texto vira uma planilha que o importador confere sem erro", async () => {
    const { buscar } = pncp([item(1, { descricao: 'Tubo 3/4" PVC' }), item(2)], {
      1: [resultado(1, EMPRESA_A, { valorUnitarioHomologado: 12.9 })],
      2: [resultado(2, EMPRESA_A)],
    });
    const r = await buscarItensDaAtaNoPncp(COMPRA, { fornecedorCnpj: EMPRESA_A, buscarJson: buscar });
    if (!r.ok) throw new Error("esperava ok");
    const lido = interpretarPlanilhaDeItens(itensDoPncpParaTexto(r.itens), "material-construcao");
    expect(lido.erros).toEqual([]);
    expect(lido.itens.map((i) => [i.descricao, i.quantidadeRegistrada, i.valorUnitario])).toEqual([
      ['Tubo 3/4" PVC', 90, "12.90"],
      ["Item 2", 90, "8.50"],
    ]);
  });

  it("o aviso diz o que entrou e o que ficou de fora", () => {
    const aviso = avisoDoPncp({ itens: [{ numeroItem: 1, descricao: "x", categoria: "Material", unidade: "u", quantidadeRegistrada: 1, valorUnitario: 1 }], semResultado: 2, deOutraEmpresa: 3, comMaisDeQuatroCasas: 1, truncado: true, empresaNaoConfirmada: true });
    for (const trecho of ["Li 1 item(ns)", "valor homologado", "3 item(ns) da compra foram ganhos por outra empresa", "2 item(ns) não têm resultado", "não está confirmada", "mais de quatro casas", "mais de 300 itens"]) {
      expect(aviso).toContain(trecho);
    }
    const limpo = avisoDoPncp({ itens: [], semResultado: 0, deOutraEmpresa: 0, comMaisDeQuatroCasas: 0, truncado: false, empresaNaoConfirmada: false });
    expect(limpo).not.toContain("ficaram de fora");
  });
});

describe("jsonOuNull", () => {
  it("devolve o JSON de uma resposta normal", async () => {
    expect(await jsonOuNull(new Response('[{"numeroItem":1}]', { status: 200 }))).toEqual([{ numeroItem: 1 }]);
  });

  it("204 (item que ninguém ganhou), corpo vazio, corpo que não é JSON e erro HTTP viram null, sem lançar", async () => {
    expect(await jsonOuNull(new Response(null, { status: 204 }))).toBeNull();
    expect(await jsonOuNull(new Response("", { status: 200 }))).toBeNull();
    expect(await jsonOuNull(new Response("   ", { status: 200 }))).toBeNull();
    expect(await jsonOuNull(new Response("<html>erro</html>", { status: 200 }))).toBeNull();
    expect(await jsonOuNull(new Response('{"a":1}', { status: 404 }))).toBeNull();
    expect(await jsonOuNull(new Response("x", { status: 500 }))).toBeNull();
  });

  it("a compra com um item sem resultado (204) não derruba a busca: os outros itens entram", async () => {
    const chamadas: string[] = [];
    const r = await buscarItensDaAtaNoPncp(COMPRA, {
      fornecedorCnpj: EMPRESA_A,
      buscarJson: async (url) => {
        chamadas.push(url);
        if (!url.includes("/resultados")) return [item(1), item(2)];
        // O item 1 devolve 204 (null depois de jsonOuNull); o item 2 tem resultado.
        return url.includes("/itens/1/") ? await jsonOuNull(new Response(null, { status: 204 })) : [resultado(2, EMPRESA_A)];
      },
    });
    expect(r.ok && r.itens.map((i) => i.numeroItem)).toEqual([2]);
    expect(r.ok && r.semResultado).toBe(1);
  });
});
