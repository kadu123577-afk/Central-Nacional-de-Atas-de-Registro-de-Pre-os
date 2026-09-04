import { describe, expect, it } from "vitest";
import {
  extrairCnpjDoNumeroControlePncp,
  mapearAtaComprasGov,
  mapearItemComprasGov,
  mapearItensDaCompra,
  montarUrlConsultarArp,
  montarUrlConsultarArpItem,
  type AtaComprasGovBruta,
  type ItemComprasGovBruto,
} from "./compras-gov";

describe("montarUrlConsultarArp", () => {
  it("formata as datas como AAAA-MM-DD e inclui paginação", () => {
    const url = montarUrlConsultarArp({
      dataVigenciaInicialMin: new Date(2026, 7, 1), // agosto (mês 0-indexado)
      dataVigenciaInicialMax: new Date(2026, 7, 31),
      pagina: 2,
      tamanhoPagina: 50,
    });

    expect(url).toBe(
      "https://dadosabertos.compras.gov.br/modulo-arp/1_consultarARP?dataVigenciaInicialMin=2026-08-01&dataVigenciaInicialMax=2026-08-31&pagina=2&tamanhoPagina=50",
    );
  });

  it("usa o tamanho de página padrão quando não informado", () => {
    const url = montarUrlConsultarArp({
      dataVigenciaInicialMin: new Date(2026, 0, 1),
      dataVigenciaInicialMax: new Date(2026, 0, 2),
      pagina: 1,
    });
    expect(url).toContain("tamanhoPagina=100");
  });

  it("limita tamanhoPagina ao intervalo aceito pela API (10-500)", () => {
    const urlBaixo = montarUrlConsultarArp({
      dataVigenciaInicialMin: new Date(2026, 0, 1),
      dataVigenciaInicialMax: new Date(2026, 0, 2),
      pagina: 1,
      tamanhoPagina: 1,
    });
    expect(urlBaixo).toContain("tamanhoPagina=10");

    const urlAlto = montarUrlConsultarArp({
      dataVigenciaInicialMin: new Date(2026, 0, 1),
      dataVigenciaInicialMax: new Date(2026, 0, 2),
      pagina: 1,
      tamanhoPagina: 9999,
    });
    expect(urlAlto).toContain("tamanhoPagina=500");
  });
});

describe("montarUrlConsultarArpItem", () => {
  it("monta a URL de itens de uma compra (não filtra por ata — ver mapearItensDaCompra)", () => {
    const url = montarUrlConsultarArpItem({
      dataVigenciaInicialMin: new Date(2026, 7, 1),
      dataVigenciaInicialMax: new Date(2026, 7, 31),
      numeroCompra: "90005",
      codigoUnidadeGerenciadora: "925000",
    });
    expect(url).toBe(
      "https://dadosabertos.compras.gov.br/modulo-arp/2_consultarARPItem?dataVigenciaInicialMin=2026-08-01&dataVigenciaInicialMax=2026-08-31&numeroCompra=90005&codigoUnidadeGerenciadora=925000&pagina=1&tamanhoPagina=100",
    );
  });
});

describe("extrairCnpjDoNumeroControlePncp", () => {
  it("extrai os 14 dígitos iniciais do número de controle", () => {
    expect(extrairCnpjDoNumeroControlePncp("12345678000199-1-000042/2026-1")).toBe(
      "12345678000199",
    );
  });

  it("retorna null para formato que não bate ou valor ausente", () => {
    expect(extrairCnpjDoNumeroControlePncp("formato-invalido")).toBeNull();
    expect(extrairCnpjDoNumeroControlePncp(null)).toBeNull();
    expect(extrairCnpjDoNumeroControlePncp(undefined)).toBeNull();
  });
});

describe("mapearAtaComprasGov", () => {
  // Exemplo fiel ao formato real confirmado ao vivo em 2026-09-04 contra
  // GET /modulo-arp/1_consultarARP.
  const exemplo: AtaComprasGovBruta = {
    numeroAtaRegistroPreco: "042",
    codigoUnidadeGerenciadora: "123456",
    nomeUnidadeGerenciadora: "Prefeitura Municipal de Exemplo",
    codigoOrgao: 987,
    nomeOrgao: "Prefeitura Municipal de Exemplo",
    numeroCompra: "90042",
    anoCompra: "2026",
    dataAssinatura: "2026-07-28",
    dataVigenciaInicial: "2026-08-01",
    dataVigenciaFinal: "2027-08-01",
    valorTotal: 100000,
    statusAta: "Vigente",
    objeto: "Registro de preços para aquisição de material hospitalar",
    quantidadeItens: 3,
    ataExcluido: false,
    numeroControlePncpAta: "12345678000199-1-000042/2026-1",
    numeroControlePncpCompra: "12345678000199-1-000042/2026",
    idCompra: "1",
  };

  it("monta o número da ata como numeroAtaRegistroPreco/anoCompra", () => {
    expect(mapearAtaComprasGov(exemplo).numero).toBe("042/2026");
  });

  it("preserva as duas chaves de deduplicação (ata e compra de origem)", () => {
    const resultado = mapearAtaComprasGov(exemplo);
    expect(resultado.numeroControlePncp).toBe("12345678000199-1-000042/2026-1");
    expect(resultado.numeroControlePncpCompra).toBe("12345678000199-1-000042/2026");
  });

  it("mapeia o órgão gerenciador extraindo o CNPJ do número de controle", () => {
    const resultado = mapearAtaComprasGov(exemplo);
    expect(resultado.orgaoGerenciador).toEqual({
      nome: "Prefeitura Municipal de Exemplo",
      cnpj: "12345678000199",
    });
  });

  it("converte as datas de assinatura e vigência final", () => {
    const resultado = mapearAtaComprasGov(exemplo);
    expect(resultado.dataAssinatura.toISOString().slice(0, 10)).toBe("2026-07-28");
    expect(resultado.dataVigenciaFim.toISOString().slice(0, 10)).toBe("2027-08-01");
  });

  it("propaga o status de exclusão como cancelada", () => {
    expect(mapearAtaComprasGov({ ...exemplo, ataExcluido: true }).cancelada).toBe(true);
  });

  it("usa nomeUnidadeGerenciadora quando nomeOrgao vem vazio", () => {
    const resultado = mapearAtaComprasGov({ ...exemplo, nomeOrgao: "" });
    expect(resultado.orgaoGerenciador.nome).toBe("Prefeitura Municipal de Exemplo");
  });
});

describe("mapearItemComprasGov", () => {
  const exemplo: ItemComprasGovBruto = {
    numeroAtaRegistroPreco: "042",
    numeroItem: "00001",
    codigoItem: 555,
    descricaoItem: "Luva de procedimento, látex, tamanho M",
    tipoItem: "Material",
    quantidadeHomologadaItem: 5000,
    niFornecedor: "98765432000188",
    nomeRazaoSocialFornecedor: "Distribuidora Hospitalar LTDA",
    valorUnitario: 24.9,
    valorTotal: 124500,
    codigoPdm: 12,
    nomePdm: "Luvas cirúrgicas",
  };

  it("mapeia os campos básicos do item, incluindo o fornecedor já junto", () => {
    const resultado = mapearItemComprasGov(exemplo);
    expect(resultado).toEqual({
      numeroAtaRegistroPreco: "042",
      numeroItem: "00001",
      descricao: "Luva de procedimento, látex, tamanho M",
      categoria: "Material",
      quantidadeRegistrada: 5000,
      valorUnitario: 24.9,
      fornecedor: {
        cnpj: "98765432000188",
        razaoSocial: "Distribuidora Hospitalar LTDA",
      },
    });
  });

  it("mapeia tipoItem 'Serviço' como categoria Serviço", () => {
    expect(mapearItemComprasGov({ ...exemplo, tipoItem: "Serviço" }).categoria).toBe("Serviço");
  });
});

describe("mapearItensDaCompra", () => {
  const itemAta042: ItemComprasGovBruto = {
    numeroAtaRegistroPreco: "042",
    numeroItem: "00001",
    codigoItem: 555,
    descricaoItem: "Luva de procedimento, látex, tamanho M",
    tipoItem: "Material",
    quantidadeHomologadaItem: 5000,
    niFornecedor: "98765432000188",
    nomeRazaoSocialFornecedor: "Distribuidora Hospitalar LTDA",
    valorUnitario: 24.9,
    valorTotal: 124500,
  };
  const itemAta043: ItemComprasGovBruto = {
    ...itemAta042,
    numeroAtaRegistroPreco: "043",
    numeroItem: "00002",
    descricaoItem: "Máscara cirúrgica descartável",
  };

  it("filtra só os itens da ata pedida quando a compra gerou mais de uma", () => {
    const resultado = mapearItensDaCompra([itemAta042, itemAta043], "042");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].descricao).toBe("Luva de procedimento, látex, tamanho M");
  });

  it("retorna lista vazia quando nenhum item bate com a ata pedida", () => {
    expect(mapearItensDaCompra([itemAta042], "999")).toEqual([]);
  });
});
