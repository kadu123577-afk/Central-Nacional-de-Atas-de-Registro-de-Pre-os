import { describe, expect, it } from "vitest";
import {
  mapearAtaPncp,
  mapearFornecedorVencedor,
  mapearItemPncp,
  montarUrlConsultaAtas,
  montarUrlItensCompra,
  montarUrlResultadosItem,
  parseNumeroControlePncpCompra,
  type AtaPncpBruta,
  type ItemCompraPncpBruto,
  type ResultadoItemPncpBruto,
} from "./pncp";

describe("montarUrlConsultaAtas", () => {
  it("formata as datas como AAAAMMDD e inclui paginação", () => {
    const url = montarUrlConsultaAtas({
      dataInicial: new Date(2026, 7, 1), // agosto (mês 0-indexado)
      dataFinal: new Date(2026, 7, 31),
      pagina: 2,
      tamanhoPagina: 50,
    });

    expect(url).toBe(
      "https://pncp.gov.br/api/consulta/v1/atas?dataInicial=20260801&dataFinal=20260831&pagina=2&tamanhoPagina=50",
    );
  });

  it("usa o tamanho de página padrão quando não informado", () => {
    const url = montarUrlConsultaAtas({
      dataInicial: new Date(2026, 0, 1),
      dataFinal: new Date(2026, 0, 2),
      pagina: 1,
    });
    expect(url).toContain("tamanhoPagina=100");
  });
});

describe("mapearAtaPncp", () => {
  // Exemplo fiel ao formato documentado no manual de integração do PNCP
  // (campos de /v1/atas: numeroControlePNCPAta, numeroControlePNCPCompra,
  // numeroAtaRegistroPreco, anoAta, cnpjOrgao, nomeOrgao, objetoContratacao,
  // vigenciaInicio, vigenciaFim, dataAssinatura, cancelado,
  // dataPublicacaoPncp).
  const exemplo: AtaPncpBruta = {
    numeroControlePNCPAta: "12345678000199-1-000042/2026-1",
    numeroControlePNCPCompra: "12345678000199-1-000042/2026",
    numeroAtaRegistroPreco: "042",
    anoAta: 2026,
    cnpjOrgao: "12345678000199",
    nomeOrgao: "Prefeitura Municipal de Exemplo",
    objetoContratacao: "Registro de preços para aquisição de material hospitalar",
    vigenciaInicio: "2026-08-01",
    vigenciaFim: "2027-08-01",
    dataAssinatura: "2026-07-28",
    cancelado: false,
    dataPublicacaoPncp: "2026-07-29",
  };

  it("monta o número da ata como numeroAtaRegistroPreco/anoAta", () => {
    expect(mapearAtaPncp(exemplo).numero).toBe("042/2026");
  });

  it("preserva as duas chaves de deduplicação (ata e compra de origem)", () => {
    const resultado = mapearAtaPncp(exemplo);
    expect(resultado.numeroControlePncp).toBe("12345678000199-1-000042/2026-1");
    expect(resultado.numeroControlePncpCompra).toBe("12345678000199-1-000042/2026");
  });

  it("mapeia o órgão gerenciador a partir de nomeOrgao/cnpjOrgao", () => {
    const resultado = mapearAtaPncp(exemplo);
    expect(resultado.orgaoGerenciador).toEqual({
      nome: "Prefeitura Municipal de Exemplo",
      cnpj: "12345678000199",
    });
  });

  it("converte as datas de assinatura e vigência final", () => {
    const resultado = mapearAtaPncp(exemplo);
    expect(resultado.dataAssinatura.toISOString().slice(0, 10)).toBe("2026-07-28");
    expect(resultado.dataVigenciaFim.toISOString().slice(0, 10)).toBe("2027-08-01");
  });

  it("propaga o status de cancelamento", () => {
    expect(mapearAtaPncp({ ...exemplo, cancelado: true }).cancelada).toBe(true);
  });
});

describe("parseNumeroControlePncpCompra", () => {
  it("extrai cnpj, sequencial e ano do formato documentado", () => {
    expect(parseNumeroControlePncpCompra("12345678000199-1-000042/2026")).toEqual({
      cnpj: "12345678000199",
      sequencialCompra: 42,
      ano: 2026,
    });
  });

  it("retorna null para um formato que não bate com o padrão", () => {
    expect(parseNumeroControlePncpCompra("formato-invalido")).toBeNull();
    expect(parseNumeroControlePncpCompra("123-1-42/2026")).toBeNull(); // cnpj curto
  });
});

describe("montarUrlItensCompra", () => {
  it("monta a URL de itens da compra na API de órgãos", () => {
    const url = montarUrlItensCompra({
      cnpj: "12345678000199",
      ano: 2026,
      sequencialCompra: 42,
    });
    expect(url).toBe(
      "https://pncp.gov.br/api/pncp/v1/orgaos/12345678000199/compras/2026/42/itens?pagina=1&tamanhoPagina=100",
    );
  });
});

describe("montarUrlResultadosItem", () => {
  it("monta a URL de resultados de um item específico", () => {
    const url = montarUrlResultadosItem(
      { cnpj: "12345678000199", ano: 2026, sequencialCompra: 42 },
      3,
    );
    expect(url).toBe(
      "https://pncp.gov.br/api/pncp/v1/orgaos/12345678000199/compras/2026/42/itens/3/resultados",
    );
  });
});

describe("mapearItemPncp", () => {
  const exemplo: ItemCompraPncpBruto = {
    numeroItem: 1,
    materialOuServico: "M",
    descricao: "Luva de procedimento, látex, tamanho M",
    quantidade: 5000,
    unidadeMedida: "CAIXA",
    valorUnitarioEstimado: 24.9,
  };

  it("mapeia os campos básicos do item", () => {
    const resultado = mapearItemPncp(exemplo);
    expect(resultado).toEqual({
      numeroItem: 1,
      descricao: "Luva de procedimento, látex, tamanho M",
      categoria: "Material",
      unidade: "CAIXA",
      quantidadeRegistrada: 5000,
      valorUnitario: 24.9,
    });
  });

  it("mapeia materialOuServico 'S' como categoria Serviço", () => {
    expect(mapearItemPncp({ ...exemplo, materialOuServico: "S" }).categoria).toBe("Serviço");
  });
});

describe("mapearFornecedorVencedor", () => {
  const exemplo: ResultadoItemPncpBruto = {
    numeroItem: 1,
    quantidadeHomologada: 5000,
    valorUnitarioHomologado: 23.5,
    tipoPessoa: "PJ",
    niFornecedor: "98765432000188",
    nomeRazaoSocialFornecedor: "Distribuidora Hospitalar LTDA",
  };

  it("mapeia o fornecedor pessoa jurídica", () => {
    expect(mapearFornecedorVencedor(exemplo)).toEqual({
      cnpj: "98765432000188",
      razaoSocial: "Distribuidora Hospitalar LTDA",
    });
  });

  it("retorna null para pessoa física ou estrangeira (não cabe no cadastro de fornecedor)", () => {
    expect(mapearFornecedorVencedor({ ...exemplo, tipoPessoa: "PF" })).toBeNull();
    expect(mapearFornecedorVencedor({ ...exemplo, tipoPessoa: "PE" })).toBeNull();
  });
});
