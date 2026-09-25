import { describe, expect, it } from "vitest";
import {
  mapearContratoPncp,
  montarUrlContratosOrgao,
  quebrarEmJanelasAnuais,
  type ContratoPncpBruto,
} from "./pncp-historico";

describe("montarUrlContratosOrgao", () => {
  it("formata as datas como AAAAMMDD e inclui o CNPJ do órgão", () => {
    const url = montarUrlContratosOrgao({
      cnpjOrgao: "45299104000187",
      dataInicial: new Date(2025, 0, 1),
      dataFinal: new Date(2025, 11, 31),
      pagina: 1,
    });
    expect(url).toBe(
      "https://pncp.gov.br/api/consulta/v1/contratos?cnpjOrgao=45299104000187&dataInicial=20250101&dataFinal=20251231&pagina=1&tamanhoPagina=100",
    );
  });
});

describe("mapearContratoPncp", () => {
  const exemplo: ContratoPncpBruto = {
    numeroControlePNCP: "45299104000187-2-000114/2024",
    objetoContrato: "Pavimentação asfáltica da Avenida Exemplo",
    dataAssinatura: "2024-12-23",
    valorGlobal: 150000.5,
    orgaoEntidade: { cnpj: "45299104000187", razaoSocial: "MUNICIPIO DE EXEMPLO" },
  };

  it("mapeia os campos básicos do contrato", () => {
    const resultado = mapearContratoPncp(exemplo);
    expect(resultado.numeroControlePncp).toBe("45299104000187-2-000114/2024");
    expect(resultado.objeto).toBe("Pavimentação asfáltica da Avenida Exemplo");
    expect(resultado.valorGlobal).toBe(150000.5);
    expect(resultado.dataAssinatura.toISOString().slice(0, 10)).toBe("2024-12-23");
  });
});

describe("quebrarEmJanelasAnuais", () => {
  it("não quebra um intervalo que já cabe em 365 dias", () => {
    const janelas = quebrarEmJanelasAnuais(new Date(2025, 0, 1), new Date(2025, 5, 30));
    expect(janelas).toHaveLength(1);
    expect(janelas[0].inicio).toEqual(new Date(2025, 0, 1));
    expect(janelas[0].fim).toEqual(new Date(2025, 5, 30));
  });

  it("quebra um intervalo de vários anos em blocos de no máximo 365 dias", () => {
    const janelas = quebrarEmJanelasAnuais(new Date(2021, 0, 1), new Date(2026, 8, 25));
    expect(janelas.length).toBeGreaterThan(1);

    for (const janela of janelas) {
      const dias = (janela.fim.getTime() - janela.inicio.getTime()) / 86_400_000;
      expect(dias).toBeLessThanOrEqual(365);
    }

    // As janelas cobrem o intervalo pedido sem buraco nem sobreposição.
    expect(janelas[0].inicio).toEqual(new Date(2021, 0, 1));
    expect(janelas[janelas.length - 1].fim).toEqual(new Date(2026, 8, 25));
    for (let i = 1; i < janelas.length; i++) {
      const diaSeguinte = new Date(janelas[i - 1].fim);
      diaSeguinte.setDate(diaSeguinte.getDate() + 1);
      expect(janelas[i].inicio).toEqual(diaSeguinte);
    }
  });
});
