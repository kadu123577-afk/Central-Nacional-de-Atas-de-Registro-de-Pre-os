import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pedido de municípios (solicitarMunicipios), testado sem banco: o Prisma, a sessão e o restante do
 * que a action importa são trocados por dublês. Qualquer consultor pede qualquer ata liberada, mas,
 * enquanto outro consultor negocia nela, a ata fica reservada (src/lib/reserva-ata.ts).
 */
const dobles = vi.hoisted(() => ({
  vendedorIdLogado: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  expirarOportunidadesVencidas: vi.fn(),
  ataFindUnique: vi.fn(),
  entidadeFindMany: vi.fn(),
  oportunidadeFindMany: vi.fn(),
  pedidoFindMany: vi.fn(),
  pedidoCreateMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: dobles.redirect }));
vi.mock("@/lib/auth", () => ({
  vendedorIdLogado: dobles.vendedorIdLogado,
  criarSessaoVendedor: vi.fn(),
  encerrarSessaoVendedor: vi.fn(),
  gastarTempoDeHash: vi.fn(),
  hashSenha: vi.fn(),
  verificarSenha: vi.fn(),
}));
vi.mock("@/lib/limite-tentativas", () => ({
  checarBloqueioLogin: vi.fn(),
  registrarFalhaLogin: vi.fn(),
  registrarSucessoLogin: vi.fn(),
}));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("@/lib/senha", () => ({ validarSenhaNova: vi.fn() }));
vi.mock("@/lib/negociacao-expiracao", () => ({ expirarOportunidadesVencidas: dobles.expirarOportunidadesVencidas }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ata: { findUnique: dobles.ataFindUnique },
    entidadeAlvo: { findMany: dobles.entidadeFindMany },
    oportunidadeVenda: { findMany: dobles.oportunidadeFindMany },
    pedidoNegociacao: { findMany: dobles.pedidoFindMany, createMany: dobles.pedidoCreateMany },
  },
}));

import { solicitarMunicipios, type EstadoSolicitarMunicipios } from "./actions";

const ESTADO_INICIAL: EstadoSolicitarMunicipios = {};

function formulario(ids: string[]): FormData {
  const f = new FormData();
  for (const id of ids) f.append("entidadeAlvoId", id);
  return f;
}

function pedir(ids: string[] = ["ent1", "ent2"], ataId = "ata1") {
  return solicitarMunicipios(ataId, ESTADO_INICIAL, formulario(ids));
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.vendedorIdLogado.mockResolvedValue("vend1");
  // Como o redirect de verdade: interrompe a action lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.ataFindUnique.mockResolvedValue({ id: "ata1", status: "APROVADA", contrato: { id: "c1" } });
  dobles.entidadeFindMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.map((id) => ({ id })),
  );
  dobles.oportunidadeFindMany.mockResolvedValue([]);
  dobles.pedidoFindMany.mockResolvedValue([]);
  dobles.pedidoCreateMany.mockResolvedValue({ count: 2 });
});

describe("pedido de municípios", () => {
  it("pede os municípios: grava os pedidos e volta para o painel", async () => {
    await expect(pedir(["ent1", "ent2"])).rejects.toThrow("NEXT_REDIRECT:/vendedor");

    expect(dobles.expirarOportunidadesVencidas).toHaveBeenCalledTimes(1);
    expect(dobles.pedidoCreateMany).toHaveBeenCalledTimes(1);
    expect(dobles.pedidoCreateMany).toHaveBeenCalledWith({
      data: [
        { ataId: "ata1", vendedorId: "vend1", entidadeAlvoId: "ent1" },
        { ataId: "ata1", vendedorId: "vend1", entidadeAlvoId: "ent2" },
      ],
    });
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/vendedor");
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/negociacoes");
  });

  it("as regras de antes continuam valendo: ata não liberada", async () => {
    dobles.ataFindUnique.mockResolvedValue({ id: "ata1", status: "PENDENTE", contrato: null });
    const estado = await pedir();

    expect(estado.erro).toBe("Esta ata não está liberada para negociação.");
    expect(dobles.pedidoCreateMany).not.toHaveBeenCalled();
  });

  it("as regras de antes continuam valendo: nenhum município escolhido", async () => {
    const estado = await pedir([]);

    expect(estado.erro).toBe("Escolha ao menos um município.");
    expect(dobles.pedidoCreateMany).not.toHaveBeenCalled();
  });
});

describe("ata reservada: qualquer consultor pega, mas só um negocia por vez", () => {
  const daqui = (dias: number) => new Date(Date.now() + dias * 24 * 3600 * 1000);

  it("outro consultor negociando na ata: o pedido é recusado, com o dia até quando, e nada é gravado", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      { entidadeAlvoId: "entX", vendedorId: "outro", estagio: "em_negociacao", expiradaEm: null, prazoEm: daqui(6) },
    ]);
    const estado = await pedir(["ent1"]);

    expect(estado.erro).toMatch(/Esta ata está reservada até \d{2}\/\d{2}\/\d{4}: outro consultor está negociando nela/);
    expect(dobles.pedidoCreateMany).not.toHaveBeenCalled();
    expect(dobles.redirect).not.toHaveBeenCalled();
  });

  it("a reserva vale para a ata inteira, também para município que ninguém pegou", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      { entidadeAlvoId: "entX", vendedorId: "outro", estagio: "a_contatar", expiradaEm: null, prazoEm: daqui(3) },
    ]);
    const estado = await pedir(["entLivre"]);
    expect(estado.erro).toContain("reservada");
    expect(dobles.pedidoCreateMany).not.toHaveBeenCalled();
  });

  it("quando a negociação do outro termina (aderiu ou recusado), a ata volta a ficar disponível", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      { entidadeAlvoId: "entX", vendedorId: "outro", estagio: "aderiu", expiradaEm: null, prazoEm: null },
    ]);
    await expect(pedir(["ent1"])).rejects.toThrow("NEXT_REDIRECT:/vendedor");
    expect(dobles.pedidoCreateMany).toHaveBeenCalledTimes(1);
  });

  it("prazo do outro já vencido (a expiração é preguiçosa): a ata está livre", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      { entidadeAlvoId: "entX", vendedorId: "outro", estagio: "em_negociacao", expiradaEm: null, prazoEm: daqui(-2) },
    ]);
    await expect(pedir(["ent1"])).rejects.toThrow("NEXT_REDIRECT:/vendedor");
  });

  it("quem já negocia na ata pede mais municípios; o que já é dele fica de fora do pedido", async () => {
    dobles.oportunidadeFindMany.mockResolvedValue([
      { entidadeAlvoId: "ent1", vendedorId: "vend1", estagio: "em_negociacao", expiradaEm: null, prazoEm: daqui(6) },
    ]);
    await expect(pedir(["ent1", "ent2"])).rejects.toThrow("NEXT_REDIRECT:/vendedor");
    expect(dobles.pedidoCreateMany).toHaveBeenCalledWith({ data: [{ ataId: "ata1", vendedorId: "vend1", entidadeAlvoId: "ent2" }] });
  });

  it("a consulta olha a ata inteira, e não só os municípios pedidos", async () => {
    await pedir(["ent1"]).catch(() => undefined);
    expect(dobles.oportunidadeFindMany.mock.calls[0][0].where).toEqual({ ataId: "ata1", expiradaEm: null });
  });
});

describe("sessão", () => {
  it("sem sessão do vendedor, vai para o login sem tocar no banco", async () => {
    dobles.vendedorIdLogado.mockResolvedValue(null);
    await expect(pedir()).rejects.toThrow("NEXT_REDIRECT:/vendedor/login");

    expect(dobles.expirarOportunidadesVencidas).not.toHaveBeenCalled();
    expect(dobles.pedidoCreateMany).not.toHaveBeenCalled();
  });
});
