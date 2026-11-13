import { beforeEach, describe, expect, it, vi } from "vitest";
import { MENSAGEM_CODIGO_CATALOGO_INVALIDO } from "@/lib/vantajosidade-db";

/**
 * O campo "Código do catálogo (CATMAT/CATSER)" dos itens, nas duas actions do
 * admin que criam Item (adicionar item numa ata e cadastrar ata nova). O
 * Prisma, a sessão e a auditoria são trocados por dublês: o que se confere é
 * o que a action grava (vazio vira null, lixo é recusado antes de qualquer
 * escrita) e que os demais campos do item continuam como estavam.
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  itemCreate: vi.fn(),
  fornecedorUpsert: vi.fn(),
  orgaoUpsert: vi.fn(),
  ataCreate: vi.fn(),
  vincularAtaACaptacao: vi.fn(),
  orgaoFindUnique: vi.fn(),
  orgaoUpdate: vi.fn(),
  fornecedorFindUnique: vi.fn(),
  fornecedorUpdate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: dobles.redirect }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("@/lib/permissoes-db", () => ({
  exigirPermissaoDe: vi.fn(async () => undefined),
  adminTemPermissao: vi.fn(async () => true),
  permissoesDoAdmin: vi.fn(async () => []),
  ACAO_PERMISSAO_NEGADA: "permissao.negada",
  CAMINHO_SEM_PERMISSAO: "/admin?acesso=negado",
}));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("@/lib/captacao-db", () => ({ vincularAtaACaptacao: dobles.vincularAtaACaptacao }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    item: { create: dobles.itemCreate },
    fornecedor: { upsert: dobles.fornecedorUpsert, findUnique: dobles.fornecedorFindUnique, update: dobles.fornecedorUpdate },
    orgao: { upsert: dobles.orgaoUpsert, findUnique: dobles.orgaoFindUnique, update: dobles.orgaoUpdate },
    ata: { create: dobles.ataCreate },
  },
}));

import { adicionarItemNaAta, alternarStatusFornecedor, alternarStatusOrgao, cadastrarAtaComoAdmin } from "./actions";

function formulario(campos: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) f.append(nome, v);
  }
  return f;
}

function camposDoItem(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ataId: "ata1",
    descricao: "Papel sulfite A4",
    categoria: "material-escritorio",
    unidade: "Caixa",
    quantidadeRegistrada: "100",
    valorUnitario: "25.90",
    ...extra,
  };
}

function camposDaAta(extra: Record<string, string | string[]> = {}): Record<string, string | string[]> {
  return {
    fornecedorNome: "Papelaria Exemplo Ltda",
    fornecedorCnpj: "12345678000190",
    fornecedorEmail: "contato@papelaria.example",
    orgaoNome: "Prefeitura de Exemplo",
    orgaoCnpj: "98765432000110",
    orgaoUf: "go",
    orgaoMunicipio: "Exemplo",
    orgaoEsfera: "municipal",
    numero: "10/2026",
    objeto: "Material de escritório",
    ataCategoria: "material-escritorio",
    dataAssinatura: "2026-01-10",
    dataVigenciaFim: "2027-01-10",
    "itemDescricao[]": ["Papel", "Caneta", "Grampo"],
    "itemCategoria[]": ["material-escritorio", "material-escritorio", "material-escritorio"],
    "itemUnidade[]": ["Caixa", "Unidade", "Caixa"],
    "itemQuantidade[]": ["10", "20", "30"],
    "itemValorUnitario[]": ["25.90", "1.50", "3.00"],
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.adminIdLogado.mockResolvedValue("admin1");
  // Como o redirect de verdade: interrompe a action lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.itemCreate.mockResolvedValue({});
  dobles.fornecedorUpsert.mockResolvedValue({ id: "f1" });
  dobles.orgaoUpsert.mockResolvedValue({ id: "o1" });
  dobles.ataCreate.mockResolvedValue({ id: "ata-nova" });
  dobles.vincularAtaACaptacao.mockResolvedValue("cap1");
});

describe("adicionarItemNaAta: código do catálogo", () => {
  it("sem o campo ou em branco, grava null e mantém os outros campos do item", async () => {
    for (const campos of [camposDoItem(), camposDoItem({ codigoCatalogo: "" }), camposDoItem({ codigoCatalogo: "   " })]) {
      dobles.itemCreate.mockClear();
      await expect(adicionarItemNaAta({}, formulario(campos))).resolves.toEqual({});
      expect(dobles.itemCreate).toHaveBeenCalledTimes(1);
      expect(dobles.itemCreate).toHaveBeenCalledWith({
        data: {
          ataId: "ata1",
          descricao: "Papel sulfite A4",
          categoria: "material-escritorio",
          unidade: "Caixa",
          quantidadeRegistrada: 100,
          valorUnitario: "25.90",
          codigoCatalogo: null,
          saldo: { create: {} },
        },
      });
    }
  });

  it("grava o código só com dígitos, sem espaços nas pontas nem zeros à esquerda", async () => {
    await adicionarItemNaAta({}, formulario(camposDoItem({ codigoCatalogo: " 123456 " })));
    expect(dobles.itemCreate.mock.calls[0][0].data.codigoCatalogo).toBe("123456");

    await adicionarItemNaAta({}, formulario(camposDoItem({ codigoCatalogo: "0000789" })));
    expect(dobles.itemCreate.mock.calls[1][0].data.codigoCatalogo).toBe("789");
  });

  it.each(["abc", "12a", "12.5", "1 2", "-5", "12345678901", "0", "R$ 10"])(
    "recusa %j com mensagem clara e não grava nada",
    async (lixo) => {
      const estado = await adicionarItemNaAta({}, formulario(camposDoItem({ codigoCatalogo: lixo })));
      expect(estado).toEqual({ erro: MENSAGEM_CODIGO_CATALOGO_INVALIDO });
      expect(dobles.itemCreate).not.toHaveBeenCalled();
      expect(dobles.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("a validação dos campos obrigatórios continua valendo (e vem antes da do código)", async () => {
    const estado = await adicionarItemNaAta({}, formulario(camposDoItem({ descricao: "", codigoCatalogo: "abc" })));
    expect(estado).toEqual({ erro: "Preencha todos os campos do item com valores válidos." });
    expect(dobles.itemCreate).not.toHaveBeenCalled();
  });

  it("sem admin logado, manda para o login e não grava", async () => {
    dobles.adminIdLogado.mockResolvedValue(null);
    await expect(adicionarItemNaAta({}, formulario(camposDoItem({ codigoCatalogo: "123" })))).rejects.toThrow(
      "NEXT_REDIRECT:/admin/login",
    );
    expect(dobles.itemCreate).not.toHaveBeenCalled();
  });
});

describe("cadastrarAtaComoAdmin: código do catálogo dos itens", () => {
  it("grava o código de cada item (vazio vira null) e mantém os outros campos", async () => {
    await expect(
      cadastrarAtaComoAdmin({}, formulario(camposDaAta({ "itemCodigoCatalogo[]": ["123", "", "00456"] }))),
    ).rejects.toThrow("NEXT_REDIRECT:/admin/captacao/cap1?ataCriada=1");

    expect(dobles.ataCreate).toHaveBeenCalledTimes(1);
    const criados = dobles.ataCreate.mock.calls[0][0].data.itens.create;
    expect(criados).toEqual([
      {
        descricao: "Papel",
        categoria: "material-escritorio",
        unidade: "Caixa",
        quantidadeRegistrada: 10,
        valorUnitario: "25.90",
        codigoCatalogo: "123",
        saldo: { create: {} },
      },
      {
        descricao: "Caneta",
        categoria: "material-escritorio",
        unidade: "Unidade",
        quantidadeRegistrada: 20,
        valorUnitario: "1.50",
        codigoCatalogo: null,
        saldo: { create: {} },
      },
      {
        descricao: "Grampo",
        categoria: "material-escritorio",
        unidade: "Caixa",
        quantidadeRegistrada: 30,
        valorUnitario: "3.00",
        codigoCatalogo: "456",
        saldo: { create: {} },
      },
    ]);
  });

  it("formulário sem o campo de código (versão antiga da tela): todos os itens ficam com null", async () => {
    await expect(cadastrarAtaComoAdmin({}, formulario(camposDaAta()))).rejects.toThrow("NEXT_REDIRECT:/admin/captacao/cap1?ataCriada=1");
    const criados = dobles.ataCreate.mock.calls[0][0].data.itens.create as Array<{ codigoCatalogo: string | null }>;
    expect(criados.map((i) => i.codigoCatalogo)).toEqual([null, null, null]);
  });

  it("recusa código inválido apontando o item, antes de tocar no banco", async () => {
    const estado = await cadastrarAtaComoAdmin({}, formulario(camposDaAta({ "itemCodigoCatalogo[]": ["123", "abc", ""] })));
    expect(estado).toEqual({ erro: `Item 2: ${MENSAGEM_CODIGO_CATALOGO_INVALIDO}` });
    expect(dobles.fornecedorUpsert).not.toHaveBeenCalled();
    expect(dobles.orgaoUpsert).not.toHaveBeenCalled();
    expect(dobles.ataCreate).not.toHaveBeenCalled();
  });

  it("a validação dos campos obrigatórios dos itens continua valendo", async () => {
    const estado = await cadastrarAtaComoAdmin(
      {},
      formulario(camposDaAta({ "itemDescricao[]": ["Papel", "", "Grampo"], "itemCodigoCatalogo[]": ["abc", "", ""] })),
    );
    expect(estado).toEqual({ erro: "Preencha todos os campos obrigatórios de cada item com valores válidos." });
    expect(dobles.ataCreate).not.toHaveBeenCalled();
  });
});

describe("cadastrarAtaComoAdmin: ligação com a Captação", () => {
  it("entrega a ata cadastrada à Captação (com o cartão de origem, quando vem dele) e vai para o cartão", async () => {
    await expect(
      cadastrarAtaComoAdmin({}, formulario(camposDaAta({ captacaoId: "cm1abc23d0000xyz98765432", fornecedorCnpj: "12.345.678/0001-90" }))),
    ).rejects.toThrow("NEXT_REDIRECT:/admin/captacao/cap1?ataCriada=1");
    expect(dobles.vincularAtaACaptacao).toHaveBeenCalledTimes(1);
    expect(dobles.vincularAtaACaptacao.mock.calls[0][0]).toMatchObject({
      ataId: "ata-nova",
      adminId: "admin1",
      captacaoId: "cm1abc23d0000xyz98765432",
      fornecedorCnpj: "12345678000190",
      fornecedorNome: "Papelaria Exemplo Ltda",
      orgaoNome: "Prefeitura de Exemplo",
      uf: "GO",
      numeroAta: "10/2026",
      categoria: "material-escritorio",
    });
  });

  it("sem cartão de origem, ou com id fora do formato, o cadastro vale como direto", async () => {
    await expect(cadastrarAtaComoAdmin({}, formulario(camposDaAta()))).rejects.toThrow("NEXT_REDIRECT");
    expect(dobles.vincularAtaACaptacao.mock.calls[0][0].captacaoId).toBeNull();
    await expect(cadastrarAtaComoAdmin({}, formulario(camposDaAta({ captacaoId: "'; drop table" })))).rejects.toThrow("NEXT_REDIRECT");
    expect(dobles.vincularAtaACaptacao.mock.calls[1][0].captacaoId).toBeNull();
  });

  it("se a ligação falhar, a ata já existe: segue para a lista da Captação, sem erro", async () => {
    dobles.vincularAtaACaptacao.mockRejectedValue(new Error("banco fora"));
    await expect(cadastrarAtaComoAdmin({}, formulario(camposDaAta()))).rejects.toThrow(
      "NEXT_REDIRECT:/admin/captacao?ataCriada=1",
    );
    expect(dobles.ataCreate).toHaveBeenCalledTimes(1);
  });
});

describe("cadastrarAtaComoAdmin: itens opcionais e link do PNCP", () => {
  const SEM_ITENS = {
    "itemDescricao[]": [],
    "itemCategoria[]": [],
    "itemUnidade[]": [],
    "itemQuantidade[]": [],
    "itemValorUnitario[]": [],
  };

  it("sem nenhum item a ata é cadastrada: os itens e os saldos são do estagiário, na etapa seguinte", async () => {
    await expect(cadastrarAtaComoAdmin({}, formulario(camposDaAta(SEM_ITENS)))).rejects.toThrow("NEXT_REDIRECT:/admin/captacao/cap1?ataCriada=1");
    expect(dobles.ataCreate).toHaveBeenCalledTimes(1);
    expect(dobles.ataCreate.mock.calls[0][0].data.itens.create).toEqual([]);
  });

  it("item que veio pela metade continua recusado", async () => {
    const estado = await cadastrarAtaComoAdmin({}, formulario(camposDaAta({ ...SEM_ITENS, "itemDescricao[]": ["Papel"] })));
    expect(estado).toEqual({ erro: "Preencha todos os campos obrigatórios de cada item com valores válidos." });
    expect(dobles.ataCreate).not.toHaveBeenCalled();
  });

  it("guarda o link da ata no PNCP (também o número de controle, que vira o endereço)", async () => {
    await expect(
      cadastrarAtaComoAdmin({}, formulario(camposDaAta({ linkPncp: "pncp.gov.br/app/atas/03532661000156/2024/75/1" }))),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(dobles.ataCreate.mock.calls[0][0].data.linkPncp).toBe("https://pncp.gov.br/app/atas/03532661000156/2024/75/1");
    await expect(
      cadastrarAtaComoAdmin({}, formulario(camposDaAta({ linkPncp: "03532661000156-1-000075/2024-000001" }))),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(dobles.ataCreate.mock.calls[1][0].data.linkPncp).toBe("https://pncp.gov.br/app/atas/03532661000156/2024/75/1");
  });

  it("sem link, grava null; link de outro site é recusado antes de tocar no banco", async () => {
    await expect(cadastrarAtaComoAdmin({}, formulario(camposDaAta()))).rejects.toThrow("NEXT_REDIRECT");
    expect(dobles.ataCreate.mock.calls[0][0].data.linkPncp).toBeNull();

    dobles.fornecedorUpsert.mockClear();
    const estado = await cadastrarAtaComoAdmin({}, formulario(camposDaAta({ linkPncp: "https://golpe.example/ata" })));
    expect(estado.erro).toContain("pncp.gov.br");
    expect(dobles.fornecedorUpsert).not.toHaveBeenCalled();
    expect(dobles.ataCreate).toHaveBeenCalledTimes(1);
  });
});

describe("liberar o cadastro de órgão e de fornecedor (Usuários)", () => {
  it.each([
    ["órgão", alternarStatusOrgao, "orgaoId", () => dobles.orgaoFindUnique, () => dobles.orgaoUpdate],
    ["fornecedor", alternarStatusFornecedor, "fornecedorId", () => dobles.fornecedorFindUnique, () => dobles.fornecedorUpdate],
  ])("%s: reativar (ou liberar) limpa a marca de aguardando liberação; desativar não mexe nela", async (_nome, acao, campo, achar, atualizar) => {
    achar().mockResolvedValue({ id: "x1", ativo: false, aguardaLiberacao: true });
    await acao(formulario({ [campo]: "x1" }));
    expect(atualizar()).toHaveBeenLastCalledWith({ where: { id: "x1" }, data: { ativo: true, aguardaLiberacao: false } });

    achar().mockResolvedValue({ id: "x1", ativo: true, aguardaLiberacao: false });
    await acao(formulario({ [campo]: "x1" }));
    expect(atualizar()).toHaveBeenLastCalledWith({ where: { id: "x1" }, data: { ativo: false } });
  });
});
