import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Liberação de municípios e reserva da ata (14/11/2026): enquanto um consultor negocia numa ata, ela
 * fica reservada para ele. Se outro consultor também tinha pedido, o pedido dele é negado na hora de
 * liberar, com o motivo à vista. O Prisma, a sessão, a permissão e os feriados são dublês.
 */
const dobles = vi.hoisted(() => ({
  adminIdLogado: vi.fn(),
  exigirPermissaoDe: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  pedidoFindMany: vi.fn(),
  pedidoUpdate: vi.fn(),
  oportunidadeFindMany: vi.fn(),
  oportunidadeFindUnique: vi.fn(),
  oportunidadeCreate: vi.fn(),
  ataUpdateMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: dobles.redirect }));
vi.mock("@/lib/auth", () => ({ adminIdLogado: dobles.adminIdLogado }));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("@/lib/permissoes-db", () => ({
  exigirPermissaoDe: dobles.exigirPermissaoDe,
  ACAO_PERMISSAO_NEGADA: "permissao.negada",
  CAMINHO_SEM_PERMISSAO: "/admin?acesso=negado",
}));
vi.mock("@/lib/feriados-db", () => ({ carregarFeriadosExtras: vi.fn().mockResolvedValue(new Set()) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pedidoNegociacao: { findMany: dobles.pedidoFindMany, update: dobles.pedidoUpdate },
    oportunidadeVenda: {
      findMany: dobles.oportunidadeFindMany,
      findUnique: dobles.oportunidadeFindUnique,
      create: dobles.oportunidadeCreate,
    },
    ata: { updateMany: dobles.ataUpdateMany },
  },
}));

import { decidirPedidosNegociacao } from "./actions";

function formulario(campos: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) f.append(nome, v);
  }
  return f;
}

const APROVAR = { ataId: "ata1", vendedorId: "vendB", decisao: "aprovar", pedidoId: ["p1", "p2"] };

const daqui = (dias: number) => new Date(Date.now() + dias * 24 * 3600 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  dobles.adminIdLogado.mockResolvedValue("adm1");
  dobles.exigirPermissaoDe.mockResolvedValue(undefined);
  dobles.pedidoFindMany.mockResolvedValue([
    { id: "p1", entidadeAlvoId: "mun1" },
    { id: "p2", entidadeAlvoId: "mun2" },
  ]);
  dobles.pedidoUpdate.mockResolvedValue({});
  dobles.oportunidadeFindMany.mockResolvedValue([]);
  dobles.oportunidadeFindUnique.mockResolvedValue(null);
  dobles.oportunidadeCreate.mockResolvedValue({});
  dobles.ataUpdateMany.mockResolvedValue({ count: 1 });
});

describe("liberar municípios com a ata reservada por outro consultor", () => {
  it("nega todos os pedidos, com o motivo da reserva, e não cria nenhuma oportunidade", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      { vendedorId: "vendA", estagio: "em_negociacao", expiradaEm: null, prazoEm: daqui(5) },
    ]);

    await decidirPedidosNegociacao(formulario(APROVAR));

    expect(dobles.oportunidadeCreate).not.toHaveBeenCalled();
    expect(dobles.pedidoUpdate).toHaveBeenCalledTimes(2);
    for (const chamada of dobles.pedidoUpdate.mock.calls) {
      expect(chamada[0].data.status).toBe("negado");
      expect(chamada[0].data.motivo).toMatch(/^Ata reservada até \d{2}\/\d{2}\/\d{4}: outro consultor está negociando nela/);
    }
  });

  it("não marca o consultor negado como dono da ata", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      { vendedorId: "vendA", estagio: "a_contatar", expiradaEm: null, prazoEm: daqui(5) },
    ]);
    await decidirPedidosNegociacao(formulario(APROVAR));
    expect(dobles.ataUpdateMany).not.toHaveBeenCalled();
  });

  it("a consulta da reserva olha a ata inteira, só as oportunidades que ainda correm", async () => {
    await decidirPedidosNegociacao(formulario(APROVAR));
    expect(dobles.oportunidadeFindMany).toHaveBeenCalledWith({
      where: { ataId: "ata1", expiradaEm: null },
      select: { vendedorId: true, estagio: true, expiradaEm: true, prazoEm: true },
    });
  });
});

describe("liberar municípios com a ata livre", () => {
  it("ata sem oportunidades: libera os dois municípios e aprova os pedidos", async () => {
    await decidirPedidosNegociacao(formulario(APROVAR));

    expect(dobles.oportunidadeCreate).toHaveBeenCalledTimes(2);
    expect(dobles.pedidoUpdate.mock.calls.map((c) => c[0].data.status)).toEqual(["aprovado", "aprovado"]);
    expect(dobles.ataUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("negociação anterior já terminada (aderiu ou recusado) não segura a ata", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      { vendedorId: "vendA", estagio: "aderiu", expiradaEm: null, prazoEm: null },
      { vendedorId: "vendA", estagio: "recusado", expiradaEm: null, prazoEm: null },
    ]);
    await decidirPedidosNegociacao(formulario(APROVAR));
    expect(dobles.oportunidadeCreate).toHaveBeenCalledTimes(2);
  });

  it("o próprio consultor, que já negocia na ata, recebe mais municípios", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      { vendedorId: "vendB", estagio: "em_negociacao", expiradaEm: null, prazoEm: daqui(5) },
    ]);
    await decidirPedidosNegociacao(formulario(APROVAR));
    expect(dobles.oportunidadeCreate).toHaveBeenCalledTimes(2);
  });

  it("negar não consulta a reserva", async () => {
    await decidirPedidosNegociacao(formulario({ ...APROVAR, decisao: "negar", motivo: "Sem perfil" }));
    expect(dobles.oportunidadeFindMany).not.toHaveBeenCalled();
    expect(dobles.pedidoUpdate.mock.calls.map((c) => c[0].data.status)).toEqual(["negado", "negado"]);
  });
});
