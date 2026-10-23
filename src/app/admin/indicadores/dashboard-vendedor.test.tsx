import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O bloco "Indicadores da semana" no painel do consultor: o filtro vem SEMPRE
 * da sessão (nunca da URL), o resumo de outros consultores não é desenhado e
 * uma falha na consulta não derruba o resto do painel. Banco, sessão e
 * componentes de resumo trocados por dublês.
 */
const dobles = vi.hoisted(() => ({
  vendedorIdLogado: vi.fn(),
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
  vendedorFindUnique: vi.fn(),
  expirarOportunidadesVencidas: vi.fn(),
  carregarPainelVendedor: vi.fn(),
  carregarIndicadoresSemanais: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ vendedorIdLogado: dobles.vendedorIdLogado }));
vi.mock("next/navigation", () => ({
  redirect: dobles.redirect,
  usePathname: () => "/vendedor/dashboard",
}));
vi.mock("@/lib/prisma", () => ({ prisma: { vendedor: { findUnique: dobles.vendedorFindUnique } } }));
vi.mock("@/lib/negociacao-expiracao", () => ({ expirarOportunidadesVencidas: dobles.expirarOportunidadesVencidas }));
vi.mock("@/lib/painel-vendedor-db", () => ({ carregarPainelVendedor: dobles.carregarPainelVendedor }));
vi.mock("@/lib/indicadores-db", () => ({ carregarIndicadoresSemanais: dobles.carregarIndicadoresSemanais }));
vi.mock("@/app/vendedor/actions", () => ({ logoutVendedor: vi.fn() }));
vi.mock("@/components/vendedor/painel-resumo", () => ({
  KpisVendedor: () => null,
  TarefasHoje: () => null,
  FunilVendedor: () => null,
}));

import { dadosVazios, montarResumo, semanaAnterior, semanaDe, type DadosDaSemana } from "@/lib/indicadores-semanais";
import DashboardVendedorPage from "../../vendedor/dashboard/page";

const AGORA = new Date("2026-10-23T15:00:00-03:00");
const SEMANA = semanaDe(AGORA);

function resumoDoConsultor() {
  const dados = dadosVazios() as Record<string, ReadonlyMap<string, number>>;
  dados.contatos = new Map([["v-logado", 7]]);
  return montarResumo({
    semana: SEMANA,
    anterior: semanaAnterior(SEMANA),
    consultores: [
      { id: "v-logado", nome: "Carla Souza", ativo: true },
      // se o banco devolvesse outro consultor, o bloco não pode desenhá-lo.
      { id: "v-outro", nome: "Outro Consultor", ativo: true },
    ],
    dadosAtual: dados as DadosDaSemana,
    dadosAnterior: dadosVazios(),
  });
}

async function renderizar() {
  return renderToStaticMarkup(await DashboardVendedorPage());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: AGORA });
  dobles.vendedorIdLogado.mockResolvedValue("v-logado");
  dobles.vendedorFindUnique.mockResolvedValue({ id: "v-logado", nome: "Carla Souza" });
  dobles.expirarOportunidadesVencidas.mockResolvedValue(undefined);
  dobles.carregarPainelVendedor.mockResolvedValue({ kpis: {}, tarefas: [], funil: [], atas: [] });
  dobles.carregarIndicadoresSemanais.mockResolvedValue(resumoDoConsultor());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Dashboard do vendedor — Indicadores da semana", () => {
  it("sem sessão, manda para o login e não consulta indicador nenhum", async () => {
    dobles.vendedorIdLogado.mockResolvedValue(null);
    await expect(DashboardVendedorPage()).rejects.toThrow("REDIRECT:/vendedor/login");
    expect(dobles.carregarIndicadoresSemanais).not.toHaveBeenCalled();
  });

  it("pede os indicadores só do consultor da sessão, para a semana atual", async () => {
    const saida = await renderizar();
    expect(dobles.carregarIndicadoresSemanais).toHaveBeenCalledTimes(1);
    const [semanaPedida, opcoes] = dobles.carregarIndicadoresSemanais.mock.calls[0];
    expect(semanaPedida.segunda).toBe("2026-10-19");
    expect(opcoes).toEqual({ vendedorId: "v-logado" });
    expect(saida).toContain("Indicadores da semana");
    expect(saida).toContain("19/10 a 25/10/2026");
    // Só o total do resumo (já filtrado) é desenhado: nenhum nome de consultor sai no bloco.
    expect(saida).not.toContain("Outro Consultor");
  });

  it("se a consulta falhar, o painel continua e o bloco avisa (e o erro vai para o log)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    dobles.carregarIndicadoresSemanais.mockRejectedValue(new Error("banco fora do ar"));
    const saida = await renderizar();
    expect(saida).toContain("Não foi possível carregar os indicadores da semana");
    expect(saida).toContain("Desempenho por ata");
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
