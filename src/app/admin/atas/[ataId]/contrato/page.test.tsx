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
  carregarAtaNoCiclo: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("next/navigation", () => ({
  redirect: dobles.redirect,
  notFound: dobles.notFound,
  usePathname: () => "/admin/atas/ata1/contrato",
}));
vi.mock("../../../actions", () => ({ logoutAdmin: vi.fn(), salvarContratoIntermediacao: vi.fn() }));
vi.mock("@/lib/permissoes-db", () => ({
  exigirPermissaoDe: vi.fn(async () => undefined),
  adminTemPermissao: vi.fn(async () => true),
  permissoesDoAdmin: vi.fn(async () => []),
  ACAO_PERMISSAO_NEGADA: "permissao.negada",
  CAMINHO_SEM_PERMISSAO: "/admin?acesso=negado",
}));
vi.mock("@/lib/ciclo-ata-db", () => ({ carregarAtaNoCiclo: dobles.carregarAtaNoCiclo }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ata: { findUnique: dobles.ataFindUnique },
    faixaComissao: { findMany: dobles.faixaFindMany },
  },
}));

import { permissoesDoAdmin } from "@/lib/permissoes-db";
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

/** O que o ciclo da ata sabe: por padrão, empresa fechada e itens cadastrados (o contrato já pode abrir). */
function noCiclo(dados: Record<string, unknown> = {}) {
  return {
    id: "ata1",
    dados: {
      status: "PENDENTE",
      criadaEm: new Date("2026-11-02T15:00:00Z"),
      atualizadaEm: new Date("2026-11-02T15:00:00Z"),
      fornecedorAConfirmar: false,
      totalItens: 2,
      contratoEm: null,
      conformidadeEm: null,
      categoria: null,
      ...dados,
    },
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
  dobles.carregarAtaNoCiclo.mockResolvedValue(noCiclo());
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

  it("ata sem itens: o contrato não abre (etapa 3 antes da 4), explica e leva para os itens", async () => {
    dobles.ataFindUnique.mockResolvedValue(ata({ itens: [] }));
    dobles.carregarAtaNoCiclo.mockResolvedValue(noCiclo({ totalItens: 0 }));
    dobles.faixaFindMany.mockResolvedValue([{ valorMinimo: "0.00", percentual: "0.0525" }]);
    const saida = await paginaHtml();
    expect(saida).toContain("O contrato ainda não pode ser cadastrado.");
    expect(saida).toContain("falta a etapa 3 (Cadastrar itens e saldos");
    expect(saida).toContain('href="/admin/atas/ata1/itens"');
    expect(saida).not.toContain('name="percentualComissao"');
    expect(saida).not.toContain("Salvar contrato");
    expect(saida).not.toContain("Usar sugestão");
  });

  it("empresa ainda não fechada (etapa 2): o contrato também espera e leva para completar o fornecedor", async () => {
    dobles.carregarAtaNoCiclo.mockResolvedValue(noCiclo({ fornecedorAConfirmar: true }));
    const saida = await paginaHtml();
    expect(saida).toContain("falta a etapa 2 (Fechar com a empresa prestadora");
    expect(saida).toContain('href="/admin/atas/ata1/completar"');
    expect(saida).not.toContain('name="percentualComissao"');
  });

  it("com empresa e itens, o formulário aparece e não há aviso de bloqueio", async () => {
    const saida = await paginaHtml();
    expect(saida).toContain('name="percentualComissao"');
    expect(saida).not.toContain("O contrato ainda não pode ser cadastrado.");
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

describe("próximo passo depois do contrato", () => {
  const contrato = { percentualComissao: "0.08", dataAssinatura: new Date("2026-11-14T00:00:00Z"), vigenciaFim: null, observacoes: null };

  it("contrato feito e conformidade pendente (etapa 5): leva à análise de quem pode fazê-la", async () => {
    dobles.ataFindUnique.mockResolvedValue(ata({ contrato }));
    dobles.carregarAtaNoCiclo.mockResolvedValue(noCiclo({ contratoEm: new Date("2026-11-14T12:00:00Z") }));
    vi.mocked(permissoesDoAdmin).mockResolvedValueOnce(["atas.contrato", "atas.conformidade"]);
    const html = await paginaHtml();
    expect(html).toContain("Próximo passo");
    expect(html).toContain("Agora vem a conformidade da ata");
    expect(html).toContain('href="/admin/atas/ata1/analise"');
    expect(html).toContain("Fazer a conformidade da ata");
  });

  it("conformidade já concluída (ata liberada): o botão abre a análise, sem falar em aprovação", async () => {
    dobles.ataFindUnique.mockResolvedValue(ata({ contrato }));
    dobles.carregarAtaNoCiclo.mockResolvedValue(
      noCiclo({
        status: "APROVADA",
        contratoEm: new Date("2026-11-14T12:00:00Z"),
        conformidadeEm: new Date("2026-11-14T13:00:00Z"),
      }),
    );
    vi.mocked(permissoesDoAdmin).mockResolvedValueOnce(["atas.contrato", "atas.conformidade"]);
    const html = await paginaHtml();
    expect(html).toContain("A ata já passou das etapas seguintes");
    expect(html).toContain("Abrir a análise da ata");
    expect(html).not.toContain("aprovação");
  });

  it("quem só faz o contrato não recebe o botão: a ata segue para quem faz a conformidade", async () => {
    dobles.ataFindUnique.mockResolvedValue(ata({ contrato }));
    dobles.carregarAtaNoCiclo.mockResolvedValue(noCiclo({ contratoEm: new Date("2026-11-14T12:00:00Z") }));
    vi.mocked(permissoesDoAdmin).mockResolvedValueOnce(["atas.contrato"]);
    const html = await paginaHtml();
    expect(html).toContain("Próximo passo");
    expect(html).not.toContain("/admin/atas/ata1/analise");
    expect(html).toContain("A ata segue para quem faz a conformidade");
  });

  it("sem contrato cadastrado, ou com o contrato bloqueado, não há próximo passo", async () => {
    expect(await paginaHtml()).not.toContain("Próximo passo");
    dobles.ataFindUnique.mockResolvedValue(ata({ contrato }));
    dobles.carregarAtaNoCiclo.mockResolvedValue(noCiclo({ totalItens: 0 }));
    expect(await paginaHtml()).not.toContain("Próximo passo");
  });
});
