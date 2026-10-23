import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A tela /admin/comissao: o que a página faz com a sessão (antes de tudo) e
 * o que desenha (estado vazio, números, tabela, avisos de intervalo). Banco,
 * sessão e ações trocados por dublês. Números de teste, sem relação com a
 * política comercial: quem define as faixas é o administrador, no banco.
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("next/navigation", () => ({ redirect: dobles.redirect, usePathname: () => "/admin/comissao" }));
vi.mock("../actions", () => ({ logoutAdmin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { faixaComissao: { findMany: dobles.findMany } } }));
vi.mock("./actions", () => ({
  criarFaixa: vi.fn(),
  atualizarFaixa: vi.fn(),
  alternarFaixa: vi.fn(),
  removerFaixa: vi.fn(),
}));

import { NAV_ADMIN } from "../nav";
import { FormularioNovaFaixa } from "./formulario-nova-faixa";
import { LinhaFaixa, type DadosFaixa } from "./linha-faixa";
import ComissaoPage from "./page";

function linhaDoBanco(extra: Partial<{ id: string; valorMinimo: string; percentual: string; descricao: string | null; ativo: boolean }> = {}) {
  return { id: "cm1abc23d0000xyz98765432", valorMinimo: "0.00", percentual: "0.0800", descricao: null, ativo: true, ...extra };
}

async function paginaHtml(): Promise<string> {
  return renderToStaticMarkup(await ComissaoPage());
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.adminIdLogado.mockResolvedValue("admin1");
  dobles.findMany.mockResolvedValue([]);
});

describe("página /admin/comissao", () => {
  it("sem admin logado manda para o login antes de consultar o banco", async () => {
    dobles.adminIdLogado.mockResolvedValue(null);
    await expect(ComissaoPage()).rejects.toThrow("REDIRECT:/admin/login");
    expect(dobles.findMany).not.toHaveBeenCalled();
  });

  it("consulta as faixas em ordem crescente de valor inicial", async () => {
    await paginaHtml();
    expect(dobles.findMany).toHaveBeenCalledTimes(1);
    expect(dobles.findMany.mock.calls[0][0].orderBy).toEqual({ valorMinimo: "asc" });
  });

  it("explica a regra: sugestão ao cadastrar o contrato, decisão do administrador", async () => {
    const saida = await paginaHtml();
    expect(saida).toContain("Faixas de comissão por valor total da ata");
    expect(saida).toContain("a sugestão aparece ao cadastrar o contrato de intermediação");
    expect(saida).toContain("a decisão do percentual é do administrador");
  });

  it("sem faixas: estado vazio claro, números zerados e o formulário de nova faixa", async () => {
    const saida = await paginaHtml();
    expect(saida).toContain("Nenhuma faixa cadastrada");
    expect(saida).toContain("nenhuma sugestão de comissão aparece");
    expect(saida).not.toContain("<table");
    expect(saida).toContain("Faixas ativas");
    expect(saida).toContain("0 cadastradas");
    expect(saida).toContain("Menor percentual");
    expect(saida).toContain("Maior percentual");
    expect(saida).toContain("—");
    expect(saida).toContain("Nova faixa");
    expect(saida).toContain('name="valorMinimo"');
    expect(saida).toContain('name="percentual"');
    expect(saida).toContain("Cadastrar faixa");
  });

  it("com faixas: tabela na moldura, números só das ativas, situação e avisos", async () => {
    dobles.findMany.mockResolvedValue([
      linhaDoBanco({ id: "cm1aaaaaaaaaaaaaaaaaaaaaa", valorMinimo: "50000.00", percentual: "0.0600", descricao: "porte médio" }),
      linhaDoBanco({ id: "cm1bbbbbbbbbbbbbbbbbbbbbb", valorMinimo: "500000.00", percentual: "0.0400" }),
      // Inativa: não entra em menor/maior nem na contagem de ativas.
      linhaDoBanco({ id: "cm1cccccccccccccccccccccc", valorMinimo: "9000000.00", percentual: "0.0100", ativo: false }),
    ]);
    const saida = await paginaHtml();

    expect(saida).toContain("moldura-tabela");
    expect(saida).toContain("tabela-atas");
    expect(saida).toContain("R$ 50.000,00");
    expect(saida).toContain("R$ 500.000,00");
    expect(saida).toContain("R$ 9.000.000,00");
    expect(saida).toContain("6%");
    expect(saida).toContain("porte médio");
    expect(saida).toContain("Ativa");
    expect(saida).toContain("Inativa");
    // Números: 2 ativas de 3 cadastradas; menor 4%, maior 6% (a inativa de 1% fica de fora).
    expect(saida).toContain("2</strong><span>Faixas ativas</span>");
    expect(saida).toContain("3 cadastradas");
    expect(saida).toContain("4%</strong><span>Menor percentual</span>");
    expect(saida).toContain("6%</strong><span>Maior percentual</span>");
    // A primeira faixa ativa começa acima de zero: avisa que atas abaixo disso ficam sem sugestão.
    expect(saida).toContain("Atas com valor total abaixo de R$ 50.000,00");
    expect(saida).not.toContain("Nenhuma faixa cadastrada");
  });

  it("faixa a partir de zero: não avisa de atas sem sugestão", async () => {
    dobles.findMany.mockResolvedValue([linhaDoBanco({ valorMinimo: "0.00", percentual: "0.0800" })]);
    const saida = await paginaHtml();
    expect(saida).not.toContain("ficam sem sugestão");
  });

  it("percentual fora de 3% a 15%: marca a faixa e avisa que a sugestão não pode ser usada como está", async () => {
    dobles.findMany.mockResolvedValue([linhaDoBanco({ valorMinimo: "0.00", percentual: "0.2000" })]);
    const saida = await paginaHtml();
    expect(saida).toContain("Fora de 3% a 15%");
    expect(saida).toContain("fora do intervalo que o contrato de intermediação aceita");
  });

  it("faixa dentro do intervalo não leva marca nem aviso de intervalo", async () => {
    dobles.findMany.mockResolvedValue([linhaDoBanco({ percentual: "0.0800" })]);
    const saida = await paginaHtml();
    expect(saida).not.toContain("Fora de 3% a 15%");
    expect(saida).not.toContain("fora do intervalo que o contrato de intermediação aceita");
  });

  it("só faixa inativa: números zerados e nenhum aviso de faixa fora de uso", async () => {
    dobles.findMany.mockResolvedValue([linhaDoBanco({ ativo: false })]);
    const saida = await paginaHtml();
    expect(saida).toContain("0</strong><span>Faixas ativas</span>");
    expect(saida).toContain("1 cadastrada");
    expect(saida).toContain("—</strong><span>Menor percentual</span>");
  });

  it("não escreve cor à mão (só tokens)", async () => {
    dobles.findMany.mockResolvedValue([linhaDoBanco({ percentual: "0.2000" })]);
    const saida = await paginaHtml();
    expect(saida).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(saida).not.toMatch(/rgb\(/);
  });
});

describe("menu do administrador", () => {
  it("tem o item Comissão, no grupo Financeiro, apontando para /admin/comissao", () => {
    const item = NAV_ADMIN.find((i) => i.href === "/admin/comissao");
    expect(item).toBeDefined();
    expect(item?.rotulo).toBe("Comissão");
    expect(item?.grupo).toBe("Financeiro");
  });
});

describe("LinhaFaixa", () => {
  const FAIXA: DadosFaixa = {
    id: "cm1abc23d0000xyz98765432",
    valorTexto: "R$ 100.000,00",
    percentualTexto: "5,25%",
    percentualCampo: "5,25",
    descricao: "teste",
    ativo: true,
    foraDoContrato: false,
  };

  function linhaHtml(faixa: DadosFaixa): string {
    return renderToStaticMarkup(createElement("table", null, createElement("tbody", null, createElement(LinhaFaixa, { faixa }))));
  }

  it("faixa ativa: mostra valores, Editar, Desativar e Remover, com o destino explícito no formulário", () => {
    const saida = linhaHtml(FAIXA);
    expect(saida).toContain("R$ 100.000,00");
    expect(saida).toContain("5,25%");
    expect(saida).toContain("teste");
    expect(saida).toContain("Ativa");
    expect(saida).toContain(">Editar<");
    expect(saida).toContain(">Desativar<");
    expect(saida).toContain(">Remover<");
    expect(saida).toContain('name="ativar" value="0"');
    expect(saida).toContain('name="id" value="cm1abc23d0000xyz98765432"');
    // Remoção só com confirmação: o botão de envio da remoção ainda não está na tela.
    expect(saida).not.toContain("Sim, remover");
  });

  it("faixa inativa: oferece Ativar, e o destino é 1", () => {
    const saida = linhaHtml({ ...FAIXA, ativo: false });
    expect(saida).toContain("Inativa");
    expect(saida).toContain(">Ativar<");
    expect(saida).toContain('name="ativar" value="1"');
  });

  it("sem descrição mostra um traço", () => {
    expect(linhaHtml({ ...FAIXA, descricao: null })).toContain("—");
  });
});

describe("FormularioNovaFaixa", () => {
  it("tem os três campos esperados e o botão de cadastro", () => {
    const saida = renderToStaticMarkup(createElement(FormularioNovaFaixa));
    expect(saida).toContain('name="valorMinimo"');
    expect(saida).toContain('name="percentual"');
    expect(saida).toContain('name="descricao"');
    expect(saida).toContain("Cadastrar faixa");
    expect(saida).toMatch(/maxLength="160"/i);
  });
});
