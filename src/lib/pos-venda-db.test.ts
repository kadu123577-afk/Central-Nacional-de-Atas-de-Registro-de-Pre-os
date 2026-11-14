import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Carregador do pós-venda do consultor: o Prisma é trocado por um dublê; o que se confere é o filtro
 * (só as adesões do consultor da sessão), a etapa de cada adesão, a vigência do contrato com as
 * prorrogações, os aditivos, a margem para novo pedido e a ordem (quem pede ação primeiro).
 */
const dobles = vi.hoisted(() => ({ oportunidadeFindMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { oportunidadeVenda: { findMany: dobles.oportunidadeFindMany } } }));

import { carregarPosVenda } from "./pos-venda-db";

const AGORA = new Date("2026-11-16T15:00:00Z");
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

function adesao(extra: Record<string, unknown> = {}) {
  return {
    id: "op1",
    ataId: "ata1",
    atualizadoEm: dia("2026-10-01"),
    proximoContatoEm: null,
    valorAderido: "10000.00",
    ata: {
      numero: "12/2026",
      objeto: "Material de limpeza",
      dataVigenciaFim: dia("2027-08-01"),
      fornecedor: { razaoSocial: "Limpa Tudo Ltda" },
      itens: [
        { id: "i1", quantidadeRegistrada: 1000, saldo: { quantidadeConsumida: 200 } },
        { id: "i2", quantidadeRegistrada: 100, saldo: null },
      ],
    },
    entidadeAlvo: { nome: "Prefeitura de Jataí", municipio: "Jataí", uf: "GO" },
    itensAderidos: [{ itemId: "i1", quantidade: 200, criadoEm: dia("2026-10-05") }],
    liquidacoes: [],
    vinculosContrato: [],
    ...extra,
  };
}

const RECEBIDA = { dataLiquidacao: dia("2026-10-20"), statusCobranca: "recebida" };

beforeEach(() => {
  vi.clearAllMocks();
  dobles.oportunidadeFindMany.mockResolvedValue([]);
});

describe("carregarPosVenda", () => {
  it("lê só as adesões do consultor da sessão (estágio aderiu, não expiradas)", async () => {
    await carregarPosVenda("vend1", AGORA);
    expect(dobles.oportunidadeFindMany.mock.calls[0][0].where).toEqual({ vendedorId: "vend1", estagio: "aderiu", expiradaEm: null });
  });

  it("sem adesão, lista vazia", async () => {
    expect(await carregarPosVenda("vend1", AGORA)).toEqual([]);
  });

  it("a etapa vem dos dados: 14 sem contrato, 15 com contrato confirmado, 17 com tudo recebido", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      adesao({ id: "a14" }),
      adesao({ id: "a15", vinculosContrato: [{ decididoEm: dia("2026-10-10"), criadoEm: dia("2026-10-09"), contrato: { vigenciaFim: null, termos: [] } }] }),
      adesao({ id: "a17", liquidacoes: [RECEBIDA] }),
    ]);
    const linhas = await carregarPosVenda("vend1", AGORA);
    const etapa = (id: string) => linhas.find((l) => l.oportunidadeId === id)?.etapa;
    expect(etapa("a14")).toBe(14);
    expect(etapa("a15")).toBe(15);
    expect(etapa("a17")).toBe(17);
    expect(linhas.find((l) => l.oportunidadeId === "a17")?.situacao).toContain("pós-venda");
  });

  it("a vigência do contrato é a maior, contando as prorrogações; aditivos são contados pelo tipo", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      adesao({
        liquidacoes: [RECEBIDA],
        vinculosContrato: [
          {
            decididoEm: null,
            criadoEm: dia("2026-10-09"),
            contrato: {
              vigenciaFim: dia("2026-11-20"), // vence em 4 dias, mas foi prorrogado
              termos: [
                { tipo: "aditivo_prazo", novaVigenciaFim: dia("2027-11-20") },
                { tipo: "aditivo_valor", novaVigenciaFim: null },
                { tipo: "apostilamento", novaVigenciaFim: null },
              ],
            },
          },
        ],
      }),
    ]);
    const [linha] = await carregarPosVenda("vend1", AGORA);
    const tipos = linha.sinais.map((s) => s.tipo);
    expect(tipos).not.toContain("contrato_terminando");
    expect(tipos).not.toContain("contrato_vencido");
    const aditivo = linha.sinais.find((s) => s.tipo === "aditivo");
    expect(aditivo?.texto).toContain("2 aditivos apareceram");
  });

  it("contrato que vence em breve sem prorrogação aparece como urgente", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      adesao({
        liquidacoes: [RECEBIDA],
        vinculosContrato: [{ decididoEm: null, criadoEm: dia("2026-10-09"), contrato: { vigenciaFim: dia("2026-11-30"), termos: [] } }],
      }),
    ]);
    const [linha] = await carregarPosVenda("vend1", AGORA);
    expect(linha.urgente).toBe(true);
    expect(linha.sinais[0]).toMatchObject({ tipo: "contrato_terminando", urgente: true });
  });

  it("a margem para novo pedido conta os itens em que o município ainda pode aderir", async () => {
    // i1: registrado 1.000, consumido 200, o município já aderiu 200 → ainda cabem 300 (50% = 500). i2: 100 → cabem 50.
    dobles.oportunidadeFindMany.mockResolvedValue([adesao({ liquidacoes: [RECEBIDA] })]);
    const [linha] = await carregarPosVenda("vend1", AGORA);
    const novo = linha.sinais.find((s) => s.tipo === "novo_pedido");
    expect(novo?.texto).toContain("2 itens");
  });

  it("item que o município já esgotou (50%) ou que a ata já esgotou (dobro) não conta", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      adesao({
        liquidacoes: [RECEBIDA],
        ata: {
          ...adesao().ata,
          itens: [
            { id: "i1", quantidadeRegistrada: 1000, saldo: { quantidadeConsumida: 500 } }, // município no teto de 500
            { id: "i2", quantidadeRegistrada: 100, saldo: { quantidadeConsumida: 200 } }, // dobro esgotado
          ],
        },
        itensAderidos: [{ itemId: "i1", quantidade: 500, criadoEm: dia("2026-10-05") }],
      }),
    ]);
    const [linha] = await carregarPosVenda("vend1", AGORA);
    expect(linha.sinais.map((s) => s.tipo)).not.toContain("novo_pedido");
  });

  it("quem pede ação vem primeiro; depois, por município", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      adesao({ id: "b", entidadeAlvo: { nome: "Prefeitura de Bela Vista", municipio: "Bela Vista", uf: "GO" }, liquidacoes: [RECEBIDA] }),
      adesao({ id: "z", entidadeAlvo: { nome: "Prefeitura de Rio Verde", municipio: "Rio Verde", uf: "GO" }, proximoContatoEm: dia("2026-11-01"), liquidacoes: [RECEBIDA] }),
      adesao({ id: "a", entidadeAlvo: { nome: "Prefeitura de Anápolis", municipio: "Anápolis", uf: "GO" }, liquidacoes: [RECEBIDA] }),
    ]);
    const linhas = await carregarPosVenda("vend1", AGORA);
    expect(linhas.map((l) => l.oportunidadeId)).toEqual(["z", "a", "b"]);
    expect(linhas.map((l) => l.urgente)).toEqual([true, false, false]);
  });

  it("entrega os dados que a tela mostra", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([adesao()]);
    const [linha] = await carregarPosVenda("vend1", AGORA);
    expect(linha).toMatchObject({
      oportunidadeId: "op1",
      ataId: "ata1",
      ataNumero: "12/2026",
      ataObjeto: "Material de limpeza",
      fornecedor: "Limpa Tudo Ltda",
      municipio: "Jataí",
      uf: "GO",
      valorAderido: 10000,
    });
  });
});
