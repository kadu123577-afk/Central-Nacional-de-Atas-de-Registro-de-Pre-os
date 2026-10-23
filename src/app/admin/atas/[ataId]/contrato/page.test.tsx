import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * A página do contrato de intermediação com a comissão sugerida (Projeto RNA,
 * etapa 6): o que ela consulta (só faixas ATIVAS, itens da ata), o que mostra
 * em cada caso e, principalmente, o que NÃO faz: a sugestão não troca o
 * percentual já pactuado e uma falha na consulta das faixas não derruba a tela.
 * Banco, sessão e ações trocados por dublês; números de teste, sem relação com
 * a política comercial (quem define as faixas é o administrador).
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  ataFindUnique: vi.fn(),
  faixaFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("next/navigation", () => ({
  redirect: dobles.redirect,
  notFound: dobles.notFound,
  usePathname: () => "/admin/atas/ata1/contrato",
}));
vi.mock("../../../actions", () => ({ logoutAdmin: vi.fn(), salvarContratoIntermediacao: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ata: { findUnique: dobles.ataFindUnique },
    faixaComissao: { findMany: dobles.faixaFindMany },
  },
}));

import ContratoAtaPage from "./page";

// Total da ata de teste: R$ 110.025,00.
const ITENS = [
  { quantidadeRegistrada: 100, valorUnitario: "1000.00" },
  { quantidadeRegistrada: 50, valorUnitario: "200.50" },
];

function ata(extra: Record<string, unknown> = {}) {
  return {
    id: "ata1",
    numero: "123/2026",
    objeto: "Objeto de teste",
    fornecedor: { razaoSocial: "Fornecedora de Teste Ltda" },
    contrato: null,
    itens: ITENS,
    ...extra,
  };
}

async function paginaHtml(): Promise<string> {
  return renderToStaticMarkup(await ContratoAtaPage({ params: Promise.resolve({ ataId: "ata1" }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.adminIdLogado.mockResolvedValue("admin1");
  dobles.ataFindUnique.mockResolvedValue(ata());
  dobles.faixaFindMany.mockResolvedValue([]);
});

describe("página do contrato de intermediação", () => {
  it("sem admin logado manda para o login antes de consultar qualquer coisa", async () => {
    dobles.adminIdLogado.mockResolvedValue(null);
    await expect(paginaHtml()).rejects.toThrow("REDIRECT:/admin/login");
    expect(dobles.ataFindUnique).not.toHaveBeenCalled();
    expect(dobles.faixaFindMany).not.toHaveBeenCalled();
  });

  it("ata que não existe continua dando 404, sem consultar as faixas", async () => {
    dobles.ataFindUnique.mockResolvedValue(null);
    await expect(paginaHtml()).rejects.toThrow("NOT_FOUND");
    expect(dobles.faixaFindMany).not.toHaveBeenCalled();
  });

  it("consulta só as faixas ATIVAS e traz quantidade e valor unitário dos itens da ata", async () => {
    await paginaHtml();
    expect(dobles.faixaFindMany).toHaveBeenCalledTimes(1);
    expect(dobles.faixaFindMany.mock.calls[0][0].where).toEqual({ ativo: true });
    const consultaAta = dobles.ataFindUnique.mock.calls[0][0];
    expect(consultaAta.where).toEqual({ id: "ata1" });
    expect(consultaAta.include.itens).toEqual({ select: { quantidadeRegistrada: true, valorUnitario: true } });
  });

  it("mostra o valor total, a sugestão da faixa e o botão que só preenche o campo", async () => {
    dobles.faixaFindMany.mockResolvedValue([
      { valorMinimo: "0.00", percentual: "0.1000" },
      { valorMinimo: "100000.00", percentual: "0.0525" },
      { valorMinimo: "1000000.00", percentual: "0.0400" },
    ]);
    const saida = await paginaHtml();
    expect(saida).toContain("Valor total da ata:");
    expect(saida).toContain("R$ 110.025,00");
    expect(saida).toContain("Sugestão:");
    expect(saida).toContain("5,25%");
    expect(saida).toContain("faixa a partir de");
    expect(saida).toContain("R$ 100.000,00");
    expect(saida).toMatch(/<button type="button"[^>]*>Usar sugestão<\/button>/);
    // A página só mostra: o contrato continua sendo gravado pelo botão de salvar.
    expect(saida).toContain("Salvar contrato");
  });

  it("a sugestão fica acima do campo do percentual e não o preenche sozinha", async () => {
    dobles.faixaFindMany.mockResolvedValue([{ valorMinimo: "0.00", percentual: "0.0525" }]);
    const saida = await paginaHtml();
    expect(saida.indexOf("Sugestão:")).toBeGreaterThan(-1);
    expect(saida.indexOf("Sugestão:")).toBeLessThan(saida.indexOf('name="percentualComissao"'));
    // Contrato novo: o campo nasce vazio (nenhum valor escrito nele).
    expect(saida).not.toMatch(/name="percentualComissao"[^>]*value="5,25"/);
    expect(saida).not.toMatch(/value="5,25"[^>]*name="percentualComissao"/);
  });

  it("contrato já cadastrado: o percentual pactuado continua no campo, mesmo com sugestão diferente", async () => {
    dobles.ataFindUnique.mockResolvedValue(
      ata({
        contrato: {
          percentualComissao: "0.0750",
          dataAssinatura: new Date("2026-10-01T00:00:00.000Z"),
          vigenciaFim: null,
          observacoes: null,
        },
      }),
    );
    dobles.faixaFindMany.mockResolvedValue([{ valorMinimo: "0.00", percentual: "0.0525" }]);
    const saida = await paginaHtml();
    expect(saida).toContain("5,25%");
    expect(saida).toMatch(/name="percentualComissao"[^>]*value="7,5"|value="7,5"[^>]*name="percentualComissao"/);
  });

  it("sem faixas ativas: texto neutro, valor total e link para a tela de comissão", async () => {
    const saida = await paginaHtml();
    expect(saida).toContain("Nenhuma faixa de comissão está configurada");
    expect(saida).toContain("R$ 110.025,00");
    expect(saida).toContain('href="/admin/comissao"');
    expect(saida).not.toContain("Usar sugestão");
  });

  it("ata sem itens: não sugere sobre R$ 0,00", async () => {
    dobles.ataFindUnique.mockResolvedValue(ata({ itens: [] }));
    dobles.faixaFindMany.mockResolvedValue([{ valorMinimo: "0.00", percentual: "0.0525" }]);
    const saida = await paginaHtml();
    expect(saida).toContain("ainda não tem itens");
    expect(saida).not.toContain("Usar sugestão");
  });

  it("falha na consulta das faixas: a tela do contrato continua inteira e avisa que a sugestão não está disponível", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    dobles.faixaFindMany.mockRejectedValue(new Error("tabela faixas_comissao não existe"));
    const saida = await paginaHtml();
    expect(saida).toContain("Não foi possível consultar as faixas");
    expect(saida).toContain('name="percentualComissao"');
    expect(saida).toContain("Salvar contrato");
    expect(saida).not.toContain("Usar sugestão");
    expect(saida).not.toContain("Nenhuma faixa de comissão está configurada");
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
