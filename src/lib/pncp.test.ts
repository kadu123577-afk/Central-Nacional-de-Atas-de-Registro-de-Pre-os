import { describe, expect, it } from "vitest";
import { mapearAtaPncp, montarUrlConsultaAtas, type AtaPncpBruta } from "./pncp";

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
  // (campos de /v1/atas: numeroControlePNCPAta, numeroAtaRegistroPreco,
  // anoAta, cnpjOrgao, nomeOrgao, objetoContratacao, vigenciaInicio,
  // vigenciaFim, dataAssinatura, cancelado, dataPublicacaoPncp).
  const exemplo: AtaPncpBruta = {
    numeroControlePNCPAta: "12345678000199-1-000042/2026",
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

  it("preserva a chave de deduplicação do PNCP", () => {
    expect(mapearAtaPncp(exemplo).numeroControlePncp).toBe("12345678000199-1-000042/2026");
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
