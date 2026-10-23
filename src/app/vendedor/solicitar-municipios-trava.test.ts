import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Trava do credenciamento em solicitarMunicipios (Projeto RNA, etapa 6),
 * testada sem banco: o Prisma, a sessão e o restante do que a action importa
 * são trocados por dublês. Pedir município é tomar trabalho novo: só consultor
 * credenciado pede. A trava vem logo depois da sessão, antes de ler o
 * formulário, de expirar oportunidades (que escreve) e de qualquer outra
 * consulta, e só depende do que está no banco.
 */
const dobles = vi.hoisted(() => ({
  vendedorIdLogado: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  expirarOportunidadesVencidas: vi.fn(),
  credenciamentoFindUnique: vi.fn(),
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
    credenciamentoConsultor: { findUnique: dobles.credenciamentoFindUnique },
    ata: { findUnique: dobles.ataFindUnique },
    entidadeAlvo: { findMany: dobles.entidadeFindMany },
    oportunidadeVenda: { findMany: dobles.oportunidadeFindMany },
    pedidoNegociacao: { findMany: dobles.pedidoFindMany, createMany: dobles.pedidoCreateMany },
  },
}));

import { mensagemBloqueio } from "@/lib/credenciamento";
import { solicitarMunicipios, type EstadoSolicitarMunicipios } from "./actions";

const ESTADO_INICIAL: EstadoSolicitarMunicipios = {};
const CAMINHO = "/vendedor/credenciamento";

function formulario(ids: string[]): FormData {
  const f = new FormData();
  for (const id of ids) f.append("entidadeAlvoId", id);
  return f;
}

function pedir(ids: string[] = ["ent1", "ent2"], ataId = "ata1") {
  return solicitarMunicipios(ataId, ESTADO_INICIAL, formulario(ids));
}

/** Quando a trava recusa, nada além da consulta do credenciamento pode ter acontecido. */
function nadaFeito() {
  expect(dobles.expirarOportunidadesVencidas).not.toHaveBeenCalled();
  expect(dobles.ataFindUnique).not.toHaveBeenCalled();
  expect(dobles.entidadeFindMany).not.toHaveBeenCalled();
  expect(dobles.oportunidadeFindMany).not.toHaveBeenCalled();
  expect(dobles.pedidoFindMany).not.toHaveBeenCalled();
  expect(dobles.pedidoCreateMany).not.toHaveBeenCalled();
  expect(dobles.revalidatePath).not.toHaveBeenCalled();
  expect(dobles.redirect).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.vendedorIdLogado.mockResolvedValue("vend1");
  // Como o redirect de verdade: interrompe a action lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.credenciamentoFindUnique.mockResolvedValue({ status: "credenciado" });
  dobles.ataFindUnique.mockResolvedValue({ id: "ata1", status: "APROVADA", contrato: { id: "c1" } });
  dobles.entidadeFindMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.map((id) => ({ id })),
  );
  dobles.oportunidadeFindMany.mockResolvedValue([]);
  dobles.pedidoFindMany.mockResolvedValue([]);
  dobles.pedidoCreateMany.mockResolvedValue({ count: 2 });
});

describe("consultor que não está credenciado não pede municípios", () => {
  it.each(["pendente", "aceito", "suspenso"])("%s: recusa com a mensagem do status e o caminho do credenciamento", async (status) => {
    dobles.credenciamentoFindUnique.mockResolvedValue({ status });
    const estado = await pedir();

    expect(estado.erro).toContain(mensagemBloqueio(status));
    expect(estado.erro).toContain(CAMINHO);
    nadaFeito();
  });

  it("sem registro de credenciamento conta como pendente", async () => {
    dobles.credenciamentoFindUnique.mockResolvedValue(null);
    const estado = await pedir();

    expect(estado.erro).toContain(mensagemBloqueio("pendente"));
    expect(estado.erro).toContain(CAMINHO);
    nadaFeito();
  });

  it("status desconhecido no banco também recusa", async () => {
    dobles.credenciamentoFindUnique.mockResolvedValue({ status: "qualquer" });
    const estado = await pedir();

    expect(estado.erro).toContain(mensagemBloqueio("pendente"));
    nadaFeito();
  });

  it("recusa antes de ler o formulário: nem uma requisição montada à mão passa", async () => {
    dobles.credenciamentoFindUnique.mockResolvedValue({ status: "suspenso" });
    const estado = await solicitarMunicipios("ata1", ESTADO_INICIAL, {} as FormData);

    expect(estado.erro).toContain(mensagemBloqueio("suspenso"));
    nadaFeito();
  });

  it("consulta o credenciamento do consultor logado, não de um id vindo do formulário", async () => {
    const f = formulario(["ent1"]);
    f.set("vendedorId", "outro");
    await solicitarMunicipios("ata1", ESTADO_INICIAL, f).catch(() => undefined);

    expect(dobles.credenciamentoFindUnique).toHaveBeenCalledTimes(1);
    expect(dobles.credenciamentoFindUnique.mock.calls[0][0].where).toEqual({ vendedorId: "vend1" });
  });

  it("campos extras no formulário não substituem o credenciamento", async () => {
    dobles.credenciamentoFindUnique.mockResolvedValue({ status: "aceito" });
    const f = formulario(["ent1"]);
    f.set("status", "credenciado");
    f.set("credenciado", "true");
    const estado = await solicitarMunicipios("ata1", ESTADO_INICIAL, f);

    expect(estado.erro).toContain(mensagemBloqueio("aceito"));
    nadaFeito();
  });

  it("recusa de novo em tentativas seguidas, enquanto não estiver credenciado", async () => {
    dobles.credenciamentoFindUnique.mockResolvedValue({ status: "pendente" });
    const primeira = await pedir();
    const segunda = await pedir(["ent3"]);

    expect(primeira.erro).toContain(mensagemBloqueio("pendente"));
    expect(segunda.erro).toContain(mensagemBloqueio("pendente"));
    nadaFeito();
  });

  it("falha do banco ao conferir o credenciamento não libera: a action para e nada é gravado", async () => {
    dobles.credenciamentoFindUnique.mockRejectedValue(new Error("banco indisponível"));

    await expect(pedir()).rejects.toThrow("banco indisponível");
    nadaFeito();
  });
});

describe("consultor credenciado", () => {
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

describe("sessão", () => {
  it("sem sessão do vendedor, vai para o login sem consultar o credenciamento", async () => {
    dobles.vendedorIdLogado.mockResolvedValue(null);
    await expect(pedir()).rejects.toThrow("NEXT_REDIRECT:/vendedor/login");

    expect(dobles.credenciamentoFindUnique).not.toHaveBeenCalled();
    expect(dobles.expirarOportunidadesVencidas).not.toHaveBeenCalled();
    expect(dobles.pedidoCreateMany).not.toHaveBeenCalled();
  });
});
