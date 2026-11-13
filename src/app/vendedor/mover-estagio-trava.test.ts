import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Travas de moverEstagioOportunidade, testadas sem banco: o Prisma, a sessão
 * e o restante do que a action importa são trocados por dublês.
 *
 * 1) Estágio "aderiu" (2026-11-14, atividade 13 do workflow): a adesão é
 *    registrada pela equipe da Central, com a quantidade de cada item
 *    (src/app/admin/adesoes). O consultor não entra em "aderiu" nem corrige o
 *    valor, e quem está em "aderiu" com quantidades registradas não sai por aqui.
 * 2) Credenciamento (etapa 6): levar a oportunidade para "em negociação" ou
 *    "aderiu" só vale para consultor credenciado; vem antes de qualquer leitura
 *    da oportunidade e de qualquer escrita. Os demais estágios seguem livres.
 *    Por padrão, aqui, o consultor está credenciado: os testes da trava do
 *    registro continuam isolados dela.
 */
const dobles = vi.hoisted(() => ({
  vendedorIdLogado: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  oportunidadeFindUnique: vi.fn(),
  oportunidadeUpdateMany: vi.fn(),
  adesaoItemCount: vi.fn(),
  liquidacaoCount: vi.fn(),
  pontoFocalFindFirst: vi.fn(),
  interacaoCreate: vi.fn(),
  credenciamentoFindUnique: vi.fn(),
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
vi.mock("@/lib/feriados-db", () => ({ carregarFeriadosExtras: async () => new Set<string>() }));
vi.mock("@/lib/feriados-db", () => ({ carregarFeriadosExtras: async () => new Set<string>() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    oportunidadeVenda: { findUnique: dobles.oportunidadeFindUnique, updateMany: dobles.oportunidadeUpdateMany },
    adesaoItem: { count: dobles.adesaoItemCount },
    liquidacao: { count: dobles.liquidacaoCount },
    pontoFocal: { findFirst: dobles.pontoFocalFindFirst },
    interacaoPontoFocal: { create: dobles.interacaoCreate },
    credenciamentoConsultor: { findUnique: dobles.credenciamentoFindUnique },
  },
}));

import { mensagemBloqueio } from "@/lib/credenciamento";
import { moverEstagioOportunidade, type EstadoMoverEstagio } from "./actions";

const ERRO_PELA_EQUIPE =
  "A adesão é registrada pela equipe da Central de Atas, com a quantidade de cada item. Quando o município decidir aderir, avise a equipe para registrar.";
const ERRO_COM_ITENS =
  "Esta adesão foi registrada com as quantidades dos itens e não pode ser desfeita por aqui. Peça ao jurídico da Central.";
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

/** Quando uma trava (ou qualquer outra checagem) recusa, nada pode ter sido gravado. */
function nadaGravado() {
  expect(dobles.oportunidadeUpdateMany).not.toHaveBeenCalled();
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
  dobles.oportunidadeUpdateMany.mockResolvedValue({ count: 1 });
  dobles.adesaoItemCount.mockResolvedValue(0);
  dobles.liquidacaoCount.mockResolvedValue(0);
  dobles.pontoFocalFindFirst.mockResolvedValue({ id: "pf1" });
  dobles.interacaoCreate.mockResolvedValue({});
  dobles.credenciamentoFindUnique.mockResolvedValue({ status: "credenciado" });
});

describe("o consultor não marca Aderiu: o registro é da equipe", () => {
  it.each(["a_contatar", "em_negociacao", "recusado", "aderiu"])(
    "recusa levar para aderiu quando o estágio atual é %s",
    async (atual) => {
      dobles.oportunidadeFindUnique.mockResolvedValue(oportunidade({ estagio: atual }));
      const estado = await mover({ estagio: "aderiu", valorAderido: "1000", observacoes: "fechado" });

      expect(estado.ok).toBeUndefined();
      expect(estado.erro).toBe(ERRO_PELA_EQUIPE);
      nadaGravado();
    },
  );

  it("valor aderido, declaração e outros campos no formulário não contornam a regra", async () => {
    const estado = await mover({
      estagio: "aderiu",
      valorAderido: "2500,75",
      declaracaoEm: new Date().toISOString(),
      declaracao: "on",
      conformidade: "true",
      instrucaoCompleta: "1",
    });

    expect(estado.erro).toBe(ERRO_PELA_EQUIPE);
    nadaGravado();
  });

  it("devolve o que a pessoa digitou, no mesmo formato dos outros erros", async () => {
    const estado = await mover({ estagio: "aderiu", observacoes: "  conversa boa  " });

    expect(estado.erro).toBe(ERRO_PELA_EQUIPE);
    expect(estado.valores).toEqual({ observacoes: "  conversa boa  ", nonce: expect.any(String) });
  });

  it("recusa de novo em tentativas seguidas", async () => {
    const primeira = await mover({ estagio: "aderiu" });
    const segunda = await mover({ estagio: "aderiu" });

    expect(primeira.erro).toBe(ERRO_PELA_EQUIPE);
    expect(segunda.erro).toBe(ERRO_PELA_EQUIPE);
    nadaGravado();
  });
});

describe("oportunidade que já está em Aderiu", () => {
  beforeEach(() => {
    dobles.oportunidadeFindUnique.mockResolvedValue(
      oportunidade({ estagio: "aderiu", percentualComissao: { toString: () => "0.03" } }),
    );
  });

  it("com as quantidades dos itens registradas, não sai de Aderiu por aqui", async () => {
    dobles.adesaoItemCount.mockResolvedValue(3);
    const estado = await mover({ estagio: "recusado" });

    expect(estado.erro).toBe(ERRO_COM_ITENS);
    expect(dobles.adesaoItemCount).toHaveBeenCalledWith({ where: { oportunidadeId: "op1" } });
    expect(dobles.liquidacaoCount).not.toHaveBeenCalled();
    nadaGravado();
  });

  it("adesão antiga, sem itens registrados, ainda pode sair e perde os dados de recebível", async () => {
    const estado = await mover({ estagio: "recusado" });

    expect(estado.ok).toBe(true);
    const { where, data } = dobles.oportunidadeUpdateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "op1" });
    expect(data).toMatchObject({ estagio: "recusado", valorAderido: null, percentualComissao: null });
  });

  it("adesão antiga com liquidação registrada não sai", async () => {
    dobles.liquidacaoCount.mockResolvedValue(2);
    const estado = await mover({ estagio: "recusado" });

    expect(estado.erro).toContain("2 liquidação(ões)");
    nadaGravado();
  });
});

describe("outros estágios não são afetados", () => {
  it.each([
    ["a_contatar", "Oferecida"],
    ["em_negociacao", "Em conversa"],
    ["recusado", "Recusou"],
  ])("mover para %s funciona e não consulta os itens da adesão", async (novo, resultado) => {
    dobles.oportunidadeFindUnique.mockResolvedValue(oportunidade({ estagio: "a_contatar" }));
    const estado = await mover({ estagio: novo, observacoes: "anotação" });

    expect(estado).toEqual({ ok: true });
    expect(dobles.adesaoItemCount).not.toHaveBeenCalled();
    expect(dobles.oportunidadeUpdateMany).toHaveBeenCalledTimes(1);
    expect(dobles.oportunidadeUpdateMany.mock.calls[0][0].where).toEqual({ id: "op1" });
    expect(dobles.oportunidadeUpdateMany.mock.calls[0][0].data.estagio).toBe(novo);
    expect(dobles.interacaoCreate.mock.calls[0][0].data.resultado).toBe(resultado);
  });

  it("zero linhas gravadas (card sumiu) devolve erro em vez de fingir sucesso", async () => {
    dobles.oportunidadeUpdateMany.mockResolvedValue({ count: 0 });
    const estado = await mover({ estagio: "em_negociacao" });

    expect(estado.erro).toBe("Oportunidade não encontrada.");
    expect(dobles.interacaoCreate).not.toHaveBeenCalled();
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("a regra do registro vem depois das checagens que já existiam", () => {
  it("sem sessão do vendedor, vai para o login sem ler nada", async () => {
    dobles.vendedorIdLogado.mockResolvedValue(null);
    await expect(mover({ estagio: "aderiu" })).rejects.toThrow("NEXT_REDIRECT:/vendedor/login");

    expect(dobles.oportunidadeFindUnique).not.toHaveBeenCalled();
    nadaGravado();
  });

  it("estágio inválido é recusado antes de consultar o banco", async () => {
    const estado = await mover({ estagio: "ganhou" });

    expect(estado.erro).toBe("Estágio inválido.");
    expect(dobles.oportunidadeFindUnique).not.toHaveBeenCalled();
    nadaGravado();
  });

  it("oportunidade inexistente: mensagem de sempre", async () => {
    dobles.oportunidadeFindUnique.mockResolvedValue(null);
    const estado = await mover({ estagio: "aderiu" });

    expect(estado.erro).toBe("Oportunidade não encontrada.");
    nadaGravado();
  });

  it("oportunidade de outro vendedor: mensagem de sempre", async () => {
    dobles.oportunidadeFindUnique.mockResolvedValue(oportunidade({ vendedorId: "outro" }));
    const estado = await mover({ estagio: "aderiu" });

    expect(estado.erro).toBe("Oportunidade não encontrada.");
    nadaGravado();
  });

  it("prazo vencido: mensagem de sempre", async () => {
    dobles.oportunidadeFindUnique.mockResolvedValue(oportunidade({ expiradaEm: new Date("2026-10-01") }));
    const estado = await mover({ estagio: "aderiu" });

    expect(estado.erro).toBe("O prazo deste município venceu. Faça um novo pedido de negociação.");
    nadaGravado();
  });
});

describe("trava do credenciamento: levar para em negociação ou aderiu", () => {
  const CAMINHO = "/vendedor/credenciamento";

  /** Sem credenciamento nada é lido da oportunidade nem gravado. */
  function recusadoSemTocarNaOportunidade() {
    expect(dobles.oportunidadeFindUnique).not.toHaveBeenCalled();
    expect(dobles.adesaoItemCount).not.toHaveBeenCalled();
    expect(dobles.liquidacaoCount).not.toHaveBeenCalled();
    nadaGravado();
  }

  it.each(["pendente", "aceito", "suspenso"])("consultor %s não leva para em negociação", async (status) => {
    dobles.credenciamentoFindUnique.mockResolvedValue({ status });
    const estado = await mover({ estagio: "em_negociacao", observacoes: "conversa" });

    expect(estado.ok).toBeUndefined();
    expect(estado.erro).toContain(mensagemBloqueio(status));
    expect(estado.erro).toContain(CAMINHO);
    recusadoSemTocarNaOportunidade();
  });

  it.each(["pendente", "aceito", "suspenso"])("consultor %s que tenta aderiu recebe o aviso de credenciamento", async (status) => {
    dobles.credenciamentoFindUnique.mockResolvedValue({ status });
    const estado = await mover({ estagio: "aderiu" });

    expect(estado.erro).toContain(mensagemBloqueio(status));
    expect(estado.erro).toContain(CAMINHO);
    recusadoSemTocarNaOportunidade();
  });

  it("sem registro de credenciamento conta como pendente e recusa", async () => {
    dobles.credenciamentoFindUnique.mockResolvedValue(null);
    const estado = await mover({ estagio: "em_negociacao" });

    expect(estado.erro).toContain(mensagemBloqueio("pendente"));
    expect(estado.erro).toContain(CAMINHO);
    recusadoSemTocarNaOportunidade();
  });

  it("status desconhecido no banco também recusa", async () => {
    dobles.credenciamentoFindUnique.mockResolvedValue({ status: "qualquer" });
    const estado = await mover({ estagio: "em_negociacao" });

    expect(estado.erro).toContain(mensagemBloqueio("pendente"));
    recusadoSemTocarNaOportunidade();
  });

  it("devolve o que a pessoa digitou, no mesmo formato dos outros erros", async () => {
    dobles.credenciamentoFindUnique.mockResolvedValue({ status: "aceito" });
    const estado = await mover({ estagio: "em_negociacao", observacoes: "  fechado  " });

    expect(estado.valores).toEqual({ observacoes: "  fechado  ", nonce: expect.any(String) });
  });

  it("consulta o credenciamento do consultor logado, não de um id vindo do formulário", async () => {
    await mover({ estagio: "em_negociacao", vendedorId: "outro", vendedor: "outro" });

    expect(dobles.credenciamentoFindUnique).toHaveBeenCalledTimes(1);
    expect(dobles.credenciamentoFindUnique.mock.calls[0][0].where).toEqual({ vendedorId: "vend1" });
  });

  it("campos extras no formulário não substituem o credenciamento", async () => {
    dobles.credenciamentoFindUnique.mockResolvedValue({ status: "pendente" });
    const estado = await mover({
      estagio: "em_negociacao",
      status: "credenciado",
      credenciado: "true",
      credenciamento: "credenciado",
      integridade: "on",
    });

    expect(estado.erro).toContain(mensagemBloqueio("pendente"));
    recusadoSemTocarNaOportunidade();
  });

  it("vale também para quem já está em negociação: a trava olha o destino", async () => {
    dobles.credenciamentoFindUnique.mockResolvedValue({ status: "suspenso" });
    dobles.oportunidadeFindUnique.mockResolvedValue(oportunidade({ estagio: "em_negociacao" }));
    const estado = await mover({ estagio: "em_negociacao", observacoes: "nova anotação" });

    expect(estado.erro).toContain(mensagemBloqueio("suspenso"));
    recusadoSemTocarNaOportunidade();
  });

  it("falha do banco ao conferir o credenciamento não libera: a action para e nada é gravado", async () => {
    dobles.credenciamentoFindUnique.mockRejectedValue(new Error("banco indisponível"));

    await expect(mover({ estagio: "em_negociacao" })).rejects.toThrow("banco indisponível");
    recusadoSemTocarNaOportunidade();
  });

  it("consultor credenciado leva para em negociação", async () => {
    dobles.oportunidadeFindUnique.mockResolvedValue(oportunidade({ estagio: "a_contatar" }));
    const estado = await mover({ estagio: "em_negociacao", observacoes: "reunião marcada" });

    expect(estado).toEqual({ ok: true });
    expect(dobles.oportunidadeUpdateMany).toHaveBeenCalledTimes(1);
    expect(dobles.oportunidadeUpdateMany.mock.calls[0][0].data.estagio).toBe("em_negociacao");
  });

  it("consultor credenciado também não leva para aderiu: a regra do registro vale", async () => {
    const estado = await mover({ estagio: "aderiu" });

    expect(estado.erro).toBe(ERRO_PELA_EQUIPE);
    nadaGravado();
  });
});

describe("movimentos livres não dependem do credenciamento", () => {
  it.each([
    ["pendente", "a_contatar"],
    ["aceito", "a_contatar"],
    ["suspenso", "a_contatar"],
    ["pendente", "recusado"],
    ["aceito", "recusado"],
    ["suspenso", "recusado"],
  ])("consultor %s move para %s sem consultar o credenciamento", async (status, destino) => {
    dobles.credenciamentoFindUnique.mockResolvedValue({ status });
    dobles.oportunidadeFindUnique.mockResolvedValue(oportunidade({ estagio: "em_negociacao" }));
    const estado = await mover({ estagio: destino, observacoes: "anotação" });

    expect(estado).toEqual({ ok: true });
    expect(dobles.credenciamentoFindUnique).not.toHaveBeenCalled();
    expect(dobles.oportunidadeUpdateMany).toHaveBeenCalledTimes(1);
    expect(dobles.oportunidadeUpdateMany.mock.calls[0][0].data.estagio).toBe(destino);
  });

  it("sem sessão do vendedor, vai para o login sem consultar o credenciamento", async () => {
    dobles.vendedorIdLogado.mockResolvedValue(null);
    await expect(mover({ estagio: "em_negociacao" })).rejects.toThrow("NEXT_REDIRECT:/vendedor/login");

    expect(dobles.credenciamentoFindUnique).not.toHaveBeenCalled();
    nadaGravado();
  });

  it("estágio inválido é recusado antes de consultar o credenciamento", async () => {
    const estado = await mover({ estagio: "ganhou" });

    expect(estado.erro).toBe("Estágio inválido.");
    expect(dobles.credenciamentoFindUnique).not.toHaveBeenCalled();
  });
});
