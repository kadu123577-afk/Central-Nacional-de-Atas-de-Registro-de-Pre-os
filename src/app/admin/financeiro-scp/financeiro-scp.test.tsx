import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As telas do financeiro da SCP (principal e demonstrativo) e as peças que
 * elas montam: o que a página faz com a trava de acesso (antes de tudo, de
 * verdade, sem dublê da trava) e o que desenha (estado vazio, números, partilha,
 * avisos, formulários). Banco, sessão e ações trocados por dublês. Só dados
 * fictícios ("Sócio A", "Sócio B", 60% e 40%, valores redondos de teste).
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  registrarAuditoria: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
  adminFindUnique: vi.fn(),
  logFindFirst: vi.fn(),
  carregar: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("next/navigation", () => ({
  redirect: dobles.redirect,
  notFound: dobles.notFound,
  usePathname: () => "/admin/financeiro-scp",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { admin: { findUnique: dobles.adminFindUnique }, logAuditoria: { findFirst: dobles.logFindFirst } },
}));
vi.mock("@/lib/financeiro-scp-db", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("@/lib/financeiro-scp-db")>()),
  carregarFinanceiroDoPeriodo: dobles.carregar,
}));
vi.mock("../actions", () => ({ logoutAdmin: vi.fn() }));
vi.mock("./actions", () => ({
  criarSocio: vi.fn(),
  alternarSocio: vi.fn(),
  removerSocio: vi.fn(),
  definirParticipacoes: vi.fn(),
  criarDespesa: vi.fn(),
  atualizarDespesa: vi.fn(),
  removerDespesa: vi.fn(),
}));

import { NAV_ADMIN } from "../nav";
import {
  LIMITE_DESPESAS_DEMONSTRATIVO,
  LIMITE_DESPESAS_LISTA,
  type FinanceiroDoPeriodo,
  type ReceitaDoPeriodo,
  type SocioDados,
} from "@/lib/financeiro-scp-db";
import type { PartilhaDoPeriodo } from "./apuracao";
import DemonstrativoPage from "./demonstrativo/page";
import { FormularioDivisao } from "./formulario-divisao";
import { FormularioNovaDespesa } from "./formulario-nova-despesa";
import { FormularioNovoSocio } from "./formulario-novo-socio";
import { LinhaDespesa, type DadosDespesa } from "./linha-despesa";
import { LinhaSocio, type DadosSocio } from "./linha-socio";
import FinanceiroScpPage from "./page";
import { QuadroPartilha } from "./quadro-partilha";
import { SeletorMes } from "./seletor-mes";
import { periodoMensal, type PeriodoDias } from "@/lib/financeiro-scp";

const SOCIO_A = "csocioaaaaaaaaaaaaaaaaaa";
const SOCIO_B = "csociobbbbbbbbbbbbbbbbbb";
const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);

const RECEITA_VAZIA: ReceitaDoPeriodo = {
  centavos: 0,
  lancamentos: [],
  porOportunidade: [],
  quantidade: 0,
  semPercentual: 0,
  semDataRecebimento: 0,
  invalidas: 0,
  truncada: false,
};

const SOCIOS_60_40: SocioDados[] = [
  {
    id: SOCIO_A,
    nome: "Sócio A",
    tipo: "ostensivo",
    ativo: true,
    participacoes: [{ id: "p1", socioId: SOCIO_A, percentual: 0.6, vigenteDesde: dia("2026-01-01"), vigenteAte: null }],
  },
  {
    id: SOCIO_B,
    nome: "Sócio B",
    tipo: "participante",
    ativo: true,
    participacoes: [{ id: "p2", socioId: SOCIO_B, percentual: 0.4, vigenteDesde: dia("2026-01-01"), vigenteAte: null }],
  },
];

function financeiro(periodo: PeriodoDias, extra: Partial<FinanceiroDoPeriodo> = {}): FinanceiroDoPeriodo {
  return {
    periodo,
    socios: [],
    receita: RECEITA_VAZIA,
    despesas: { lista: [], listaTruncada: false, quantidade: 0, centavos: 0, porDia: [] },
    ...extra,
  };
}

/** Receita de R$ 1.000,00 em 10/10 e uma despesa de R$ 200,00 em 20/10, com 60/40 entre os sócios. */
function comMovimento(periodo: PeriodoDias, ajustes: { receita?: number; despesa?: number } = {}): FinanceiroDoPeriodo {
  const receita = ajustes.receita ?? 100_000;
  const despesa = ajustes.despesa ?? 20_000;
  return financeiro(periodo, {
    socios: SOCIOS_60_40,
    receita: {
      ...RECEITA_VAZIA,
      centavos: receita,
      quantidade: 1,
      lancamentos: [{ data: dia("2026-10-10"), centavos: receita }],
      porOportunidade: [
        {
          oportunidadeId: "op1",
          ataNumero: "ATA-TESTE-1",
          entidade: "Município de Teste",
          uf: "GO",
          recebimentos: 1,
          valorLiquidadoCentavos: 2_000_000,
          percentual: 0.05,
          comissaoCentavos: receita,
        },
      ],
    },
    despesas: {
      lista: [
        {
          id: "cdespesaaaaaaaaaaaaaaaaa",
          data: dia("2026-10-20"),
          descricao: "Despesa de teste",
          categoria: "Categoria de teste",
          centavos: despesa,
          pagaPorSocioId: SOCIO_A,
          pagaPorNome: "Sócio A",
        },
      ],
      listaTruncada: false,
      quantidade: 1,
      centavos: despesa,
      porDia: [{ data: dia("2026-10-20"), centavos: despesa }],
    },
  });
}

type Busca = { [chave: string]: string | string[] | undefined };

async function paginaHtml(busca: Busca = {}): Promise<string> {
  return renderToStaticMarkup(await FinanceiroScpPage({ searchParams: Promise.resolve(busca) }));
}
async function demonstrativoHtml(busca: Busca = {}): Promise<string> {
  return renderToStaticMarkup(await DemonstrativoPage({ searchParams: Promise.resolve(busca) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T15:00:00Z"));
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.notFound.mockImplementation(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  });
  dobles.adminIdLogado.mockResolvedValue("admin1");
  dobles.adminFindUnique.mockResolvedValue({ acessoFinanceiro: true, totpAtivo: true });
  dobles.logFindFirst.mockResolvedValue({ id: "visualizacao-recente" });
  dobles.registrarAuditoria.mockResolvedValue(undefined);
  dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => financeiro(periodo));
});

afterEach(() => {
  vi.useRealTimers();
});

// ───────────────────────────── trava de acesso nas páginas ─────────────────────────────

const PAGINAS: [string, (busca?: Busca) => Promise<string>][] = [
  ["/admin/financeiro-scp", paginaHtml],
  ["/admin/financeiro-scp/demonstrativo", demonstrativoHtml],
];

describe.each(PAGINAS)("trava de acesso em %s", (_rota, pagina) => {
  /** ?mes= que acusa se a página olhou a URL antes da trava. */
  function buscaVigiada() {
    const leituras = { feita: false };
    const busca = {
      then(resolver: (v: Busca) => void) {
        leituras.feita = true;
        resolver({});
      },
    } as unknown as Promise<Busca>;
    return { busca, leituras };
  }

  it("sem sessão: vai para /entrar, sem ler a URL nem consultar o financeiro", async () => {
    dobles.adminIdLogado.mockResolvedValue(null);
    const { busca, leituras } = buscaVigiada();
    const Pagina = pagina === paginaHtml ? FinanceiroScpPage : DemonstrativoPage;
    await expect(Pagina({ searchParams: busca })).rejects.toThrow("NEXT_REDIRECT:/entrar");
    expect(leituras.feita).toBe(false);
    expect(dobles.carregar).not.toHaveBeenCalled();
    expect(dobles.adminFindUnique).not.toHaveBeenCalled();
  });

  it("admin sem a permissão do financeiro: 404 (a área não se revela), tentativa registrada, nenhuma consulta financeira", async () => {
    dobles.adminFindUnique.mockResolvedValue({ acessoFinanceiro: false, totpAtivo: true });
    const { busca, leituras } = buscaVigiada();
    const Pagina = pagina === paginaHtml ? FinanceiroScpPage : DemonstrativoPage;
    await expect(Pagina({ searchParams: busca })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(leituras.feita).toBe(false);
    expect(dobles.carregar).not.toHaveBeenCalled();
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "financeiro.acesso_negado",
      detalhe: "sem permissão",
    });
  });

  it("com a permissão mas sem 2FA: vai para o perfil, sem consultar o financeiro", async () => {
    dobles.adminFindUnique.mockResolvedValue({ acessoFinanceiro: true, totpAtivo: false });
    await expect(pagina()).rejects.toThrow("NEXT_REDIRECT:/admin/perfil");
    expect(dobles.carregar).not.toHaveBeenCalled();
  });

  it("com acesso: consulta o financeiro uma vez e desenha a página", async () => {
    const saida = await pagina();
    expect(dobles.carregar).toHaveBeenCalledTimes(1);
    expect(saida).toContain("restrit");
  });
});

// ───────────────────────────── tela principal ─────────────────────────────

describe("página /admin/financeiro-scp", () => {
  it("avisa da confidencialidade logo no começo", async () => {
    const saida = await paginaHtml();
    expect(saida).toContain("Área restrita.");
    expect(saida).toContain("Os dados desta tela ficam somente no banco.");
  });

  describe("período", () => {
    it("sem ?mes= mostra o mês atual (de Brasília) e pede ao banco o mês inteiro", async () => {
      const saida = await paginaHtml();
      const periodo = dobles.carregar.mock.calls[0][0] as PeriodoDias;
      expect(periodo.inicio.toISOString()).toBe("2026-10-01T00:00:00.000Z");
      expect(periodo.fimExclusivo.toISOString()).toBe("2026-11-01T00:00:00.000Z");
      expect(saida).toContain("outubro de 2026");
      expect(saida).toContain("mês em andamento");
      expect(saida).not.toContain("Mês inválido");
    });

    it("?mes=2026-07 mostra julho, com link para voltar ao mês atual", async () => {
      const saida = await paginaHtml({ mes: "2026-07" });
      expect((dobles.carregar.mock.calls[0][0] as PeriodoDias).inicio.toISOString()).toBe("2026-07-01T00:00:00.000Z");
      expect(saida).toContain("julho de 2026");
      expect(saida).toContain("?mes=2026-06");
      expect(saida).toContain("?mes=2026-08");
      expect(saida).toContain("Mês atual");
    });

    it.each(["2026-13", "abc", "1999-01", "2026-7", ""])("mês inválido %j cai no mês atual (com aviso, menos o vazio)", async (mes) => {
      const saida = await paginaHtml({ mes });
      expect((dobles.carregar.mock.calls[0][0] as PeriodoDias).inicio.toISOString()).toBe("2026-10-01T00:00:00.000Z");
      expect(saida).toContain("outubro de 2026");
      if (mes === "") expect(saida).not.toContain("Mês inválido");
      else expect(saida).toContain("Mês inválido");
    });

    it("link para o demonstrativo leva o mês escolhido", async () => {
      const saida = await paginaHtml({ mes: "2026-07" });
      expect(saida).toContain("/admin/financeiro-scp/demonstrativo?mes=2026-07");
    });
  });

  describe("sem nada cadastrado", () => {
    it("estado vazio claro na partilha e números zerados", async () => {
      const saida = await paginaHtml();
      expect(saida).toContain("Cadastre os sócios e as participações para ver a partilha");
      expect(saida).toContain("R$ 0,00</strong><span>Receita recebida</span>");
      expect(saida).toContain("R$ 0,00</strong><span>Despesas</span>");
      expect(saida).toContain("R$ 0,00</strong><span>Resultado</span>");
      expect(saida).toContain("Nenhum sócio cadastrado");
      expect(saida).toContain("Nenhuma despesa neste mês");
      expect(saida).not.toContain("<table");
    });

    it("os formulários estão lá para começar: novo sócio, divisão (pede sócio antes), nova despesa", async () => {
      const saida = await paginaHtml();
      expect(saida).toContain('name="nome"');
      expect(saida).toContain("Cadastrar sócio");
      expect(saida).toContain("Cadastre ao menos um sócio ativo para definir a divisão da partilha.");
      expect(saida).toContain('name="valor"');
      expect(saida).toContain("Lançar despesa");
    });
  });

  describe("com movimento e participações 60/40", () => {
    beforeEach(() => {
      dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => comMovimento(periodo));
    });

    it("mostra receita, despesas e resultado em reais, com o resultado em verde", async () => {
      const saida = await paginaHtml();
      expect(saida).toContain("R$ 1.000,00</strong><span>Receita recebida</span>");
      expect(saida).toContain("R$ 200,00</strong><span>Despesas</span>");
      expect(saida).toContain("R$ 800,00</strong><span>Resultado</span>");
      expect(saida).toContain("color:var(--cor-marca-clara)\">R$ 800,00");
      expect(saida).not.toContain("Prejuízo no período");
    });

    it("partilha 60/40: tabela com sócio, participação e valor, e o resultado do período", async () => {
      const saida = await paginaHtml();
      expect(saida).toContain("Partilha do período");
      expect(saida).toContain("Sócio A");
      expect(saida).toContain("60%");
      expect(saida).toContain("R$ 480,00");
      expect(saida).toContain("Sócio B");
      expect(saida).toContain("40%");
      expect(saida).toContain("R$ 320,00");
      expect(saida).toContain("Resultado do período");
      expect(saida).not.toContain("Nada a partilhar ainda");
      expect(saida).not.toContain("Partilha não calculada");
    });

    it("lista a despesa com data, descrição, categoria, valor e quem pagou, com Editar e Remover", async () => {
      const saida = await paginaHtml();
      expect(saida).toContain("20/10/2026");
      expect(saida).toContain("Despesa de teste");
      expect(saida).toContain("Categoria de teste");
      expect(saida).toContain("R$ 200,00");
      expect(saida).toContain(">Editar<");
      expect(saida).toContain(">Remover<");
    });

    it("lista os sócios com tipo, situação e participação de hoje, e a divisão já vem preenchida com o que vigora", async () => {
      const saida = await paginaHtml();
      expect(saida).toContain("Sócio ostensivo");
      expect(saida).toContain("Sócio participante");
      expect(saida).toContain(">Ativo<");
      expect(saida).toContain('name="vigenteDesde"');
      expect(saida).toContain('value="2026-10-26"');
      expect(saida).toMatch(/name="percentual"[^>]*value="60"/);
      expect(saida).toMatch(/name="percentual"[^>]*value="40"/);
      expect(saida).not.toContain("As participações de hoje não fecham");
    });
  });

  describe("prejuízo", () => {
    it("destaca o prejuízo (tom de atenção), repete o valor e diz que se reparte pelos mesmos percentuais", async () => {
      dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => comMovimento(periodo, { receita: 10_000, despesa: 60_000 }));
      const saida = await paginaHtml();
      expect(saida).toContain("-R$ 500,00</strong><span>Resultado</span>");
      expect(saida).toContain("color:var(--cor-atencao)");
      expect(saida).toContain("Prejuízo no período");
      expect(saida).toContain("passaram da receita recebida em R$ 500,00");
      // Partilha negativa nos mesmos percentuais: -300,00 e -200,00.
      expect(saida).toContain("-R$ 300,00");
      expect(saida).toContain("-R$ 200,00");
    });
  });

  describe("participações que não fecham 100%", () => {
    it("mostra o erro e NÃO calcula a partilha", async () => {
      dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => ({
        ...comMovimento(periodo),
        socios: [
          SOCIOS_60_40[0],
          { ...SOCIOS_60_40[1], participacoes: [{ ...SOCIOS_60_40[1].participacoes[0], percentual: 0.3 }] },
        ],
      }));
      const saida = await paginaHtml();
      expect(saida).toContain("Partilha não calculada.");
      expect(saida).toContain("A soma das participações vigentes deve ser exatamente 100%");
      expect(saida).toContain("90%");
      expect(saida).not.toContain("Resultado do período");
      expect(saida).not.toContain("R$ 480,00");
      // A tela de sócios também avisa que hoje a soma não fecha.
      expect(saida).toContain("As participações de hoje não fecham.");
    });
  });

  describe("prejuízo com a partilha bloqueada", () => {
    it("os números do topo mostram o prejuízo, mas a caixa de prejuízo da partilha não aparece (não há partilha)", async () => {
      dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => ({
        ...comMovimento(periodo, { receita: 10_000, despesa: 60_000 }),
        socios: [
          SOCIOS_60_40[0],
          { ...SOCIOS_60_40[1], participacoes: [{ ...SOCIOS_60_40[1].participacoes[0], percentual: 0.3 }] },
        ],
      }));
      const saida = await paginaHtml();
      expect(saida).toContain("-R$ 500,00</strong><span>Resultado</span>");
      expect(saida).toContain("Partilha não calculada.");
      expect(saida).not.toContain("As despesas passaram da receita recebida");
      expect(saida).not.toContain("-R$ 300,00");
    });
  });

  describe("sócios inativos", () => {
    const SOCIO_C = "csocioccccccccccccccccc";

    it("entram na divisão só se ainda têm participação em vigor, e nunca nas opções de quem pagou", async () => {
      dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => ({
        ...comMovimento(periodo),
        socios: [
          SOCIOS_60_40[0],
          { ...SOCIOS_60_40[1], ativo: false },
          { id: SOCIO_C, nome: "Sócio C", tipo: "participante", ativo: false, participacoes: [] },
        ],
      }));
      const saida = await paginaHtml();
      // Divisão da partilha: o inativo que ainda tem participação aparece (para poder sair); o que não tem, não.
      expect(saida).toContain(`name="socioId" value="${SOCIO_A}"`);
      expect(saida).toContain(`name="socioId" value="${SOCIO_B}"`);
      expect(saida).not.toContain(`name="socioId" value="${SOCIO_C}"`);
      // Quem pagou: só sócio ativo.
      expect(saida).toContain(`<option value="${SOCIO_A}">Sócio A</option>`);
      expect(saida).not.toContain(`<option value="${SOCIO_B}"`);
      expect(saida).not.toContain(`<option value="${SOCIO_C}"`);
    });
  });

  describe("histórico de participações", () => {
    it("aparece da mais recente para a mais antiga", async () => {
      dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => ({
        ...comMovimento(periodo),
        socios: [
          {
            ...SOCIOS_60_40[0],
            participacoes: [
              { id: "p1", socioId: SOCIO_A, percentual: 0.6, vigenteDesde: dia("2026-01-01"), vigenteAte: dia("2026-10-15") },
              { id: "p3", socioId: SOCIO_A, percentual: 0.5, vigenteDesde: dia("2026-10-16"), vigenteAte: null },
            ],
          },
          {
            ...SOCIOS_60_40[1],
            participacoes: [
              { id: "p2", socioId: SOCIO_B, percentual: 0.4, vigenteDesde: dia("2026-01-01"), vigenteAte: dia("2026-10-15") },
              { id: "p4", socioId: SOCIO_B, percentual: 0.5, vigenteDesde: dia("2026-10-16"), vigenteAte: null },
            ],
          },
        ],
      }));
      const saida = await paginaHtml();
      const recente = saida.indexOf("de 16/10/2026 em diante (em vigor)");
      const antiga = saida.indexOf("de 01/01/2026 a 15/10/2026");
      expect(recente).toBeGreaterThan(-1);
      expect(antiga).toBeGreaterThan(recente);
    });
  });

  describe("avisos da receita", () => {
    it("recebida sem data de recebimento e sem percentual: avisa o que ficou de fora e o que entrou com zero", async () => {
      dobles.carregar.mockImplementation(async (periodo: PeriodoDias) =>
        financeiro(periodo, { receita: { ...RECEITA_VAZIA, semDataRecebimento: 2, semPercentual: 1 } }),
      );
      const saida = await paginaHtml();
      expect(saida).toContain("Recebimento sem data.");
      expect(saida).toContain("2 liquidações estão marcadas como recebidas sem a data do recebimento");
      expect(saida).toContain("Comissão sem percentual.");
      expect(saida).toContain("1 liquidação recebida neste mês é de uma oportunidade sem percentual de comissão");
    });

    it("liquidação inválida ou receita truncada: aviso crítico e partilha bloqueada", async () => {
      dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => ({
        ...comMovimento(periodo),
        receita: { ...comMovimento(periodo).receita, invalidas: 1 },
      }));
      const saida = await paginaHtml();
      expect(saida).toContain("Receita incompleta.");
      expect(saida).toContain("1 comissão recebida tem valor ou percentual inválido");
      expect(saida).toContain("Partilha não calculada.");
      expect(saida).not.toContain("Resultado do período");
    });
  });

  describe("limite da lista de despesas", () => {
    it("avisa quando a lista foi cortada e que os totais contam todas", async () => {
      dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => {
        const base = comMovimento(periodo);
        return { ...base, despesas: { ...base.despesas, listaTruncada: true, quantidade: 350 } };
      });
      const saida = await paginaHtml();
      expect(saida).toContain(`Mostrando as primeiras ${LIMITE_DESPESAS_LISTA} de 350 despesas do período`);
      expect(saida).toContain("Os totais acima contam todas.");
    });

    it("sem corte, não mostra o aviso", async () => {
      dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => comMovimento(periodo));
      expect(await paginaHtml()).not.toContain("Mostrando as primeiras");
    });
  });

  it("não escreve cor à mão (só tokens)", async () => {
    dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => comMovimento(periodo, { receita: 10_000, despesa: 60_000 }));
    const saida = await paginaHtml();
    expect(saida).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(saida).not.toMatch(/rgb\(/);
  });
});

// ───────────────────────────── demonstrativo ─────────────────────────────

describe("página /admin/financeiro-scp/demonstrativo", () => {
  beforeEach(() => {
    dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => comMovimento(periodo));
  });

  it("pede a lista maior de despesas e usa o mês da URL (inválido cai no mês atual)", async () => {
    await demonstrativoHtml({ mes: "2026-07" });
    expect(dobles.carregar.mock.calls[0][1]).toEqual({ limiteDespesas: LIMITE_DESPESAS_DEMONSTRATIVO });
    expect((dobles.carregar.mock.calls[0][0] as PeriodoDias).inicio.toISOString()).toBe("2026-07-01T00:00:00.000Z");

    vi.clearAllMocks();
    dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => comMovimento(periodo));
    const saida = await demonstrativoHtml({ mes: "lixo" });
    expect((dobles.carregar.mock.calls[0][0] as PeriodoDias).inicio.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(saida).toContain("Mês inválido");
  });

  it("traz receitas por oportunidade (município e ata pelo código), despesas, resultado e partilha", async () => {
    const saida = await demonstrativoHtml();
    expect(saida).toContain("Receitas por oportunidade");
    expect(saida).toContain("Município de Teste");
    expect(saida).toContain("ATA-TESTE-1");
    expect(saida).toContain("R$ 20.000,00"); // valor liquidado
    expect(saida).toContain("5%");
    expect(saida).toContain("R$ 1.000,00"); // comissão recebida
    expect(saida).toContain("Despesas");
    expect(saida).toContain("Despesa de teste");
    expect(saida).toContain("R$ 200,00");
    expect(saida).toContain("R$ 800,00</strong><span>Resultado</span>");
    expect(saida).toContain("Resultado e partilha");
    expect(saida).toContain("R$ 480,00");
    expect(saida).toContain("R$ 320,00");
  });

  it("rodapé com a data de emissão (Brasília) e o texto de que não tem valor fiscal", async () => {
    const saida = await demonstrativoHtml();
    expect(saida).toContain("Demonstrativo gerencial, sem valor fiscal.");
    expect(saida).toContain("Emitido em 26/10/2026 às 12:00 (horário de Brasília).");
  });

  it("é imprimível: timbre só na impressão, botão e navegação fora da impressão", async () => {
    const saida = await demonstrativoHtml();
    expect(saida).toContain("timbre-impressao");
    expect(saida).toContain("Central Nacional de Atas de Registro de Preços");
    expect(saida).toContain("sem-impressao");
    expect(saida).toContain("Imprimir / gerar PDF");
    expect(saida).toContain("← Voltar ao financeiro");
    expect(saida).toContain("/admin/financeiro-scp?mes=2026-10");
    expect(saida).toContain("Documento confidencial.");
  });

  it("na impressão somem os links de navegação e o botão de imprimir (ficam dentro de .sem-impressao)", async () => {
    const saida = await demonstrativoHtml();
    const blocos = saida.match(/<div class="sem-impressao[^"]*">[\s\S]*?<\/div>/g) ?? [];
    expect(blocos.some((b) => b.includes("← Voltar ao financeiro"))).toBe(true);
    expect(blocos.some((b) => b.includes("Imprimir / gerar PDF"))).toBe(true);
  });

  it("o total da tabela de receitas soma o valor liquidado de todas as oportunidades", async () => {
    dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => {
      const base = comMovimento(periodo);
      const primeira = base.receita.porOportunidade[0];
      return {
        ...base,
        receita: {
          ...base.receita,
          quantidade: 2,
          porOportunidade: [
            primeira,
            { ...primeira, oportunidadeId: "op2", ataNumero: "ATA-TESTE-2", valorLiquidadoCentavos: 500_000, comissaoCentavos: 25_000 },
          ],
        },
      };
    });
    const saida = await demonstrativoHtml();
    expect(saida).toContain("Total (2 recebimentos)");
    // R$ 20.000,00 + R$ 5.000,00 de valor liquidado.
    expect(saida).toContain("R$ 25.000,00");
  });

  it("mês sem movimento: diz que não houve comissão nem despesa e a partilha explica o cadastro", async () => {
    dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => financeiro(periodo));
    const saida = await demonstrativoHtml();
    expect(saida).toContain("Nenhuma comissão recebida neste mês.");
    expect(saida).toContain("Nenhuma despesa lançada neste mês.");
    expect(saida).toContain("Cadastre os sócios e as participações para ver a partilha");
  });

  it("lista de despesas cortada: avisa com o limite do demonstrativo", async () => {
    dobles.carregar.mockImplementation(async (periodo: PeriodoDias) => {
      const base = comMovimento(periodo);
      return { ...base, despesas: { ...base.despesas, listaTruncada: true, quantidade: 1500 } };
    });
    const saida = await demonstrativoHtml();
    expect(saida).toContain(`A lista mostra as primeiras ${LIMITE_DESPESAS_DEMONSTRATIVO} de 1500 despesas`);
  });

  it("não escreve cor à mão (só tokens)", async () => {
    const saida = await demonstrativoHtml();
    expect(saida).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(saida).not.toMatch(/rgb\(/);
  });
});

// ───────────────────────────── menu ─────────────────────────────

describe("menu do administrador", () => {
  it("NÃO anuncia o financeiro da SCP no menu de todos os administradores", () => {
    // O menu é estático e vale para qualquer administrador; a área é de acesso restrito
    // (flag acessoFinanceiro + 2FA) e quem tem acesso chega por /admin/financeiro-scp.
    expect(NAV_ADMIN.some((i) => i.href.includes("financeiro-scp"))).toBe(false);
    expect(NAV_ADMIN.some((i) => /scp/i.test(i.rotulo))).toBe(false);
  });
});

// ───────────────────────────── peças ─────────────────────────────

describe("QuadroPartilha", () => {
  const OK: PartilhaDoPeriodo = {
    situacao: "ok",
    variaNoPeriodo: false,
    linhas: [{ socioId: SOCIO_A, nome: "Sócio A", participacao: "60%", centavos: 48_000 }],
    apuracao: { resultadoCentavos: 48_000, receitasCentavos: 48_000, despesasCentavos: 0, partilha: [], faixas: [] },
  };

  it("sem cadastro: explica o que fazer", () => {
    const saida = renderToStaticMarkup(createElement(QuadroPartilha, { partilha: { situacao: "sem_cadastro" } }));
    expect(saida).toContain("Cadastre os sócios e as participações para ver a partilha");
  });

  it("bloqueada: só o erro, sem tabela", () => {
    const saida = renderToStaticMarkup(
      createElement(QuadroPartilha, { partilha: { situacao: "bloqueada", erro: "Erro de teste da soma." } }),
    );
    expect(saida).toContain("Erro de teste da soma.");
    expect(saida).not.toContain("<table");
  });

  it("valor negativo (prejuízo) sai com sinal e em tom de atenção; valor positivo não", () => {
    const prejuizo: PartilhaDoPeriodo = {
      ...OK,
      linhas: [{ socioId: SOCIO_A, nome: "Sócio A", participacao: "60%", centavos: -30_000 }],
      apuracao: { ...OK.apuracao, resultadoCentavos: -30_000 },
    };
    const negativo = renderToStaticMarkup(createElement(QuadroPartilha, { partilha: prejuizo }));
    expect(negativo).toContain('color:var(--cor-atencao)">-R$ 300,00');
    expect(renderToStaticMarkup(createElement(QuadroPartilha, { partilha: OK }))).not.toContain("--cor-atencao");
  });

  it("calculada: tabela, e o detalhe por trecho só quando a participação mudou no período", () => {
    expect(renderToStaticMarkup(createElement(QuadroPartilha, { partilha: OK }))).not.toContain("A participação mudou");

    const varia: PartilhaDoPeriodo = {
      ...OK,
      variaNoPeriodo: true,
      apuracao: {
        ...OK.apuracao,
        faixas: [
          {
            inicio: dia("2026-10-01"),
            fim: dia("2026-10-15"),
            receitasCentavos: 100_000,
            despesasCentavos: 0,
            resultadoCentavos: 100_000,
            partilha: [],
          },
        ],
      },
    };
    const saida = renderToStaticMarkup(createElement(QuadroPartilha, { partilha: varia }));
    expect(saida).toContain("A participação mudou durante o período.");
    expect(saida).toContain("01/10/2026 a 15/10/2026: receita R$ 1.000,00");
  });
});

describe("SeletorMes", () => {
  it("mês atual: sem link para voltar ao mês atual; limites de 2000 e 2100 sem link de vizinho", () => {
    const outubro = periodoMensal(2026, 10)!;
    const atual = renderToStaticMarkup(createElement(SeletorMes, { rota: "/r", periodo: outubro, mesAtual: "2026-10" }));
    expect(atual).toContain("mês em andamento");
    expect(atual).not.toContain(">Mês atual<");
    expect(atual).toContain("/r?mes=2026-09");
    expect(atual).toContain("/r?mes=2026-11");
    expect(atual).toContain('type="month"');
    expect(atual).toContain('name="mes"');

    const primeiro = renderToStaticMarkup(
      createElement(SeletorMes, { rota: "/r", periodo: periodoMensal(2000, 1)!, mesAtual: "2026-10" }),
    );
    expect(primeiro).not.toContain("Mês anterior");
    expect(primeiro).toContain("Mês atual");
  });
});

describe("LinhaSocio", () => {
  const SOCIO: DadosSocio = {
    id: SOCIO_A,
    nome: "Sócio A",
    tipoRotulo: "Sócio ostensivo",
    ativo: true,
    participacaoHoje: "50%",
    historico: [
      { percentual: "50%", desde: "01/11/2026", ate: null },
      { percentual: "60%", desde: "01/01/2026", ate: "31/10/2026" },
    ],
  };
  const linha = (socio: DadosSocio) =>
    renderToStaticMarkup(createElement("table", null, createElement("tbody", null, createElement(LinhaSocio, { socio }))));

  it("mostra nome, tipo, situação, participação de hoje e o histórico (da mais recente à mais antiga)", () => {
    const saida = linha(SOCIO);
    expect(saida).toContain("Sócio A");
    expect(saida).toContain("Sócio ostensivo");
    expect(saida).toContain("Ativo");
    expect(saida).toContain("50%");
    expect(saida).toContain("Histórico de participações (2)");
    expect(saida).toContain("de 01/11/2026 em diante (em vigor)");
    expect(saida).toContain("de 01/01/2026 a 31/10/2026");
    expect(saida).toContain('name="ativar" value="0"');
    expect(saida).toContain(`name="id" value="${SOCIO_A}"`);
    expect(saida).toContain(">Desativar<");
    expect(saida).toContain(">Remover<");
    // A remoção só aparece depois da confirmação.
    expect(saida).not.toContain("Sim, remover");
  });

  it("inativo: oferece Ativar (destino 1) e sem histórico não mostra o bloco", () => {
    const saida = linha({ ...SOCIO, ativo: false, historico: [], participacaoHoje: "—" });
    expect(saida).toContain("Inativo");
    expect(saida).toContain(">Ativar<");
    expect(saida).toContain('name="ativar" value="1"');
    expect(saida).not.toContain("Histórico de participações");
  });
});

describe("LinhaDespesa", () => {
  const DESPESA: DadosDespesa = {
    id: "cdespesaaaaaaaaaaaaaaaaa",
    dataTexto: "20/10/2026",
    dataCampo: "2026-10-20",
    descricao: "Despesa de teste",
    categoria: null,
    valorTexto: "R$ 1.234,56",
    valorCampo: "1234,56",
    pagaPorSocioId: null,
    pagaPorNome: null,
  };
  const linha = (despesa: DadosDespesa) =>
    renderToStaticMarkup(
      createElement(
        "table",
        null,
        createElement("tbody", null, createElement(LinhaDespesa, { despesa, socios: [{ id: SOCIO_A, nome: "Sócio A" }] })),
      ),
    );

  it("mostra os valores, traço onde não há categoria nem quem pagou, e Editar/Remover (sem a confirmação ainda)", () => {
    const saida = linha(DESPESA);
    expect(saida).toContain("20/10/2026");
    expect(saida).toContain("Despesa de teste");
    expect(saida).toContain("R$ 1.234,56");
    expect(saida).toContain("—");
    expect(saida).toContain(">Editar<");
    expect(saida).toContain(">Remover<");
    expect(saida).not.toContain("Sim, remover");
    expect(saida).not.toContain('name="valor"');
  });
});

describe("formulários", () => {
  it("FormularioNovoSocio: nome, tipo (os dois tipos) e botão", () => {
    const saida = renderToStaticMarkup(createElement(FormularioNovoSocio));
    expect(saida).toContain('name="nome"');
    expect(saida).toContain('name="tipo"');
    expect(saida).toContain("Sócio ostensivo");
    expect(saida).toContain("Sócio participante");
    expect(saida).toContain("Cadastrar sócio");
    expect(saida).toMatch(/maxLength="120"/i);
  });

  it("FormularioNovaDespesa: data (de hoje), valor, descrição, categoria e quem pagou com os sócios ativos", () => {
    const saida = renderToStaticMarkup(
      createElement(FormularioNovaDespesa, { socios: [{ id: SOCIO_A, nome: "Sócio A" }], hoje: "2026-10-26" }),
    );
    for (const nome of ["data", "valor", "descricao", "categoria", "pagaPorSocioId"]) expect(saida).toContain(`name="${nome}"`);
    expect(saida).toContain('value="2026-10-26"');
    expect(saida).toContain(`<option value="${SOCIO_A}">Sócio A</option>`);
    expect(saida).toMatch(/maxLength="200"/i);
    expect(saida).toContain("Lançar despesa");
  });

  it("FormularioDivisao: um par socioId/percentual por sócio, já preenchido com o que vigora; inativo vem marcado", () => {
    const saida = renderToStaticMarkup(
      createElement(FormularioDivisao, {
        hoje: "2026-10-26",
        socios: [
          { id: SOCIO_A, nome: "Sócio A", tipoRotulo: "Sócio ostensivo", ativo: true, percentualAtual: "60" },
          { id: SOCIO_B, nome: "Sócio B", tipoRotulo: "Sócio participante", ativo: false, percentualAtual: "" },
        ],
      }),
    );
    expect(saida).toContain(`name="socioId" value="${SOCIO_A}"`);
    expect(saida).toContain(`name="socioId" value="${SOCIO_B}"`);
    expect(saida).toContain('name="vigenteDesde"');
    expect(saida).toMatch(/name="percentual"[^>]*value="60"/);
    expect(saida).toContain("inativo");
    expect(saida).toContain("Salvar divisão da partilha");
  });
});
