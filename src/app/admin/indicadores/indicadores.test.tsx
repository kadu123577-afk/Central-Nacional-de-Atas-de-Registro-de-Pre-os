import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A tela dos indicadores semanais: o que os componentes desenham (marca de
 * "mínimo", variação, estado vazio, seletor sem JavaScript) e o que a página
 * faz com a sessão e com ?semana= (sessão antes de tudo, data inválida volta
 * para a semana atual com aviso). Banco, sessão e menu trocados por dublês.
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
  carregarIndicadoresSemanais: vi.fn(),
  expirarOportunidadesVencidas: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("next/navigation", () => ({
  redirect: dobles.redirect,
  usePathname: () => "/admin/indicadores",
}));
vi.mock("../actions", () => ({ logoutAdmin: vi.fn() }));
vi.mock("@/lib/indicadores-db", () => ({ carregarIndicadoresSemanais: dobles.carregarIndicadoresSemanais }));
vi.mock("@/lib/negociacao-expiracao", () => ({ expirarOportunidadesVencidas: dobles.expirarOportunidadesVencidas }));

import {
  dadosVazios,
  montarResumo,
  semanaAnterior,
  semanaDe,
  type DadosDaSemana,
  type ResumoSemanal,
} from "@/lib/indicadores-semanais";
import { BlocoIndicadoresSemana } from "./bloco-semana-vendedor";
import { FaixaIndicadores } from "./faixa-indicadores";
import IndicadoresPage from "./page";
import { SeletorSemana } from "./seletor-semana";
import { TabelaConsultores } from "./tabela-consultores";

const AGORA = new Date("2026-10-23T15:00:00-03:00"); // sexta-feira
const SEMANA = semanaDe(AGORA);

function dados(parcial: Record<string, [string, number][]>): DadosDaSemana {
  const base = dadosVazios() as Record<string, ReadonlyMap<string, number>>;
  for (const [chave, pares] of Object.entries(parcial)) base[chave] = new Map(pares);
  return base as DadosDaSemana;
}

function resumoDeExemplo(): ResumoSemanal {
  return montarResumo({
    semana: SEMANA,
    anterior: semanaAnterior(SEMANA),
    consultores: [
      { id: "v1", nome: "Ana Lima", ativo: true },
      { id: "v2", nome: "Bia Souza", ativo: false },
    ],
    dadosAtual: dados({
      contatos: [["v1", 12]],
      negociacoesAtivas: [["v1", 4]],
      avancaram: [["v1", 3]],
      adesoes: [["v1", 1], ["v2", 1]],
      valorAderido: [["v1", 250_000], ["v2", 10_000]],
      comissaoLiquidada: [["v1", 12_500]],
      comissaoRecebida: [["v1", 5_000]],
    }),
    dadosAnterior: dados({ contatos: [["v1", 10]], negociacoesAtivas: [["v1", 3]], adesoes: [["v1", 0]] }),
  });
}

const html = (elemento: React.ReactElement) => renderToStaticMarkup(elemento);

beforeEach(() => {
  vi.clearAllMocks();
  dobles.adminIdLogado.mockResolvedValue("admin1");
  dobles.carregarIndicadoresSemanais.mockResolvedValue(resumoDeExemplo());
  dobles.expirarOportunidadesVencidas.mockResolvedValue(undefined);
});

describe("FaixaIndicadores", () => {
  it("mostra os quatro indicadores com semana anterior e variação em número e %", () => {
    const saida = html(createElement(FaixaIndicadores, { linha: resumoDeExemplo().total, fotoExata: true }));
    for (const rotulo of ["Contatos registrados", "Municípios em negociação", "Adesões fechadas", "Comissão sobre o liquidado"]) {
      expect(saida).toContain(rotulo);
    }
    expect(saida).toContain("+2 (+20%)"); // contatos: 12 contra 10
    expect(saida).toContain("Avançaram");
    expect(saida).toContain("Valor aderido");
    expect(saida).toContain("Recebida");
    // base zero (adesões: 2 contra 0) não vira percentual.
    expect(saida).toContain("+2 (anterior era zero)");
  });

  it("negociações em andamento: a semana anterior é sempre um mínimo; a atual só quando é semana passada", () => {
    const linha = resumoDeExemplo().total;
    const exata = html(createElement(FaixaIndicadores, { linha, fotoExata: true }));
    expect(exata).toContain(">4<"); // sem "≥" no número principal
    expect(exata).toContain("≥ ");
    const passada = html(createElement(FaixaIndicadores, { linha, fotoExata: false }));
    expect(passada).toContain("≥ 4");
  });
});

describe("variação de negociações (número mínimo)", () => {
  it("semana atual: a variação aparece como \"no máximo\", sem destaque de alta", () => {
    const linha = resumoDeExemplo().total; // 4 contra 3
    const faixa = html(createElement(FaixaIndicadores, { linha, fotoExata: true }));
    expect(faixa).toContain("no máximo +1 (+33,3%)");
    const { consultores, total } = resumoDeExemplo();
    const tabela = html(createElement(TabelaConsultores, { consultores, total, fotoExata: true }));
    expect(tabela).toContain("no máximo +1 (+33,3%)");
  });

  it("semana passada: dois mínimos, \"não comparável\"", () => {
    const linha = resumoDeExemplo().total;
    const faixa = html(createElement(FaixaIndicadores, { linha, fotoExata: false }));
    expect(faixa).toContain("não comparável");
    expect(faixa).not.toContain("no máximo +1");
    const { consultores, total } = resumoDeExemplo();
    const tabela = html(createElement(TabelaConsultores, { consultores, total, fotoExata: false }));
    expect(tabela).toContain("não comparável");
  });

  it("os indicadores exatos continuam com a variação normal", () => {
    const faixa = html(createElement(FaixaIndicadores, { linha: resumoDeExemplo().total, fotoExata: true }));
    expect(faixa).toContain("+2 (+20%)");
    expect(faixa).not.toContain("no máximo +2 (+20%)");
  });
});

describe("TabelaConsultores", () => {
  it("lista cada consultor, marca inativo e fecha com o total", () => {
    const { consultores, total } = resumoDeExemplo();
    const saida = html(createElement(TabelaConsultores, { consultores, total, fotoExata: true }));
    expect(saida).toContain("Ana Lima");
    expect(saida).toContain("Bia Souza");
    expect(saida).toContain("Inativo");
    expect(saida).toContain("Total");
    expect(saida).toContain("moldura-tabela");
    expect(saida.indexOf("Ana Lima")).toBeLessThan(saida.indexOf("Total"));
  });

  it("sem consultores, mostra o estado vazio", () => {
    const { total } = resumoDeExemplo();
    const saida = html(createElement(TabelaConsultores, { consultores: [], total, fotoExata: true }));
    expect(saida).toContain("Nenhum consultor cadastrado ainda");
    expect(saida).not.toContain("<table");
  });
});

describe("SeletorSemana", () => {
  it("é um formulário GET sem JavaScript, com o campo ?semana= e links de ida e volta", () => {
    const passada = semanaAnterior(SEMANA);
    const saida = html(createElement(SeletorSemana, { semana: passada, agora: AGORA }));
    expect(saida).toContain('method="get"');
    expect(saida).toContain('action="/admin/indicadores"');
    expect(saida).toContain('name="semana"');
    expect(saida).toContain('value="2026-10-12"');
    expect(saida).toContain('max="2026-10-23"');
    expect(saida).toContain('href="/admin/indicadores?semana=2026-10-05"'); // anterior
    expect(saida).toContain('href="/admin/indicadores?semana=2026-10-19"'); // seguinte
    expect(saida).toContain("Semana atual");
    expect(saida).toContain("12/10 a 18/10/2026");
  });

  it("na semana atual não oferece a semana seguinte nem o atalho para a atual", () => {
    const saida = html(createElement(SeletorSemana, { semana: SEMANA, agora: AGORA }));
    expect(saida).toContain("semana em andamento");
    expect(saida).not.toContain("Semana seguinte");
    expect(saida).not.toContain(">Semana atual<");
  });
});

describe("BlocoIndicadoresSemana (painel do consultor)", () => {
  it("mostra só o total do resumo recebido, com o título e a semana", () => {
    const resumo = resumoDeExemplo();
    const saida = html(createElement(BlocoIndicadoresSemana, { resumo, fotoExata: true }));
    expect(saida).toContain("Indicadores da semana");
    expect(saida).toContain("19/10 a 25/10/2026");
    expect(saida).toContain("Contatos registrados");
    // nenhum nome de consultor sai neste bloco.
    expect(saida).not.toContain("Ana Lima");
    expect(saida).not.toContain("Bia Souza");
  });

  it("se a consulta falhou, avisa e não quebra o painel", () => {
    const saida = html(createElement(BlocoIndicadoresSemana, { resumo: null, fotoExata: true }));
    expect(saida).toContain("Não foi possível carregar os indicadores da semana");
  });
});

describe("IndicadoresPage", () => {
  async function renderizar(busca: Record<string, string | string[] | undefined>) {
    const elemento = await IndicadoresPage({ searchParams: Promise.resolve(busca) });
    return html(elemento);
  }

  it("confere a sessão do administrador antes de ler a busca ou o banco", async () => {
    dobles.adminIdLogado.mockResolvedValue(null);
    // Objeto "thenable": se a página fizer `await searchParams`, o `then` é chamado.
    const entrada = { then: vi.fn() };
    await expect(
      IndicadoresPage({ searchParams: entrada as unknown as Promise<Record<string, string>> }),
    ).rejects.toThrow("REDIRECT:/admin/login");
    expect(entrada.then).not.toHaveBeenCalled();
    expect(dobles.carregarIndicadoresSemanais).not.toHaveBeenCalled();
    expect(dobles.expirarOportunidadesVencidas).not.toHaveBeenCalled();
  });

  it("sem ?semana=, mostra a semana atual e a visão de toda a operação (sem filtro de consultor)", async () => {
    vi.useFakeTimers({ now: AGORA });
    try {
      const saida = await renderizar({});
      expect(saida).toContain("Indicadores");
      expect(saida).toContain("19/10 a 25/10/2026");
      expect(saida).not.toContain("não é válida");
      const [semanaPedida, opcoes] = dobles.carregarIndicadoresSemanais.mock.calls[0];
      expect(semanaPedida.segunda).toBe("2026-10-19");
      expect(opcoes).toBeUndefined();
      expect(dobles.expirarOportunidadesVencidas).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("?semana= com dia de outra semana pede aquela semana", async () => {
    vi.useFakeTimers({ now: AGORA });
    try {
      await renderizar({ semana: "2026-10-14" });
      expect(dobles.carregarIndicadoresSemanais.mock.calls[0][0].segunda).toBe("2026-10-12");
    } finally {
      vi.useRealTimers();
    }
  });

  it("?semana= inválida ou futura volta para a semana atual, com aviso", async () => {
    vi.useFakeTimers({ now: AGORA });
    try {
      for (const ruim of ["2026-02-30", "abc", "2027-01-01"]) {
        dobles.carregarIndicadoresSemanais.mockClear();
        const saida = await renderizar({ semana: ruim });
        expect(dobles.carregarIndicadoresSemanais.mock.calls[0][0].segunda).toBe("2026-10-19");
        expect(saida).toMatch(/Mostrando a semana atual/);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("avisa quando há liquidação sem percentual de comissão", async () => {
    vi.useFakeTimers({ now: AGORA });
    try {
      dobles.carregarIndicadoresSemanais.mockResolvedValue({ ...resumoDeExemplo(), liquidacoesSemPercentual: 2 });
      const saida = await renderizar({});
      expect(saida).toContain("Comissão incompleta.");
      expect(saida).toContain("2 liquidações");
    } finally {
      vi.useRealTimers();
    }
  });

  it("explica como cada indicador é contado e as limitações", async () => {
    vi.useFakeTimers({ now: AGORA });
    try {
      const saida = await renderizar({});
      expect(saida).toContain("Como cada indicador é contado");
      expect(saida).toContain("não guarda o histórico de estágio");
      expect(saida).toContain("Não há metas cadastradas");
    } finally {
      vi.useRealTimers();
    }
  });
});
