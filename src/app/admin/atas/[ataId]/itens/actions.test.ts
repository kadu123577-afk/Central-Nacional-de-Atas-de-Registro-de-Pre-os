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
  documentoFindFirst: vi.fn(),
  lerArquivo: vi.fn(),
  buscarPncp: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: d.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: d.redirect }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: d.adminIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: d.registrarAuditoria }));
vi.mock("@/lib/permissoes-db", () => ({ exigirPermissaoDe: d.exigirPermissaoDe }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ata: { findUnique: d.ataFindUnique },
    item: { create: d.itemCreate },
    documentoAta: { findFirst: d.documentoFindFirst },
    $transaction: d.transaction,
  },
}));
// A busca no PNCP (rede) é testada em src/lib/itens-pncp.test.ts; aqui só o que a ação faz com o resultado.
vi.mock("@/lib/itens-pncp", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/itens-pncp")>();
  return { ...real, buscarItensDaAtaNoPncp: d.buscarPncp };
});
// A leitura de Excel e PDF é testada em src/lib/importar-itens-arquivo.test.ts; aqui o leitor real vale por
// padrão (o CSV passa por ele) e cada teste pode trocá-lo para provar o que a ação faz com o resultado.
vi.mock("@/lib/importar-itens-arquivo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/importar-itens-arquivo")>();
  d.lerArquivo.mockImplementation(real.lerArquivoDeItens);
  return { ...real, lerArquivoDeItens: d.lerArquivo };
});

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
    expect(d.exigirPermissaoDe).toHaveBeenCalledWith("adm1", ["atas.itens", "atas.captar"], "admin.importarItens");
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

  it("Excel enviado: o texto lido vai para a conferência, com o recado do que foi lido", async () => {
    d.lerArquivo.mockResolvedValueOnce({ ok: true, formato: "xlsx", texto: PLANILHA, aviso: "Li o Excel.", naoLidas: [] });
    const arquivo = new File([new Uint8Array([80, 75, 3, 4])], "itens.xlsx");
    const r = await conferirItens(ATA, {}, formulario({ arquivo }));
    expect(d.lerArquivo).toHaveBeenCalledWith("itens.xlsx", expect.any(Uint8Array));
    expect(r.previa?.itens).toHaveLength(2);
    expect(r.texto).toBe(PLANILHA);
    expect(r).toMatchObject({ formato: "xlsx", aviso: "Li o Excel." });
    expect(r.naoLidas).toBeUndefined();
    expect(d.transaction).not.toHaveBeenCalled();
  });

  it("PDF enviado: devolve também as linhas que não pareciam item", async () => {
    d.lerArquivo.mockResolvedValueOnce({ ok: true, formato: "pdf", texto: PLANILHA, aviso: "Li 2 item(ns) do PDF.", naoLidas: ["Rodapé estranho"] });
    const r = await conferirItens(ATA, {}, formulario({ arquivo: new File([new Uint8Array([37, 80, 68, 70])], "ata.pdf") }));
    expect(r).toMatchObject({ formato: "pdf", naoLidas: ["Rodapé estranho"] });
  });

  it("arquivo que o leitor recusa (imagem, Excel antigo, PDF escaneado) vira erro, sem prévia", async () => {
    d.lerArquivo.mockResolvedValueOnce({ ok: false, erro: "Este PDF não tem texto." });
    const r = await conferirItens(ATA, {}, formulario({ arquivo: new File([new Uint8Array([1, 2, 3])], "scan.pdf") }));
    expect(r).toEqual({ erro: "Este PDF não tem texto." });
  });

  it("arquivo acima de 10 MB é recusado sem ser lido", async () => {
    const grande = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "enorme.xlsx");
    const r = await conferirItens(ATA, {}, formulario({ arquivo: grande }));
    expect(r.erro).toContain("10 MB");
    expect(d.lerArquivo).not.toHaveBeenCalled();
  });

  it("texto lido grande demais é recusado antes de conferir", async () => {
    d.lerArquivo.mockResolvedValueOnce({ ok: true, formato: "xlsx", texto: "a".repeat(200_001), aviso: null, naoLidas: [] });
    const r = await conferirItens(ATA, {}, formulario({ arquivo: new File([new Uint8Array([1])], "a.xlsx") }));
    expect(r.erro).toContain("texto demais");
    expect(r.previa).toBeUndefined();
  });

  it("documento já anexado à ata: lê o conteúdo guardado e vale mais que o arquivo e o texto colado", async () => {
    d.documentoFindFirst.mockResolvedValue({ nomeArquivo: "ata-12.pdf", conteudo: Buffer.from([37, 80, 68, 70]) });
    d.lerArquivo.mockResolvedValueOnce({ ok: true, formato: "pdf", texto: PLANILHA, aviso: "Li 2 item(ns) do PDF.", naoLidas: [] });
    const r = await conferirItens(
      ATA,
      {},
      formulario({ documentoId: "cmdoc0000000000000001", planilha: "lixo", arquivo: new File(["x"], "outro.csv") }),
    );
    expect(d.documentoFindFirst).toHaveBeenCalledWith({
      where: { id: "cmdoc0000000000000001", ataId: ATA },
      select: { nomeArquivo: true, conteudo: true },
    });
    expect(d.lerArquivo).toHaveBeenCalledWith("ata-12.pdf", expect.any(Uint8Array));
    expect(r.previa?.itens).toHaveLength(2);
    expect(r.formato).toBe("pdf");
  });

  it("documento de outra ata (ou que sumiu) e id fora do formato são recusados", async () => {
    d.documentoFindFirst.mockResolvedValue(null);
    const a = await conferirItens(ATA, {}, formulario({ documentoId: "cmdoc0000000000000001" }));
    expect(a.erro).toContain("não está mais na ata");
    const b = await conferirItens(ATA, {}, formulario({ documentoId: "x y; drop" }));
    expect(b.erro).toContain("Documento inválido");
    expect(d.lerArquivo).not.toHaveBeenCalled();
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

describe("conferirItens: buscar os itens no PNCP", () => {
  const ITEM = { numeroItem: 1, descricao: "Papel sulfite A4", categoria: "Material", unidade: "Caixa", quantidadeRegistrada: 90, valorUnitario: 8.5 };
  const BUSCA = { ok: true, itens: [ITEM], semResultado: 0, deOutraEmpresa: 2, comMaisDeDuasCasas: 0, truncado: false, empresaNaoConfirmada: false };

  beforeEach(() => {
    d.ataFindUnique.mockResolvedValue({
      id: ATA,
      categoria: "material-escritorio",
      linkPncp: "https://pncp.gov.br/app/atas/03532661000156/2024/75/1",
      numeroControlePncp: null,
      fornecedor: { cnpj: "20.720.905/0002-24" },
    });
  });

  it("busca a compra da ata, para a empresa da ata, e põe a lista no campo com o aviso do que ficou de fora", async () => {
    d.buscarPncp.mockResolvedValue(BUSCA);
    const r = await conferirItens(ATA, {}, formulario({ fonte: "pncp" }));
    expect(d.buscarPncp).toHaveBeenCalledWith({ cnpj: "03532661000156", ano: 2024, sequencialCompra: 75 }, { fornecedorCnpj: "20.720.905/0002-24" });
    expect(r.formato).toBe("pncp");
    expect(r.texto).toContain("Papel sulfite A4	Caixa	90	8,5");
    expect(r.previa?.itens).toHaveLength(1);
    expect(r.previa?.itens[0]).toMatchObject({ quantidadeRegistrada: 90, valorUnitario: "8.50" });
    expect(r.aviso).toContain("Li 1 item(ns) no PNCP");
    expect(r.aviso).toContain("2 item(ns) da compra foram ganhos por outra empresa");
    expect(d.transaction).not.toHaveBeenCalled();
  });

  it("vale mais que o arquivo, o documento e o texto colado", async () => {
    d.buscarPncp.mockResolvedValue(BUSCA);
    await conferirItens(ATA, {}, formulario({ fonte: "pncp", documentoId: "cmdoc0000000000000001", planilha: "lixo", arquivo: new File(["x"], "a.csv") }));
    expect(d.buscarPncp).toHaveBeenCalledTimes(1);
    expect(d.documentoFindFirst).not.toHaveBeenCalled();
    expect(d.lerArquivo).not.toHaveBeenCalled();
  });

  it("ata sem link nem número do PNCP: explica, sem consultar a rede", async () => {
    d.ataFindUnique.mockResolvedValue({ id: ATA, categoria: null, linkPncp: null, numeroControlePncp: null, fornecedor: { cnpj: "20720905000224" } });
    const r = await conferirItens(ATA, {}, formulario({ fonte: "pncp" }));
    expect(r.erro).toContain("não tem o link do PNCP");
    expect(d.buscarPncp).not.toHaveBeenCalled();
  });

  it("falha na consulta ao PNCP vira erro na tela, sem prévia", async () => {
    d.buscarPncp.mockResolvedValue({ ok: false, erro: "Não consegui consultar o PNCP agora." });
    const r = await conferirItens(ATA, {}, formulario({ fonte: "pncp" }));
    expect(r).toEqual({ erro: "Não consegui consultar o PNCP agora." });
  });
});
