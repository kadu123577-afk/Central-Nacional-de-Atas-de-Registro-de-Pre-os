import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Trava do estágio "aderiu" (Projeto RNA, etapa 3), testada sem banco: o
 * Prisma, a sessão e o restante do que a action importa são trocados por
 * dublês. O que se confere é a regra de negócio: ENTRAR em "aderiu" exige a
 * declaração de conformidade já gravada em InstrucaoAdesao, a trava vem
 * depois das checagens de dono e de prazo e antes de qualquer escrita, e nada
 * que venha no formulário a contorna.
 */
const dobles = vi.hoisted(() => ({
  vendedorIdLogado: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  oportunidadeFindUnique: vi.fn(),
  oportunidadeUpdate: vi.fn(),
  instrucaoFindUnique: vi.fn(),
  contratoFindUnique: vi.fn(),
  liquidacaoCount: vi.fn(),
  pontoFocalFindFirst: vi.fn(),
  interacaoCreate: vi.fn(),
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
vi.mock("@/lib/negociacao-expiracao", () => ({ expirarOportunidadesVencidas: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    oportunidadeVenda: { findUnique: dobles.oportunidadeFindUnique, update: dobles.oportunidadeUpdate },
    instrucaoAdesao: { findUnique: dobles.instrucaoFindUnique },
    contratoIntermediacao: { findUnique: dobles.contratoFindUnique },
    liquidacao: { count: dobles.liquidacaoCount },
    pontoFocal: { findFirst: dobles.pontoFocalFindFirst },
    interacaoPontoFocal: { create: dobles.interacaoCreate },
  },
}));

import { moverEstagioOportunidade, type EstadoMoverEstagio } from "./actions";

const ERRO_TRAVA = "Antes de marcar como Aderiu, registre a declaração de conformidade na aba Instrução do município.";
const ESTADO_INICIAL: EstadoMoverEstagio = {};

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

function oportunidade(sobrescrever: Record<string, unknown> = {}) {
  return {
    id: "op1",
    vendedorId: "vend1",
    ataId: "ata1",
    entidadeAlvoId: "ent1",
    estagio: "em_negociacao",
    expiradaEm: null,
    percentualComissao: null,
    ...sobrescrever,
  };
}

function mover(campos: Record<string, string>, id = "op1") {
  return moverEstagioOportunidade(id, ESTADO_INICIAL, formulario(campos));
}

/** Quando a trava (ou qualquer outra checagem) recusa, nada pode ter sido lido a mais nem gravado. */
function nadaGravado() {
  expect(dobles.oportunidadeUpdate).not.toHaveBeenCalled();
  expect(dobles.interacaoCreate).not.toHaveBeenCalled();
  expect(dobles.revalidatePath).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.vendedorIdLogado.mockResolvedValue("vend1");
  // Como o redirect de verdade: interrompe a action lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });
  dobles.oportunidadeFindUnique.mockResolvedValue(oportunidade());
  dobles.oportunidadeUpdate.mockResolvedValue({});
  dobles.instrucaoFindUnique.mockResolvedValue(null);
  dobles.contratoFindUnique.mockResolvedValue({ percentualComissao: { toString: () => "0.05" } });
  dobles.liquidacaoCount.mockResolvedValue(0);
  dobles.pontoFocalFindFirst.mockResolvedValue({ id: "pf1" });
  dobles.interacaoCreate.mockResolvedValue({});
});

describe("entrar em Aderiu sem a declaração de conformidade", () => {
  it("recusa quando a oportunidade ainda não tem instrução nenhuma", async () => {
    dobles.instrucaoFindUnique.mockResolvedValue(null);
    const estado = await mover({ estagio: "aderiu", valorAderido: "1000", observacoes: "fechado" });

    expect(estado.erro).toBe(ERRO_TRAVA);
    expect(estado.ok).toBeUndefined();
    nadaGravado();
  });

  it("recusa quando existe instrução, mas a declaração ainda não foi registrada", async () => {
    dobles.instrucaoFindUnique.mockResolvedValue({ declaracaoEm: null });
    const estado = await mover({ estagio: "aderiu", valorAderido: "1000" });

    expect(estado.erro).toBe(ERRO_TRAVA);
    nadaGravado();
  });

  it("recusa quando a data da declaração é inválida", async () => {
    dobles.instrucaoFindUnique.mockResolvedValue({ declaracaoEm: new Date("não é data") });
    const estado = await mover({ estagio: "aderiu", valorAderido: "1000" });

    expect(estado.erro).toBe(ERRO_TRAVA);
    nadaGravado();
  });

  it("consulta a instrução da própria oportunidade, lendo só a data da declaração", async () => {
    await mover({ estagio: "aderiu", valorAderido: "1000" });

    expect(dobles.instrucaoFindUnique).toHaveBeenCalledTimes(1);
    expect(dobles.instrucaoFindUnique).toHaveBeenCalledWith({
      where: { oportunidadeId: "op1" },
      select: { declaracaoEm: true },
    });
  });

  it("devolve o que a pessoa digitou, no mesmo formato dos outros erros", async () => {
    const estado = await mover({ estagio: "aderiu", valorAderido: "1234,50", observacoes: "  conversa boa  " });

    expect(estado.erro).toBe(ERRO_TRAVA);
    expect(estado.valores).toEqual({
      valorAderido: "1234,50",
      observacoes: "  conversa boa  ",
      nonce: expect.any(String),
    });
  });

  it("recusa antes de cobrar o valor aderido: o bloqueio principal aparece primeiro", async () => {
    const estado = await mover({ estagio: "aderiu" });
    expect(estado.erro).toBe(ERRO_TRAVA);
  });

  it("recusa antes de procurar o contrato de intermediação e antes de qualquer escrita", async () => {
    await mover({ estagio: "aderiu", valorAderido: "1000" });

    expect(dobles.contratoFindUnique).not.toHaveBeenCalled();
    expect(dobles.liquidacaoCount).not.toHaveBeenCalled();
    expect(dobles.pontoFocalFindFirst).not.toHaveBeenCalled();
    nadaGravado();
  });

  it("campos extras no formulário não substituem a declaração", async () => {
    const estado = await mover({
      estagio: "aderiu",
      valorAderido: "1000",
      declaracaoEm: new Date().toISOString(),
      declaracao: "on",
      conformidade: "true",
      confirmo: "sim",
      instrucaoCompleta: "1",
    });

    expect(estado.erro).toBe(ERRO_TRAVA);
    nadaGravado();
  });

  it("recusa de novo em tentativas seguidas, enquanto a declaração não existir", async () => {
    const primeira = await mover({ estagio: "aderiu", valorAderido: "1000" });
    const segunda = await mover({ estagio: "aderiu", valorAderido: "1000" });

    expect(primeira.erro).toBe(ERRO_TRAVA);
    expect(segunda.erro).toBe(ERRO_TRAVA);
    nadaGravado();
  });

  it.each(["a_contatar", "em_negociacao", "recusado"])("vale também quando o estágio atual é %s", async (atual) => {
    dobles.oportunidadeFindUnique.mockResolvedValue(oportunidade({ estagio: atual }));
    const estado = await mover({ estagio: "aderiu", valorAderido: "1000" });

    expect(estado.erro).toBe(ERRO_TRAVA);
    nadaGravado();
  });
});

describe("entrar em Aderiu com a declaração registrada", () => {
  beforeEach(() => {
    dobles.instrucaoFindUnique.mockResolvedValue({ declaracaoEm: new Date("2026-10-21T15:00:00Z") });
  });

  it("permite e grava o estágio, o valor aderido e a comissão do contrato", async () => {
    const estado = await mover({ estagio: "aderiu", valorAderido: "2500,75", observacoes: " pedido assinado " });

    expect(estado).toEqual({ ok: true });
    expect(dobles.oportunidadeUpdate).toHaveBeenCalledTimes(1);
    const { where, data } = dobles.oportunidadeUpdate.mock.calls[0][0];
    expect(where).toEqual({ id: "op1" });
    expect(data).toMatchObject({
      estagio: "aderiu",
      observacoes: "pedido assinado",
      prazoEm: null,
      valorAderido: "2500.75",
      percentualComissao: "0.05",
    });
    expect(dobles.interacaoCreate).toHaveBeenCalledWith({
      data: { pontoFocalId: "pf1", ataId: "ata1", resultado: "Converteu", observacao: "pedido assinado" },
    });
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/vendedor/atas/ata1");
  });

  it("aceita a data da declaração vinda como texto ISO", async () => {
    dobles.instrucaoFindUnique.mockResolvedValue({ declaracaoEm: "2026-10-21T15:00:00.000Z" });
    const estado = await mover({ estagio: "aderiu", valorAderido: "100" });

    expect(estado.ok).toBe(true);
    expect(dobles.oportunidadeUpdate).toHaveBeenCalledTimes(1);
  });

  it("com a declaração feita, as demais exigências continuam valendo: valor aderido", async () => {
    const estado = await mover({ estagio: "aderiu", valorAderido: "0" });

    expect(estado.erro).toBe("Informe um valor aderido maior que zero.");
    nadaGravado();
  });

  it("com a declaração feita, as demais exigências continuam valendo: contrato de intermediação", async () => {
    dobles.contratoFindUnique.mockResolvedValue(null);
    const estado = await mover({ estagio: "aderiu", valorAderido: "1000" });

    expect(estado.erro).toMatch(/contrato de intermediação/);
    nadaGravado();
  });
});

describe("oportunidade que já está em Aderiu", () => {
  beforeEach(() => {
    dobles.oportunidadeFindUnique.mockResolvedValue(
      oportunidade({ estagio: "aderiu", percentualComissao: { toString: () => "0.03" } }),
    );
  });

  it("corrigir o valor aderido não exige a declaração de novo nem consulta a instrução", async () => {
    dobles.instrucaoFindUnique.mockResolvedValue(null);
    const estado = await mover({ estagio: "aderiu", valorAderido: "9000" });

    expect(estado).toEqual({ ok: true });
    expect(dobles.instrucaoFindUnique).not.toHaveBeenCalled();
    const { data } = dobles.oportunidadeUpdate.mock.calls[0][0];
    // Mantém a comissão copiada na adesão, sem reler o contrato.
    expect(data).toMatchObject({ estagio: "aderiu", valorAderido: "9000", percentualComissao: "0.03" });
    expect(dobles.contratoFindUnique).not.toHaveBeenCalled();
  });

  it("sair de Aderiu também não passa pela trava", async () => {
    const estado = await mover({ estagio: "recusado" });

    expect(estado.ok).toBe(true);
    expect(dobles.instrucaoFindUnique).not.toHaveBeenCalled();
    const { data } = dobles.oportunidadeUpdate.mock.calls[0][0];
    expect(data).toMatchObject({ estagio: "recusado", valorAderido: null, percentualComissao: null });
  });
});

describe("outros estágios não são afetados", () => {
  it.each([
    ["a_contatar", "Oferecida"],
    ["em_negociacao", "Em conversa"],
    ["recusado", "Recusou"],
  ])("mover para %s funciona sem declaração e sem consultar a instrução", async (novo, resultado) => {
    dobles.instrucaoFindUnique.mockResolvedValue(null);
    dobles.oportunidadeFindUnique.mockResolvedValue(oportunidade({ estagio: "a_contatar" }));
    const estado = await mover({ estagio: novo, observacoes: "anotação" });

    expect(estado).toEqual({ ok: true });
    expect(dobles.instrucaoFindUnique).not.toHaveBeenCalled();
    expect(dobles.oportunidadeUpdate).toHaveBeenCalledTimes(1);
    expect(dobles.oportunidadeUpdate.mock.calls[0][0].data.estagio).toBe(novo);
    expect(dobles.interacaoCreate.mock.calls[0][0].data.resultado).toBe(resultado);
  });
});

describe("a trava vem depois das checagens que já existiam", () => {
  it("sem sessão do vendedor, vai para o login sem ler nada", async () => {
    dobles.vendedorIdLogado.mockResolvedValue(null);
    await expect(mover({ estagio: "aderiu", valorAderido: "1000" })).rejects.toThrow("NEXT_REDIRECT:/vendedor/login");

    expect(dobles.oportunidadeFindUnique).not.toHaveBeenCalled();
    expect(dobles.instrucaoFindUnique).not.toHaveBeenCalled();
    nadaGravado();
  });

  it("estágio inválido é recusado antes de consultar o banco", async () => {
    const estado = await mover({ estagio: "ganhou" });

    expect(estado.erro).toBe("Estágio inválido.");
    expect(dobles.oportunidadeFindUnique).not.toHaveBeenCalled();
    expect(dobles.instrucaoFindUnique).not.toHaveBeenCalled();
    nadaGravado();
  });

  it("oportunidade inexistente: mensagem de sempre, sem consultar a instrução", async () => {
    dobles.oportunidadeFindUnique.mockResolvedValue(null);
    const estado = await mover({ estagio: "aderiu", valorAderido: "1000" });

    expect(estado.erro).toBe("Oportunidade não encontrada.");
    expect(dobles.instrucaoFindUnique).not.toHaveBeenCalled();
    nadaGravado();
  });

  it("oportunidade de outro vendedor: mensagem de sempre, sem consultar a instrução", async () => {
    dobles.oportunidadeFindUnique.mockResolvedValue(oportunidade({ vendedorId: "outro" }));
    // Mesmo com declaração pronta, quem não é dono não passa — e a instrução nem é lida.
    dobles.instrucaoFindUnique.mockResolvedValue({ declaracaoEm: new Date() });
    const estado = await mover({ estagio: "aderiu", valorAderido: "1000" });

    expect(estado.erro).toBe("Oportunidade não encontrada.");
    expect(dobles.instrucaoFindUnique).not.toHaveBeenCalled();
    nadaGravado();
  });

  it("prazo vencido: mensagem de sempre, sem consultar a instrução", async () => {
    dobles.oportunidadeFindUnique.mockResolvedValue(oportunidade({ expiradaEm: new Date("2026-10-01") }));
    const estado = await mover({ estagio: "aderiu", valorAderido: "1000" });

    expect(estado.erro).toBe("O prazo deste município venceu. Faça um novo pedido de negociação.");
    expect(dobles.instrucaoFindUnique).not.toHaveBeenCalled();
    nadaGravado();
  });
});
