import { beforeEach, describe, expect, it, vi } from "vitest";
import { MENSAGEM_CODIGO_CATALOGO_INVALIDO } from "@/lib/vantajosidade-db";

/**
 * definirCodigoCatalogoItem: informar, corrigir ou apagar o código do catálogo
 * de um item JÁ cadastrado (tela "Análise da ata", bloco "Vantajosidade dos
 * preços"). O Prisma, a sessão e a auditoria são trocados por dublês: o que se
 * confere é a ordem (sessão antes de qualquer leitura), o que é gravado, que o
 * lixo é recusado antes de tocar no banco e que só se grava e audita quando o
 * código de fato muda.
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  itemFindUnique: vi.fn(),
  itemUpdate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: dobles.redirect }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    item: { findUnique: dobles.itemFindUnique, update: dobles.itemUpdate },
  },
}));

import { definirCodigoCatalogoItem } from "./actions";

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.append(nome, valor);
  return f;
}

function itemNoBanco(codigoCatalogo: string | null) {
  return { id: "item1", ataId: "ata1", codigoCatalogo };
}

function nadaFoiAoBanco() {
  expect(dobles.itemFindUnique).not.toHaveBeenCalled();
  expect(dobles.itemUpdate).not.toHaveBeenCalled();
  expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  expect(dobles.revalidatePath).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.adminIdLogado.mockResolvedValue("admin1");
  // Como o redirect de verdade: interrompe a action lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.itemFindUnique.mockResolvedValue(itemNoBanco(null));
  dobles.itemUpdate.mockResolvedValue({});
});

describe("definirCodigoCatalogoItem: sessão", () => {
  it("sem admin logado, manda para o login, não lê o formulário e não toca no banco", async () => {
    dobles.adminIdLogado.mockResolvedValue(null);
    const dados = formulario({ itemId: "item1", codigoCatalogo: "123456" });
    const leitura = vi.spyOn(dados, "get");

    await expect(definirCodigoCatalogoItem({}, dados)).rejects.toThrow("NEXT_REDIRECT:/admin/login");

    expect(leitura).not.toHaveBeenCalled();
    nadaFoiAoBanco();
  });
});

describe("definirCodigoCatalogoItem: entrada inválida", () => {
  it.each([
    ["sem o campo do item", {}],
    ["item em branco", { itemId: "" }],
    ["item só com espaços", { itemId: "   " }],
    ["item com id enorme", { itemId: "x".repeat(101) }],
  ])("recusa %s, sem tocar no banco", async (_nome, campos) => {
    const estado = await definirCodigoCatalogoItem({}, formulario({ ...campos, codigoCatalogo: "123456" }));
    expect(estado.erro).toBe("Item inválido. Recarregue a página e tente de novo.");
    nadaFoiAoBanco();
  });

  it("recusa o item enviado como arquivo, não como texto", async () => {
    const dados = new FormData();
    dados.append("itemId", new Blob(["item1"]), "item1.txt");
    dados.append("codigoCatalogo", "123456");
    const estado = await definirCodigoCatalogoItem({}, dados);
    expect(estado.erro).toBe("Item inválido. Recarregue a página e tente de novo.");
    nadaFoiAoBanco();
  });

  it("campo do código ausente é recusado, não vira 'apagar o código'", async () => {
    dobles.itemFindUnique.mockResolvedValue(itemNoBanco("123456"));
    const estado = await definirCodigoCatalogoItem({}, formulario({ itemId: "item1" }));
    expect(estado).toEqual({ erro: MENSAGEM_CODIGO_CATALOGO_INVALIDO, valor: "" });
    nadaFoiAoBanco();
  });

  it.each(["abc", "12a", "12.5", "1 2", "-5", "12345678901", "0", "000", "R$ 10", "1e3"])(
    "recusa o código %j com a mensagem clara e devolve o texto digitado",
    async (lixo) => {
      const estado = await definirCodigoCatalogoItem({}, formulario({ itemId: "item1", codigoCatalogo: lixo }));
      expect(estado).toEqual({ erro: MENSAGEM_CODIGO_CATALOGO_INVALIDO, valor: lixo });
      nadaFoiAoBanco();
    },
  );

  it("o texto devolvido junto do erro é cortado, para não devolver um conteúdo enorme", async () => {
    const estado = await definirCodigoCatalogoItem({}, formulario({ itemId: "item1", codigoCatalogo: "a".repeat(5000) }));
    expect(estado.erro).toBe(MENSAGEM_CODIGO_CATALOGO_INVALIDO);
    expect(estado.valor).toHaveLength(64);
  });

  it("item que não existe: erro claro, sem gravar nem auditar", async () => {
    dobles.itemFindUnique.mockResolvedValue(null);
    const estado = await definirCodigoCatalogoItem({}, formulario({ itemId: "fantasma", codigoCatalogo: "123456" }));
    expect(estado).toEqual({ erro: "Item não encontrado. Recarregue a página e tente de novo.", valor: "123456" });
    expect(dobles.itemFindUnique).toHaveBeenCalledWith({
      where: { id: "fantasma" },
      select: { id: true, ataId: true, codigoCatalogo: true },
    });
    expect(dobles.itemUpdate).not.toHaveBeenCalled();
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("definirCodigoCatalogoItem: informar e corrigir", () => {
  it("informa o código de um item que não tinha: grava, audita e revalida as telas da ata", async () => {
    const estado = await definirCodigoCatalogoItem({}, formulario({ itemId: "item1", codigoCatalogo: "631014" }));

    expect(estado).toEqual({ mensagem: "Código 631014 salvo.", valor: "631014" });
    expect(dobles.itemUpdate).toHaveBeenCalledTimes(1);
    expect(dobles.itemUpdate).toHaveBeenCalledWith({ where: { id: "item1" }, data: { codigoCatalogo: "631014" } });
    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:admin1",
      acao: "admin.definirCodigoCatalogoItem",
      alvo: "item:item1",
      detalhe: "Ata ata1: código do catálogo (vazio) → 631014.",
    });
    const rotas = dobles.revalidatePath.mock.calls.map((c) => c[0]);
    expect(rotas).toContain("/admin/atas/ata1/analise");
    expect(rotas).toContain("/admin/atas/ata1/completar");
  });

  it("corrige um código errado e registra o valor antigo e o novo na auditoria", async () => {
    dobles.itemFindUnique.mockResolvedValue(itemNoBanco("111"));
    const estado = await definirCodigoCatalogoItem({}, formulario({ itemId: "item1", codigoCatalogo: "222" }));

    expect(estado).toEqual({ mensagem: "Código 222 salvo.", valor: "222" });
    expect(dobles.itemUpdate).toHaveBeenCalledWith({ where: { id: "item1" }, data: { codigoCatalogo: "222" } });
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe("Ata ata1: código do catálogo 111 → 222.");
  });

  it("grava o código sem espaços nas pontas nem zeros à esquerda", async () => {
    const estado = await definirCodigoCatalogoItem({}, formulario({ itemId: "item1", codigoCatalogo: " 0000789 " }));
    expect(estado).toEqual({ mensagem: "Código 789 salvo.", valor: "789" });
    expect(dobles.itemUpdate).toHaveBeenCalledWith({ where: { id: "item1" }, data: { codigoCatalogo: "789" } });
  });

  it("código antigo com zeros à esquerda é normalizado ao salvar o mesmo número", async () => {
    dobles.itemFindUnique.mockResolvedValue(itemNoBanco("0789"));
    await definirCodigoCatalogoItem({}, formulario({ itemId: "item1", codigoCatalogo: "789" }));
    expect(dobles.itemUpdate).toHaveBeenCalledWith({ where: { id: "item1" }, data: { codigoCatalogo: "789" } });
    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
  });
});

describe("definirCodigoCatalogoItem: apagar", () => {
  it.each(["", "   ", "\t"])("campo em branco (%j) apaga o código e audita", async (vazio) => {
    dobles.itemUpdate.mockClear();
    dobles.registrarAuditoria.mockClear();
    dobles.itemFindUnique.mockResolvedValue(itemNoBanco("123456"));

    const estado = await definirCodigoCatalogoItem({}, formulario({ itemId: "item1", codigoCatalogo: vazio }));

    expect(estado).toEqual({ mensagem: "Código apagado.", valor: "" });
    expect(dobles.itemUpdate).toHaveBeenCalledWith({ where: { id: "item1" }, data: { codigoCatalogo: null } });
    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe("Ata ata1: código do catálogo 123456 → (vazio).");
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/atas/ata1/analise");
  });
});

describe("definirCodigoCatalogoItem: sem mudança", () => {
  it("mesmo código: não grava, não audita e não revalida", async () => {
    dobles.itemFindUnique.mockResolvedValue(itemNoBanco("123456"));
    const estado = await definirCodigoCatalogoItem({}, formulario({ itemId: "item1", codigoCatalogo: " 0123456 " }));

    expect(estado).toEqual({ mensagem: "O item já tinha esse código; nada foi alterado.", valor: "123456" });
    expect(dobles.itemUpdate).not.toHaveBeenCalled();
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
  });

  it("apagar um item que já está sem código: não grava nem audita", async () => {
    dobles.itemFindUnique.mockResolvedValue(itemNoBanco(null));
    const estado = await definirCodigoCatalogoItem({}, formulario({ itemId: "item1", codigoCatalogo: "" }));

    expect(estado).toEqual({ mensagem: "O item já estava sem código; nada foi alterado.", valor: "" });
    expect(dobles.itemUpdate).not.toHaveBeenCalled();
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("definirCodigoCatalogoItem: falha ao gravar", () => {
  it("se o banco recusar a gravação, devolve erro e não audita nem revalida", async () => {
    const aviso = vi.spyOn(console, "error").mockImplementation(() => {});
    dobles.itemUpdate.mockRejectedValue(new Error("registro apagado no meio"));

    const estado = await definirCodigoCatalogoItem({}, formulario({ itemId: "item1", codigoCatalogo: "123456" }));

    expect(estado).toEqual({ erro: "Não foi possível salvar o código agora. Tente de novo.", valor: "123456" });
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
    aviso.mockRestore();
  });
});
