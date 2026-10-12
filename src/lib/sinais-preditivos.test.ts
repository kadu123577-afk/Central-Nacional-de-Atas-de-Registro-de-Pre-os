import { describe, expect, it } from "vitest";
import {
  frase,
  nomeFornecedorPublico,
  maisRelevantes,
  sinalDeContratoVencendo,
  sinaisDeOrcamento,
  sinaisDePca,
  urlContratoPncp,
  type ContratoPncp,
} from "./sinais-preditivos";

const hoje = new Date("2026-10-12T00:00:00Z");

const contrato = (extra: Partial<ContratoPncp>): ContratoPncp => ({
  numeroControlePNCP: "14147490000168-2-000216/2026",
  objetoContrato: "AQUISIÇÃO DE MATERIAL HOSPITALAR PARA A REDE MUNICIPAL",
  valorGlobal: 250_000,
  dataVigenciaFim: "2026-12-01",
  tipoContrato: { nome: "Contrato (termo inicial)" },
  categoriaProcesso: { nome: "Compras" },
  nomeRazaoSocialFornecedor: "DISTRIBUIDORA EXEMPLO LTDA",
  orgaoEntidade: { razaoSocial: "MUNICIPIO DE EXEMPLO" },
  ...extra,
});

describe("frase e urlContratoPncp", () => {
  it("só converte texto todo em maiúsculas", () => {
    expect(frase("AQUISIÇÃO DE PNEUS")).toBe("Aquisição de pneus");
    expect(frase("Aquisição de PNEUS")).toBe("Aquisição de PNEUS");
  });
  it("monta a URL pública do contrato", () => {
    expect(urlContratoPncp("14147490000168-2-000216/2026")).toBe("https://pncp.gov.br/app/contratos/14147490000168/2026/216");
    expect(urlContratoPncp("lixo")).toBeNull();
  });
});

describe("sinalDeContratoVencendo", () => {
  it("gera sinal para contrato que vence na janela", () => {
    const s = sinalDeContratoVencendo(contrato({}), hoje)!;
    expect(s.tipo).toBe("contrato_vencendo");
    expect(s.chaveExterna).toBe("pncp-contrato:14147490000168-2-000216/2026");
    expect(s.titulo).toContain("01/12/2026");
    expect(s.titulo).toContain("Aquisição de material hospitalar");
    expect(s.categoria).toBe("material-hospitalar");
    expect(s.detalhe).toContain("Fornecedor atual: Distribuidora exemplo ltda");
    expect(s.expiraEm.toISOString().slice(0, 10)).toBe("2026-12-16");
  });

  it("descarta empenho, locação, valor baixo, valor absurdo, vencido e muito distante", () => {
    expect(sinalDeContratoVencendo(contrato({ tipoContrato: { nome: "Empenho" } }), hoje)).toBeNull();
    expect(sinalDeContratoVencendo(contrato({ categoriaProcesso: { nome: "Locação Imóveis" } }), hoje)).toBeNull();
    expect(sinalDeContratoVencendo(contrato({ valorGlobal: 5_000 }), hoje)).toBeNull();
    expect(sinalDeContratoVencendo(contrato({ valorGlobal: 9e11 }), hoje)).toBeNull();
    expect(sinalDeContratoVencendo(contrato({ dataVigenciaFim: "2026-10-01" }), hoje)).toBeNull();
    expect(sinalDeContratoVencendo(contrato({ dataVigenciaFim: "2027-06-01" }), hoje)).toBeNull();
    expect(sinalDeContratoVencendo(contrato({ objetoContrato: "  " }), hoje)).toBeNull();
  });
});

describe("sinaisDePca", () => {
  const pca = {
    idPcaPncp: "04190765000192-0-000001/2026",
    orgaoEntidadeCnpj: "04190765000192",
    anoPca: 2026,
    itens: [
      { grupoContratacaoCodigo: "2-2026", grupoContratacaoNome: "Aquisição de Medicamentos", classificacaoSuperiorNome: "Dipirona 500mg", dataDesejada: "2026-11-10", valorTotal: 30_000, unidadeRequisitante: " Secretaria de Saúde" },
      { grupoContratacaoCodigo: "2-2026", grupoContratacaoNome: "Aquisição de Medicamentos", classificacaoSuperiorNome: "Dexametasona", dataDesejada: "2026-11-01", valorTotal: 15_000 },
      { grupoContratacaoCodigo: "3-2026", grupoContratacaoNome: "Pneus", classificacaoSuperiorNome: "Pneu 175/70", dataDesejada: "2027-09-01", valorTotal: 90_000 },
      { grupoContratacaoCodigo: "4-2026", grupoContratacaoNome: "Café", classificacaoSuperiorNome: "Café", dataDesejada: "2026-11-01", valorTotal: 5_000 },
    ],
  };

  it("agrupa por grupo de contratação, soma valores e usa a data mais próxima", () => {
    const s = sinaisDePca(pca, hoje);
    expect(s).toHaveLength(1);
    expect(s[0].chaveExterna).toBe("pncp-pca:04190765000192-0-000001/2026:2-2026");
    expect(s[0].valorEstimado).toBe(45_000);
    expect(s[0].titulo).toContain("PCA 2026 para 11/2026");
    expect(s[0].detalhe).toContain("2 itens");
    expect(s[0].detalhe).toContain("Secretaria de Saúde");
    expect(s[0].fonteUrl).toBe("https://pncp.gov.br/app/pca/04190765000192/2026");
  });

  it("sem id do PCA ou sem itens, nada", () => {
    expect(sinaisDePca({ itens: pca.itens }, hoje)).toEqual([]);
    expect(sinaisDePca({ idPcaPncp: "x", itens: [] }, hoje)).toEqual([]);
  });
});

describe("sinaisDeOrcamento", () => {
  const linhas = [
    { exercicio: 2024, coluna: "Despesas Empenhadas", conta: "10 - Saúde", valor: 10_000_000 },
    { exercicio: 2025, coluna: "Despesas Empenhadas", conta: "10 - Saúde", valor: 13_000_000 },
    { exercicio: 2024, coluna: "Despesas Empenhadas", conta: "12 - Educação", valor: 20_000_000 },
    { exercicio: 2025, coluna: "Despesas Empenhadas", conta: "12 - Educação", valor: 21_000_000 },
    { exercicio: 2024, coluna: "Despesas Empenhadas", conta: "01 - Legislativa", valor: 1_000_000 },
    { exercicio: 2025, coluna: "Despesas Empenhadas", conta: "01 - Legislativa", valor: 5_000_000 },
    { exercicio: 2025, coluna: "Despesas Pagas", conta: "10 - Saúde", valor: 99_000_000 },
  ];

  it("aponta só funções relevantes que cresceram acima do mínimo", () => {
    const s = sinaisDeOrcamento("1300029", linhas);
    expect(s).toHaveLength(1);
    expect(s[0].titulo.replace(/\s/g, " ")).toBe("Orçamento 2025: despesa com Saúde cresceu 30% (R$ 13.000.000)");
    expect(s[0].chaveExterna).toBe("siconfi-dca:1300029:2025:10");
    expect(s[0].categoria).toBeNull();
  });

  it("exige dois exercícios seguidos", () => {
    expect(sinaisDeOrcamento("1", linhas.filter((l) => l.exercicio === 2025))).toEqual([]);
  });
});

describe("maisRelevantes", () => {
  it("ordena por relevância, tira repetidos e corta em N", () => {
    const a = sinalDeContratoVencendo(contrato({ valorGlobal: 100_000 }), hoje)!;
    const b = sinalDeContratoVencendo(contrato({ numeroControlePNCP: "14147490000168-2-000300/2026", valorGlobal: 900_000 }), hoje)!;
    expect(maisRelevantes([a, b, a], 5).map((s) => s.valorEstimado)).toEqual([900_000, 100_000]);
    expect(maisRelevantes([a, b], 1)).toHaveLength(1);
  });
});

describe("nomeFornecedorPublico", () => {
  it("não identifica pessoa física e tira CPF de MEI", () => {
    expect(nomeFornecedorPublico("FULANO DE TAL", "PF")).toBe("pessoa física");
    expect(nomeFornecedorPublico("MATEUS SOUZA 12037624611", "PJ")).toBe("Mateus souza");
    expect(nomeFornecedorPublico("JOAO 120.376.246-11 ME", "PJ")).toBe("Joao me");
    expect(nomeFornecedorPublico("EMPRESA LTDA", "PJ")).toBe("Empresa ltda");
    expect(nomeFornecedorPublico(null, "PJ")).toBeNull();
  });
});
