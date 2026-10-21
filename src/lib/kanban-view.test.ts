import { describe, expect, it } from "vitest";
import {
  descreverVigencia,
  escolherContratoDetectado,
  haQuantoTempo,
  mesesDesde,
  montarCartao,
  nivelFrescor,
  niveisDeVinculoVisiveis,
  porQueAgoraDoRaioX,
  seloDoContrato,
  totalDaColuna,
  type EntradaContratoDetectado,
} from "./kanban-view";
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

describe("contrato público detectado no card", () => {
  const contrato = (extra: Partial<EntradaContratoDetectado> = {}): EntradaContratoDetectado => ({
    nivel: "forte",
    status: "sugerido",
    numeroControlePncp: "14147490000168-2-000216/2026",
    objeto: "Aquisição de veículos para a Secretaria de Saúde",
    fornecedorNome: "Fornecedor Parceiro Ltda",
    valorGlobal: 820_000,
    vigenciaInicio: new Date("2026-10-01T00:00:00Z"),
    vigenciaFim: new Date("2027-09-30T00:00:00Z"),
    dataAssinatura: new Date("2026-09-30T00:00:00Z"),
    ...extra,
  });
  const contexto = { categoriaAta: "veiculos", percentualContrato: null };

  it("sem contratos (ou campo ausente) o card não ganha selo", () => {
    expect(montarCartao(base, contexto, agora).contratoDetectado).toBeNull();
    expect(montarCartao({ ...base, contratos: [] }, contexto, agora).contratoDetectado).toBeNull();
    expect(montarCartao({ ...base, contratos: [] }, contexto, agora).outrosContratos).toBe(0);
  });

  it("vínculo sugerido vira 'contrato a confirmar', com dados prontos pra tela", () => {
    const c = montarCartao({ ...base, contratos: [contrato()] }, contexto, agora);
    expect(c.contratoDetectado).toEqual({
      numeroControlePncp: "14147490000168-2-000216/2026",
      nivel: "forte",
      rotuloNivel: "Fornecedor parceiro em negociação",
      confirmado: false,
      objeto: "Aquisição de veículos para a Secretaria de Saúde",
      fornecedorNome: "Fornecedor Parceiro Ltda",
      valorGlobal: 820_000,
      vigenciaInicio: "2026-10-01T00:00:00.000Z",
      vigenciaFim: "2027-09-30T00:00:00.000Z",
      urlPncp: "https://pncp.gov.br/app/contratos/14147490000168/2026/216",
    });
    expect(seloDoContrato(c.contratoDetectado!)).toMatchObject({ tom: "atencao", rotulo: "Contrato a confirmar" });
  });

  it("vínculo confirmado vira 'contrato detectado' em tom de marca", () => {
    const c = montarCartao({ ...base, contratos: [contrato({ nivel: "certo", status: "confirmado" })] }, contexto, agora);
    expect(c.contratoDetectado?.confirmado).toBe(true);
    expect(c.contratoDetectado?.rotuloNivel).toBe("Cita a ata da rede");
    expect(seloDoContrato(c.contratoDetectado!)).toMatchObject({ tom: "marca", rotulo: "Contrato detectado" });
  });

  it("vínculo descartado pelo gestor não aparece", () => {
    const c = montarCartao({ ...base, contratos: [contrato({ status: "descartado" })] }, contexto, agora);
    expect(c.contratoDetectado).toBeNull();
    expect(c.outrosContratos).toBe(0);
  });

  it("vendedor nunca vê vínculo de desvio; o gestor vê", () => {
    const entrada = { ...base, contratos: [contrato({ nivel: "desvio" })] };
    expect(montarCartao(entrada, contexto, agora).contratoDetectado).toBeNull();
    expect(montarCartao(entrada, { ...contexto, verDesvio: false }, agora).contratoDetectado).toBeNull();
    const gestor = montarCartao(entrada, { ...contexto, verDesvio: true }, agora);
    expect(gestor.contratoDetectado?.nivel).toBe("desvio");
    expect(gestor.contratoDetectado?.rotuloNivel).toBe("Possível desvio do funil");
  });

  it("desvio escondido do vendedor não esconde o contrato certo da mesma oportunidade", () => {
    const c = montarCartao(
      { ...base, contratos: [contrato({ nivel: "desvio", numeroControlePncp: "x" }), contrato({ nivel: "certo" })] },
      contexto,
      agora,
    );
    expect(c.contratoDetectado?.nivel).toBe("certo");
    expect(c.outrosContratos).toBe(0);
  });

  it("nível desconhecido (dado fora do padrão) não aparece", () => {
    expect(montarCartao({ ...base, contratos: [contrato({ nivel: "qualquer" })] }, contexto, agora).contratoDetectado).toBeNull();
  });

  it("objeto longo e em caixa alta vem resumido e em frase", () => {
    const longo = "AQUISICAO DE VEICULOS ".repeat(20).trim();
    const c = montarCartao({ ...base, contratos: [contrato({ objeto: longo })] }, contexto, agora);
    const objeto = c.contratoDetectado!.objeto;
    expect(objeto.length).toBeLessThanOrEqual(160);
    expect(objeto.endsWith("…")).toBe(true);
    expect(objeto.startsWith("Aquisicao de veiculos")).toBe(true);
  });

  it("número de controle fora do padrão fica sem link, sem quebrar", () => {
    const c = montarCartao({ ...base, contratos: [contrato({ numeroControlePncp: "sem-padrao" })] }, contexto, agora);
    expect(c.contratoDetectado?.urlPncp).toBeNull();
  });

  it("CPF que o MEI carrega na razão social não chega à tela", () => {
    const c = montarCartao(
      { ...base, contratos: [contrato({ fornecedorNome: "MATEUS SOUZA 120.376.246-11 ME" })] },
      contexto,
      agora,
    );
    expect(c.contratoDetectado?.fornecedorNome).toBe("Mateus souza me");
    expect(c.contratoDetectado?.fornecedorNome).not.toMatch(/\d{3}/);
    const semNome = montarCartao({ ...base, contratos: [contrato({ fornecedorNome: null })] }, contexto, agora);
    expect(semNome.contratoDetectado?.fornecedorNome).toBeNull();
  });

  it("valor zerado, negativo ou absurdo (erro de digitação no PNCP) vira 'não informado'", () => {
    const valorDe = (valorGlobal: number | null) =>
      montarCartao({ ...base, contratos: [contrato({ valorGlobal })] }, contexto, agora).contratoDetectado?.valorGlobal;
    expect(valorDe(0)).toBeNull();
    expect(valorDe(-5)).toBeNull();
    expect(valorDe(Number.NaN)).toBeNull();
    expect(valorDe(3_000_000_000_000)).toBeNull();
    expect(valorDe(5_000_000_000)).toBe(5_000_000_000);
    expect(valorDe(820_000.5)).toBe(820_000.5);
  });

  it("valor e vigência ausentes viram null", () => {
    const c = montarCartao(
      { ...base, contratos: [contrato({ valorGlobal: null, vigenciaInicio: null, vigenciaFim: null })] },
      contexto,
      agora,
    );
    expect(c.contratoDetectado).toMatchObject({ valorGlobal: null, vigenciaInicio: null, vigenciaFim: null });
  });
});

describe("escolherContratoDetectado", () => {
  const mk = (extra: Partial<EntradaContratoDetectado>): EntradaContratoDetectado => ({
    nivel: "forte",
    status: "sugerido",
    numeroControlePncp: "14147490000168-2-000001/2026",
    objeto: "Objeto",
    fornecedorNome: null,
    valorGlobal: null,
    vigenciaInicio: null,
    vigenciaFim: null,
    dataAssinatura: null,
    ...extra,
  });

  it("sem candidatos devolve nada", () => {
    expect(escolherContratoDetectado([], true)).toEqual({ escolhido: null, outros: 0 });
  });

  it("confirmado ganha de sugerido, mesmo de nível mais fraco", () => {
    const sugeridoCerto = mk({ nivel: "certo", numeroControlePncp: "a" });
    const confirmadoForte = mk({ nivel: "forte", status: "confirmado", numeroControlePncp: "b" });
    const r = escolherContratoDetectado([sugeridoCerto, confirmadoForte], false);
    expect(r.escolhido?.numeroControlePncp).toBe("b");
    expect(r.outros).toBe(1);
  });

  it("entre iguais, nível certo antes de forte, e o assinado mais recente primeiro", () => {
    const forte = mk({ nivel: "forte", numeroControlePncp: "forte" });
    const certoAntigo = mk({ nivel: "certo", numeroControlePncp: "antigo", dataAssinatura: new Date("2026-01-10T00:00:00Z") });
    const certoNovo = mk({ nivel: "certo", numeroControlePncp: "novo", dataAssinatura: new Date("2026-06-10T00:00:00Z") });
    const r = escolherContratoDetectado([forte, certoAntigo, certoNovo], false);
    expect(r.escolhido?.numeroControlePncp).toBe("novo");
    expect(r.outros).toBe(2);
  });

  it("sem data de assinatura vai depois de quem tem data, e empate cai no número de controle", () => {
    const semData1 = mk({ numeroControlePncp: "b", dataAssinatura: null });
    const semData2 = mk({ numeroControlePncp: "a", dataAssinatura: null });
    const comData = mk({ numeroControlePncp: "z", dataAssinatura: new Date("2020-01-01T00:00:00Z") });
    expect(escolherContratoDetectado([semData1, semData2, comData], false).escolhido?.numeroControlePncp).toBe("z");
    expect(escolherContratoDetectado([semData1, semData2], false).escolhido?.numeroControlePncp).toBe("a");
  });

  it("gestor: o desvio entra na fila; vendedor: fica de fora e não é contado em 'outros'", () => {
    const desvio = mk({ nivel: "desvio", numeroControlePncp: "d" });
    const forte = mk({ nivel: "forte", numeroControlePncp: "f" });
    expect(escolherContratoDetectado([desvio, forte], false)).toMatchObject({ outros: 0 });
    expect(escolherContratoDetectado([desvio, forte], false).escolhido?.numeroControlePncp).toBe("f");
    const gestor = escolherContratoDetectado([desvio, forte], true);
    expect(gestor.escolhido?.numeroControlePncp).toBe("f");
    expect(gestor.outros).toBe(1);
  });

  it("não altera a lista recebida", () => {
    const lista = [mk({ numeroControlePncp: "b" }), mk({ numeroControlePncp: "a", status: "confirmado" })];
    escolherContratoDetectado(lista, false);
    expect(lista.map((c) => c.numeroControlePncp)).toEqual(["b", "a"]);
  });
});

describe("niveisDeVinculoVisiveis", () => {
  it("vendedor: certo e forte; gestor: todos", () => {
    expect(niveisDeVinculoVisiveis(false)).toEqual(["certo", "forte"]);
    expect(niveisDeVinculoVisiveis(true)).toEqual(["certo", "forte", "desvio"]);
  });
});

describe("descreverVigencia", () => {
  it("mostra o que se sabe da vigência", () => {
    expect(descreverVigencia("2026-03-01T00:00:00.000Z", "2027-02-28T00:00:00.000Z")).toBe(
      "Vigência de 01/03/2026 a 28/02/2027",
    );
    expect(descreverVigencia(null, "2027-02-28T00:00:00.000Z")).toBe("Vigência até 28/02/2027");
    expect(descreverVigencia("2026-03-01T00:00:00.000Z", null)).toBe("Vigência desde 01/03/2026");
    expect(descreverVigencia(null, null)).toBe("Vigência não informada");
  });
});
