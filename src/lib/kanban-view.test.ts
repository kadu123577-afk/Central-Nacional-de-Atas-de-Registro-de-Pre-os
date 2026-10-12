import { describe, expect, it } from "vitest";
import { haQuantoTempo, mesesDesde, montarCartao, nivelFrescor, porQueAgoraDoRaioX, totalDaColuna } from "./kanban-view";
import { CARGO_ADMINISTRACAO, CARGO_PREFEITO } from "./decisores";

const agora = new Date("2026-10-04T12:00:00Z");
const dia = (n: number) => new Date(agora.getTime() - n * 24 * 60 * 60 * 1000);

const base = {
  id: "o1",
  entidadeAlvoId: "e1",
  nomeMunicipio: "Prefeitura de Teste",
  uf: "GO",
  estagio: "a_contatar",
  observacoes: null,
  prazoEm: new Date(agora.getTime() + 2 * 24 * 60 * 60 * 1000),
  proximoContatoEm: null,
  valorAderido: null,
  percentualComissao: null,
  contatos: [],
  necessidades: [],
  interacoes: [],
  liquidacoes: [],
  sinais: [],
};

const qualidade = {
  fonte: null,
  fonteUrl: null,
  confianca: null,
  verificadoEm: null,
  contatoErradoEm: null,
  contatoErradoMotivo: null,
};

describe("haQuantoTempo", () => {
  it("hoje, dias e meses", () => {
    expect(haQuantoTempo(agora.toISOString(), agora)).toBe("hoje");
    expect(haQuantoTempo(dia(1).toISOString(), agora)).toBe("há 1 dia");
    expect(haQuantoTempo(dia(9).toISOString(), agora)).toBe("há 9 dias");
    expect(haQuantoTempo(dia(90).toISOString(), agora)).toBe("há 3 meses");
  });
});

describe("nivelFrescor", () => {
  it("3 barras até 30 dias, 2 até 90, 1 depois ou sem dado", () => {
    expect(nivelFrescor(5)).toBe(3);
    expect(nivelFrescor(30)).toBe(3);
    expect(nivelFrescor(60)).toBe(2);
    expect(nivelFrescor(120)).toBe(1);
    expect(nivelFrescor(null)).toBe(1);
  });
});

describe("porQueAgoraDoRaioX", () => {
  it("sem categoria ou sem necessidade não inventa nada", () => {
    expect(porQueAgoraDoRaioX(null, undefined, agora)).toBeNull();
    expect(porQueAgoraDoRaioX("veiculos", undefined, agora)).toBeNull();
  });

  it("contratação antiga vira necessidade recorrente", () => {
    const n = {
      categoria: "veiculos",
      ultimaContratacao: dia(800).toISOString(),
      valor: 1,
      quantidadeContratos: 1,
      objeto: "x",
    };
    expect(porQueAgoraDoRaioX("veiculos", n, agora)).toContain("necessidade recorrente");
    expect(mesesDesde(n.ultimaContratacao, agora)).toBeGreaterThanOrEqual(24);
  });
});

describe("montarCartao", () => {
  it("município sem contatos: sem decisor e sem canal", () => {
    const c = montarCartao(base, { categoriaAta: "veiculos", percentualContrato: 0.075 }, agora);
    expect(c.principal).toBeNull();
    expect(c.semCanal).toBe(true);
    expect(c.urgencia.nivel).toBe("critico");
    expect(c.casaComAta).toBe(false);
  });

  it("escolhe decisor com canal, marca papéis e casa com a ata", () => {
    const c = montarCartao(
      {
        ...base,
        contatos: [
          {
            id: "p1",
            cargo: CARGO_PREFEITO,
            area: null,
            nomeContato: "Prefeito Teste",
            telefone: "(62) 3000-0000",
            email: null,
            particularidades: null,
            updatedAt: dia(5),
            ...qualidade,
          },
          {
            id: "p2",
            cargo: CARGO_ADMINISTRACAO,
            area: null,
            nomeContato: "Adm Teste",
            telefone: null,
            email: null,
            particularidades: null,
            updatedAt: dia(9),
            ...qualidade,
          },
        ],
        necessidades: [
          { categoria: "veiculos", ultimaContratacao: dia(100), valor: 820000, quantidadeContratos: 2, objeto: "x" },
        ],
      },
      { categoriaAta: "veiculos", percentualContrato: 0.075 },
      agora,
    );
    expect(c.principal?.nomeContato).toBe("Prefeito Teste");
    expect(c.semCanal).toBe(false);
    expect(c.frescorDias).toBe(5);
    expect(c.casaComAta).toBe(true);
    expect(c.valorEstimado).toBe(820000);
    expect(c.contatos[0].id).toBe("p1");
    expect(c.contatos[0].papel).toBe("principal");
    expect(c.contatos[1].papel).toBe("apoio");
  });

  it("aderiu: liquidado e comissão", () => {
    const c = montarCartao(
      {
        ...base,
        estagio: "aderiu",
        valorAderido: 800000,
        percentualComissao: 0.075,
        liquidacoes: [
          { valorLiquidado: 200000, statusCobranca: "recebida" },
          { valorLiquidado: 100000, statusCobranca: "pendente" },
        ],
      },
      { categoriaAta: "veiculos", percentualContrato: 0.075 },
      agora,
    );
    expect(c.liquidado).toBe(300000);
    expect(c.comissaoDevida).toBeCloseTo(22500);
    expect(c.comissaoRecebida).toBeCloseTo(15000);
  });
});

describe("totalDaColuna", () => {
  it("aderiu soma o aderido; abertas somam o estimado; recusou é nulo", () => {
    const mk = (valorAderido: number | null, valorEstimado: number | null) =>
      ({ valorAderido, valorEstimado }) as never;
    expect(totalDaColuna([mk(100, null), mk(50, null)], "aderiu")).toBe(150);
    expect(totalDaColuna([mk(null, 10), mk(null, 5), mk(null, null)], "em_negociacao")).toBe(15);
    expect(totalDaColuna([mk(null, null)], "em_negociacao")).toBeNull();
    expect(totalDaColuna([], "recusado")).toBeNull();
  });
});

describe("montarCartao: linha 'por que agora' com sinais automáticos", () => {
  const sinal = (extra: Record<string, unknown>) => ({
    id: Math.random().toString(36).slice(2),
    tipo: "orcamento",
    titulo: "Orçamento 2025: despesa com Saúde cresceu 30%",
    detalhe: null,
    fonte: "SICONFI",
    fonteUrl: null,
    categoria: null,
    valorEstimado: null,
    dataSinal: agora.toISOString(),
    expiraEm: null,
    ...extra,
  });
  const necessidade = {
    categoria: "veiculos",
    ultimaContratacao: new Date("2023-01-10T00:00:00Z"),
    valor: 300_000,
    quantidadeContratos: 2,
    objeto: "Aquisição de veículos",
  };

  it("orçamento genérico não ganha do raio-X da categoria", () => {
    const c = montarCartao({ ...base, necessidades: [necessidade], sinais: [sinal({})] }, { categoriaAta: "veiculos", percentualContrato: null }, agora);
    expect(c.porQueAgora).toContain("necessidade recorrente");
  });

  it("sem raio-X, o orçamento genérico aparece", () => {
    const c = montarCartao({ ...base, sinais: [sinal({})] }, { categoriaAta: "veiculos", percentualContrato: null }, agora);
    expect(c.porQueAgora).toContain("Orçamento 2025");
  });

  it("contrato vencendo da categoria passa na frente de tudo", () => {
    const c = montarCartao(
      {
        ...base,
        necessidades: [necessidade],
        sinais: [sinal({}), sinal({ tipo: "contrato_vencendo", categoria: "veiculos", titulo: "Contrato vence em 01/12/2026: Locação de veículos" })],
      },
      { categoriaAta: "veiculos", percentualContrato: null },
      agora,
    );
    expect(c.porQueAgora).toBe("Contrato vence em 01/12/2026: Locação de veículos");
  });
});

describe("montarCartao: contrato sem categoria não vira a linha", () => {
  it("contrato vencendo de obra (sem categoria) não aparece para ata de veículos", () => {
    const c = montarCartao(
      {
        ...base,
        sinais: [
          {
            id: "obra",
            tipo: "contrato_vencendo",
            titulo: "Contrato vence em 01/12/2026: Obras de calçamento",
            detalhe: null,
            fonte: "PNCP",
            fonteUrl: null,
            categoria: null,
            valorEstimado: 1_000_000,
            dataSinal: agora.toISOString(),
            expiraEm: null,
          },
        ],
      },
      { categoriaAta: "veiculos", percentualContrato: null },
      agora,
    );
    expect(c.porQueAgora).toBeNull();
    expect(c.sinais).toHaveLength(1);
  });
});
