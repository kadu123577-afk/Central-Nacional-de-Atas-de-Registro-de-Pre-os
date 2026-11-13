import { describe, expect, it } from "vitest";
import { situacaoDoCiclo, type DadosDoCiclo } from "./ciclo-ata";
import type { AtaNoCiclo } from "./ciclo-ata-db";
import {
  TAMANHO_MINIMO_DO_TOKEN,
  autorizarRenata,
  montarAndamentoDoCiclo,
  montarSaldoDasAtas,
  montarVendasPorConsultor,
  renataApiLigada,
} from "./renata-api";

const TOKEN = "t".repeat(TAMANHO_MINIMO_DO_TOKEN);
const LIGADO = { RENATA_API_ATIVA: "sim", RENATA_API_TOKEN: TOKEN };
const pedido = (authorization?: string) => new Request("http://x/api/renata/atas", { headers: authorization ? { authorization } : {} });

describe("a leitura da Renata nasce desligada", () => {
  it.each([
    ["sem nenhuma variável", {}],
    ["só o token, sem ligar", { RENATA_API_TOKEN: TOKEN }],
    ["ligada sem token", { RENATA_API_ATIVA: "sim" }],
    ["token curto demais", { RENATA_API_ATIVA: "sim", RENATA_API_TOKEN: "curto" }],
    ["ligada com outro valor", { RENATA_API_ATIVA: "true", RENATA_API_TOKEN: TOKEN }],
    ["ligada vazia", { RENATA_API_ATIVA: "", RENATA_API_TOKEN: TOKEN }],
  ])("desligada: %s", (_nome, env) => {
    expect(renataApiLigada(env)).toBe(false);
    // Desligada responde 404, como se a rota não existisse, mesmo com o cabeçalho certo.
    expect(autorizarRenata(pedido(`Bearer ${TOKEN}`), env)).toEqual({ ok: false, status: 404 });
  });

  it("liga só com as duas variáveis juntas", () => {
    expect(renataApiLigada(LIGADO)).toBe(true);
  });
});

describe("autorizarRenata", () => {
  it("aceita o token certo no formato Bearer", () => {
    expect(autorizarRenata(pedido(`Bearer ${TOKEN}`), LIGADO)).toEqual({ ok: true });
  });

  it.each([
    ["sem cabeçalho", undefined],
    ["token errado", `Bearer ${"x".repeat(TAMANHO_MINIMO_DO_TOKEN)}`],
    ["sem a palavra Bearer", TOKEN],
    ["minúsculas", `bearer ${TOKEN}`],
    ["token com sobra", `Bearer ${TOKEN}x`],
    ["token cortado", `Bearer ${TOKEN.slice(1)}`],
    ["Basic", `Basic ${TOKEN}`],
  ])("recusa com 401: %s", (_nome, cabecalho) => {
    expect(autorizarRenata(pedido(cabecalho), LIGADO)).toEqual({ ok: false, status: 401 });
  });
});

describe("saldo das atas", () => {
  const ata = {
    id: "ata1",
    tituloPublico: null,
    categoria: "material-escritorio",
    dataVigenciaFim: new Date("2027-06-30T00:00:00Z"),
    itens: [
      { id: "i1", descricao: "Papel sulfite A4", unidade: "Caixa", valorUnitario: "25.90", quantidadeRegistrada: 1000, quantidadeConsumida: 1950 },
      { id: "i2", descricao: "Caneta azul", unidade: "Un", valorUnitario: "1.50", quantidadeRegistrada: 5, quantidadeConsumida: 0 },
    ],
  };

  it("mostra quanto cabe por município (50%) e no total (200%), em inteiros", () => {
    const [saida] = montarSaldoDasAtas([ata]);
    expect(saida.itens[0]).toMatchObject({ valorUnitario: 25.9, quantidadeAderida: 1950, maximoPorMunicipio: 500, disponivelNoTotal: 50 });
    // 50% de 5 = 2,5 → 2; 200% de 5 = 10.
    expect(saida.itens[1]).toMatchObject({ maximoPorMunicipio: 2, disponivelNoTotal: 10 });
    expect(saida.vigenciaFim).toBe("2027-06-30");
  });

  it("o disponível nunca fica negativo", () => {
    const [saida] = montarSaldoDasAtas([{ ...ata, itens: [{ ...ata.itens[0], quantidadeConsumida: 2500 }] }]);
    expect(saida.itens[0].disponivelNoTotal).toBe(0);
  });

  it("usa o título público escrito pela equipe ou o genérico da categoria, nunca o objeto original", () => {
    expect(montarSaldoDasAtas([{ ...ata, tituloPublico: "  Ata de papelaria  " }])[0].titulo).toBe("Ata de papelaria");
    expect(montarSaldoDasAtas([ata])[0].titulo).toMatch(/^Ata de /);
  });

  it("não devolve número da ata, objeto, fornecedor, órgão nem CNPJ", () => {
    const texto = JSON.stringify(montarSaldoDasAtas([ata]));
    for (const proibido of ["numero", "objeto", "fornecedor", "orgao", "cnpj", "email", "telefone"]) {
      expect(texto.toLowerCase()).not.toContain(`"${proibido}`);
    }
  });
});

describe("vendas por consultor", () => {
  const linhas = [
    { vendedorId: "v1", nome: "Leide", estagio: "em_negociacao", quantidade: 4, valorAderido: 0 },
    { vendedorId: "v1", nome: "Leide", estagio: "aderiu", quantidade: 2, valorAderido: 50000 },
    { vendedorId: "v2", nome: "Outro", estagio: "aderiu", quantidade: 1, valorAderido: 90000 },
    { vendedorId: "v2", nome: "Outro", estagio: "estagio_novo", quantidade: 3, valorAderido: 0 },
  ];

  it("agrupa por consultor, conta cada estágio e soma só o valor aderido", () => {
    const saida = montarVendasPorConsultor(linhas);
    expect(saida.find((c) => c.id === "v1")).toEqual({
      id: "v1",
      nome: "Leide",
      estagios: { a_contatar: 0, em_negociacao: 4, aderiu: 2, recusado: 0 },
      totalAderido: 50000,
    });
  });

  it("ordena por valor aderido, do maior para o menor", () => {
    expect(montarVendasPorConsultor(linhas).map((c) => c.id)).toEqual(["v2", "v1"]);
  });

  it("estágio desconhecido não quebra nem entra na conta", () => {
    const v2 = montarVendasPorConsultor(linhas).find((c) => c.id === "v2");
    expect(v2?.estagios).toEqual({ a_contatar: 0, em_negociacao: 0, aderiu: 1, recusado: 0 });
  });

  it("sem linhas, lista vazia", () => {
    expect(montarVendasPorConsultor([])).toEqual([]);
  });
});

describe("andamento do ciclo", () => {
  const d = (iso: string) => new Date(`${iso}T15:00:00Z`);
  function ataNoCiclo(id: string, extra: Partial<DadosDoCiclo>): AtaNoCiclo {
    const dados: DadosDoCiclo = {
      status: "PENDENTE",
      criadaEm: d("2026-11-02"),
      atualizadaEm: d("2026-11-02"),
      fornecedorAConfirmar: false,
      totalItens: 0,
      contratoEm: null,
      conformidadeEm: null,
      categoria: "material-escritorio",
      ...extra,
    };
    return { id, numero: "12/2026", objeto: "Objeto secreto", fornecedor: "Empresa X", origem: "PNCP", dados, situacao: situacaoDoCiclo(dados) };
  }

  it("diz a etapa, desde quando espera e o prazo em dias úteis", () => {
    const saida = montarAndamentoDoCiclo([ataNoCiclo("a1", {})], d("2026-11-10"));
    expect(saida.total).toBe(1);
    expect(saida.porEtapa).toEqual({ "3": 1 });
    expect(saida.atas[0]).toMatchObject({
      id: "a1",
      etapa: { numero: 3, titulo: "Cadastrar itens e saldos" },
      esperandoDesde: "2026-11-02",
      // Prazo de 1 dia útil desde segunda 2/11 (feriado de Finados): vence quarta 4/11... e já passou.
      prazo: { situacao: "atrasado" },
    });
  });

  it("não devolve número, objeto nem fornecedor da ata", () => {
    const texto = JSON.stringify(montarAndamentoDoCiclo([ataNoCiclo("a1", {})], d("2026-11-10")));
    expect(texto).not.toContain("12/2026");
    expect(texto).not.toContain("Objeto secreto");
    expect(texto).not.toContain("Empresa X");
  });

  it("ata já liberada ou rejeitada não entra", () => {
    const rejeitada = ataNoCiclo("a2", { status: "REJEITADA", totalItens: 3 });
    expect(montarAndamentoDoCiclo([rejeitada], d("2026-11-10")).total).toBe(0);
  });
});
