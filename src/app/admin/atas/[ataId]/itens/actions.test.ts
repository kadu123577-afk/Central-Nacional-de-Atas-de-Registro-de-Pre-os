import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Importação de itens por planilha: conferir (nada é gravado) e gravar (tudo ou nada). A sessão,
 * a permissão, o Prisma e a auditoria são trocados por dublês.
 */
const d = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  exigirPermissaoDe: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  ataFindUnique: vi.fn(),
  itemCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: d.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: d.redirect }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: d.adminIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: d.registrarAuditoria }));
vi.mock("@/lib/permissoes-db", () => ({ exigirPermissaoDe: d.exigirPermissaoDe }));
vi.mock("@/lib/prisma", () => ({
  prisma: { ata: { findUnique: d.ataFindUnique }, item: { create: d.itemCreate }, $transaction: d.transaction },
}));

import { conferirItens, gravarItens } from "./actions";

const ATA = "cmataid00000000000001";
const PLANILHA = "Descrição;Unidade;Quantidade;Valor unitário\nPapel sulfite A4;Caixa;100;25,90\nCaneta azul;Un;2.000;1,50";

function formulario(campos: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  d.adminIdLogado.mockResolvedValue("adm1");
  d.exigirPermissaoDe.mockResolvedValue(undefined);
  d.ataFindUnique.mockResolvedValue({ id: ATA, categoria: "material-escritorio" });
  d.itemCreate.mockImplementation((args: unknown) => args);
  d.transaction.mockResolvedValue([]);
  d.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
});

describe("sessão e permissão primeiro", () => {
  it.each([
    ["conferirItens", () => conferirItens(ATA, {}, {} as FormData)],
    ["gravarItens", () => gravarItens(ATA, {}, {} as FormData)],
  ])("%s sem sessão vai para o login e não lê o formulário", async (_nome, chamar) => {
    d.adminIdLogado.mockResolvedValue(null);
    await expect(chamar()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
    expect(d.ataFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["conferirItens", () => conferirItens(ATA, {}, {} as FormData)],
    ["gravarItens", () => gravarItens(ATA, {}, {} as FormData)],
  ])("%s sem a permissão de captação para antes de tudo", async (_nome, chamar) => {
    d.exigirPermissaoDe.mockRejectedValue(new Error("NEXT_REDIRECT:/admin?acesso=negado"));
    await expect(chamar()).rejects.toThrow("NEXT_REDIRECT:/admin?acesso=negado");
    expect(d.exigirPermissaoDe).toHaveBeenCalledWith("adm1", "atas.captar", "admin.importarItens");
    expect(d.ataFindUnique).not.toHaveBeenCalled();
    expect(d.transaction).not.toHaveBeenCalled();
  });
});

describe("conferirItens", () => {
  it("lê o texto colado, devolve a prévia e o texto, e não grava nada", async () => {
    const r = await conferirItens(ATA, {}, formulario({ planilha: PLANILHA }));
    expect(r.previa?.itens).toHaveLength(2);
    expect(r.previa?.erros).toEqual([]);
    expect(r.texto).toBe(PLANILHA);
    expect(d.transaction).not.toHaveBeenCalled();
    expect(d.itemCreate).not.toHaveBeenCalled();
  });

  it("o arquivo enviado vale no lugar do texto colado", async () => {
    const arquivo = new File([PLANILHA], "itens.csv", { type: "text/csv" });
    const r = await conferirItens(ATA, {}, formulario({ planilha: "lixo", arquivo }));
    expect(r.previa?.itens).toHaveLength(2);
  });

  it("recusa arquivo do Excel com instrução clara", async () => {
    const arquivo = new File(["x"], "itens.xlsx");
    const r = await conferirItens(ATA, {}, formulario({ arquivo }));
    expect(r.erro).toContain("CSV");
    expect(r.previa).toBeUndefined();
  });

  it("usa a categoria da ata quando a planilha não traz", async () => {
    const r = await conferirItens(ATA, {}, formulario({ planilha: PLANILHA }));
    expect(r.previa?.itens.every((i) => i.categoria === "material-escritorio")).toBe(true);
  });

  it.each(["", "x y", "a".repeat(65)])("id da ata inválido (%s) é recusado antes de consultar o banco", async (id) => {
    await expect(conferirItens(id, {}, formulario({ planilha: PLANILHA }))).resolves.toEqual({ erro: "Ata não encontrada." });
    expect(d.ataFindUnique).not.toHaveBeenCalled();
  });

  it("ata que não existe", async () => {
    d.ataFindUnique.mockResolvedValue(null);
    await expect(conferirItens(ATA, {}, formulario({ planilha: PLANILHA }))).resolves.toEqual({ erro: "Ata não encontrada." });
  });
});

describe("gravarItens", () => {
  it("grava todos os itens numa transação, com saldo, e audita a contagem", async () => {
    const r = await gravarItens(ATA, {}, formulario({ planilha: PLANILHA }));
    expect(r).toEqual({ gravados: 2 });
    expect(d.itemCreate).toHaveBeenCalledTimes(2);
    expect(d.itemCreate.mock.calls[0][0].data).toEqual({
      ataId: ATA,
      descricao: "Papel sulfite A4",
      categoria: "material-escritorio",
      marca: null,
      unidade: "Caixa",
      quantidadeRegistrada: 100,
      valorUnitario: "25.90",
      codigoCatalogo: null,
      saldo: { create: {} },
    });
    expect(d.transaction).toHaveBeenCalledTimes(1);
    expect(d.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:adm1",
      acao: "admin.importarItens",
      alvo: ATA,
      detalhe: "2 item(ns) importado(s) por planilha",
    });
    expect(d.revalidatePath).toHaveBeenCalledWith(`/admin/atas/${ATA}/itens`);
  });

  it("tudo ou nada: com um erro na planilha, nada é gravado", async () => {
    const ruim = `${PLANILHA}\nBorracha;Un;0;1`;
    const r = await gravarItens(ATA, {}, formulario({ planilha: ruim }));
    expect(r.erro).toMatch(/erros/);
    expect(r.previa?.erros).toHaveLength(1);
    expect(d.transaction).not.toHaveBeenCalled();
    expect(d.registrarAuditoria).not.toHaveBeenCalled();
  });

  it("planilha vazia não grava", async () => {
    const r = await gravarItens(ATA, {}, formulario({ planilha: "" }));
    expect(r.erro).toBeTruthy();
    expect(d.transaction).not.toHaveBeenCalled();
  });

  it("sem o campo da planilha pede para conferir antes", async () => {
    await expect(gravarItens(ATA, {}, formulario({}))).resolves.toEqual({ erro: "Confira a planilha antes de gravar." });
  });
});
