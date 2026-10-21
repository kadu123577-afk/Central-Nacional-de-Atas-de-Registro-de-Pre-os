import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As três ações da instrução por adesão, testadas sem banco: a sessão, a
 * auditoria, o cache do Next e a camada de banco (instrucao-adesao-db) são
 * trocados por dublês. A camada de banco do teste é uma memória pequena que
 * imita o contrato real (inclusive "não declara por cima" e "não apaga em
 * Aderiu"), então o que se confere é a regra das actions: quem pode chamar,
 * o que é gravado, o que vai para a auditoria e o que é recusado.
 */
const dobles = vi.hoisted(() => ({
  vendedorIdLogado: vi.fn(),
  adminIdLogado: vi.fn(),
  registrarAuditoria: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  buscarOportunidadeDaInstrucao: vi.fn(),
  lerInstrucao: vi.fn(),
  atualizarItens: vi.fn(),
  registrarDeclaracao: vi.fn(),
  apagarDeclaracao: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: dobles.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: dobles.redirect }));
vi.mock("@/lib/auth", () => ({
  vendedorIdLogado: dobles.vendedorIdLogado,
  adminIdLogado: dobles.adminIdLogado,
}));
vi.mock("@/lib/auditoria", () => ({ registrarAuditoria: dobles.registrarAuditoria }));
vi.mock("@/lib/instrucao-adesao-db", () => ({
  buscarOportunidadeDaInstrucao: dobles.buscarOportunidadeDaInstrucao,
  lerInstrucao: dobles.lerInstrucao,
  atualizarItens: dobles.atualizarItens,
  registrarDeclaracao: dobles.registrarDeclaracao,
  apagarDeclaracao: dobles.apagarDeclaracao,
}));

import { ITENS_INSTRUCAO, VERSAO_DECLARACAO, type MapaInstrucao } from "@/lib/instrucao-adesao";
import type { OportunidadeDaInstrucao, RegistroInstrucao } from "@/lib/instrucao-adesao-db";
import { declararConformidade, marcarItemInstrucao, revogarDeclaracao } from "./instrucao-actions";

const OPORTUNIDADE_ID = "cm1oportunidade0000000001";
const JUSTIFICATIVA = "O parecer jurídico chega na próxima semana e o órgão já o pediu.";

/** A "memória" da camada de banco: o que o teste mexe para montar cada situação. */
const memoria: { oportunidade: OportunidadeDaInstrucao | null; registro: RegistroInstrucao | null } = {
  oportunidade: null,
  registro: null,
};

function formulario(campos: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) f.set(nome, valor);
  return f;
}

function registro(extra: Partial<RegistroInstrucao> = {}): RegistroInstrucao {
  return {
    oportunidadeId: OPORTUNIDADE_ID,
    itens: {},
    declaracaoEm: null,
    declaracaoPorTipo: null,
    declaracaoPorId: null,
    declaracaoVersao: null,
    declaracaoExcecao: null,
    atualizadoEm: new Date("2026-10-20T10:00:00Z"),
    ...extra,
  };
}

function mapaObrigatoriosFeitos(): MapaInstrucao {
  const mapa: MapaInstrucao = {};
  for (const i of ITENS_INSTRUCAO.filter((x) => x.obrigatorio)) mapa[i.chave] = { feito: true, em: "2026-10-10" };
  return mapa;
}

function nenhumaEscrita() {
  expect(dobles.atualizarItens).not.toHaveBeenCalled();
  expect(dobles.registrarDeclaracao).not.toHaveBeenCalled();
  expect(dobles.apagarDeclaracao).not.toHaveBeenCalled();
  expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
  expect(dobles.revalidatePath).not.toHaveBeenCalled();
}

const marcar = (chave: string, campos: Record<string, string | File>) =>
  marcarItemInstrucao(OPORTUNIDADE_ID, chave, {}, formulario(campos));
const declarar = (campos: Record<string, string | File> = {}) =>
  declararConformidade(OPORTUNIDADE_ID, {}, formulario(campos));
const revogar = () => revogarDeclaracao(OPORTUNIDADE_ID);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T15:00:00Z"));

  memoria.oportunidade = {
    id: OPORTUNIDADE_ID,
    ataId: "ata1",
    vendedorId: "vend1",
    estagio: "em_negociacao",
    expiradaEm: null,
  };
  memoria.registro = null;

  dobles.vendedorIdLogado.mockResolvedValue("vend1");
  dobles.adminIdLogado.mockResolvedValue(null);
  // Como o redirect de verdade: interrompe a action lançando.
  dobles.redirect.mockImplementation((destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  });

  dobles.buscarOportunidadeDaInstrucao.mockImplementation(async (id: string) =>
    memoria.oportunidade && memoria.oportunidade.id === id ? memoria.oportunidade : null,
  );
  dobles.lerInstrucao.mockImplementation(async () => memoria.registro);
  dobles.atualizarItens.mockImplementation(
    async (_id: string, aplicar: (atual: MapaInstrucao) => MapaInstrucao) => {
      const antes = memoria.registro?.itens ?? {};
      const depois = aplicar(antes);
      const mudou = JSON.stringify(antes) !== JSON.stringify(depois);
      if (mudou) memoria.registro = { ...(memoria.registro ?? registro()), itens: depois };
      return { ok: true, antes, depois, mudou, declaracaoEm: memoria.registro?.declaracaoEm ?? null };
    },
  );
  dobles.registrarDeclaracao.mockImplementation(
    async (_id: string, _lidoEm: Date | null, dados: Partial<RegistroInstrucao>) => {
      if (memoria.registro?.declaracaoEm) return false;
      memoria.registro = { ...(memoria.registro ?? registro()), ...dados };
      return true;
    },
  );
  dobles.apagarDeclaracao.mockImplementation(async (_id: string, estagioQueImpede: string) => {
    if (!memoria.registro?.declaracaoEm || memoria.oportunidade?.estagio === estagioQueImpede) return false;
    memoria.registro = {
      ...memoria.registro,
      declaracaoEm: null,
      declaracaoPorTipo: null,
      declaracaoPorId: null,
      declaracaoVersao: null,
      declaracaoExcecao: null,
    };
    return true;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("quem pode chamar", () => {
  it.each([
    ["marcarItemInstrucao", () => marcar("dfd", { feito: "true" })],
    ["declararConformidade", () => declarar({ justificativaExcecao: JUSTIFICATIVA })],
    ["revogarDeclaracao", () => revogar()],
  ])("%s sem sessão manda para o login e não toca em nada", async (_nome, chamar) => {
    dobles.vendedorIdLogado.mockResolvedValue(null);
    dobles.adminIdLogado.mockResolvedValue(null);
    await expect(chamar()).rejects.toThrow("NEXT_REDIRECT:/vendedor/login");
    expect(dobles.buscarOportunidadeDaInstrucao).not.toHaveBeenCalled();
    expect(dobles.lerInstrucao).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it("confere a sessão antes de ler o formulário", async () => {
    dobles.vendedorIdLogado.mockResolvedValue(null);
    const semFormData = {} as FormData;
    await expect(marcarItemInstrucao(OPORTUNIDADE_ID, "dfd", {}, semFormData)).rejects.toThrow(
      "NEXT_REDIRECT:/vendedor/login",
    );
  });

  it.each([
    ["marcarItemInstrucao", () => marcar("dfd", { feito: "true" })],
    ["declararConformidade", () => declarar({ justificativaExcecao: JUSTIFICATIVA })],
    ["revogarDeclaracao", () => revogar()],
  ])("%s: vendedor de outra oportunidade é recusado e nada é gravado", async (_nome, chamar) => {
    memoria.registro = registro({ declaracaoEm: new Date("2026-10-15T10:00:00Z") });
    dobles.vendedorIdLogado.mockResolvedValue("outro-vendedor");
    await expect(chamar()).resolves.toEqual({ erro: "Oportunidade não encontrada." });
    nenhumaEscrita();
  });

  it("oportunidade que não existe tem a mesma resposta (não revela o que existe)", async () => {
    memoria.oportunidade = null;
    await expect(marcar("dfd", { feito: "true" })).resolves.toEqual({ erro: "Oportunidade não encontrada." });
    nenhumaEscrita();
  });

  it.each([
    ["espaço no meio", "x y"],
    ["aspas e ponto e vírgula", "x'; DROP TABLE instrucoes_adesao;--"],
    ["comprido demais", "a".repeat(65)],
    ["vazio", ""],
  ])("id da oportunidade (%s) é recusado antes de consultar o banco", async (_descricao, id) => {
    await expect(marcarItemInstrucao(id, "dfd", {}, formulario({ feito: "true" }))).resolves.toEqual({
      erro: "Oportunidade não encontrada.",
    });
    expect(dobles.buscarOportunidadeDaInstrucao).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it.each([
    ["marcarItemInstrucao", () => marcar("dfd", { feito: "true" })],
    ["declararConformidade", () => declarar({ justificativaExcecao: JUSTIFICATIVA })],
    ["revogarDeclaracao", () => revogar()],
  ])("%s: oportunidade expirada não aceita nada", async (_nome, chamar) => {
    memoria.oportunidade = { ...memoria.oportunidade!, expiradaEm: new Date("2026-10-19T00:00:00Z") };
    memoria.registro = registro({ declaracaoEm: new Date("2026-10-15T10:00:00Z") });
    const resposta = await chamar();
    expect(resposta.erro).toMatch(/prazo deste município venceu/);
    nenhumaEscrita();
  });

  it("o admin logado pode mexer em oportunidade de qualquer vendedor, e o ator na auditoria é o admin", async () => {
    dobles.vendedorIdLogado.mockResolvedValue(null);
    dobles.adminIdLogado.mockResolvedValue("adm1");
    await expect(marcar("dfd", { feito: "true" })).resolves.toEqual({ ok: true });
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "admin:adm1",
      acao: "admin.marcarItemInstrucao",
      alvo: OPORTUNIDADE_ID,
      detalhe: "item dfd: marcado",
    });
  });

  it("vendedor dono com sessão de admin aberta também no navegador age como vendedor", async () => {
    dobles.adminIdLogado.mockResolvedValue("adm1");
    await marcar("dfd", { feito: "true" });
    expect(dobles.registrarAuditoria.mock.calls[0][0].ator).toBe("vendedor:vend1");
  });

  it("vendedor de outro vendedor com admin também logado age como admin, não como vendedor", async () => {
    dobles.vendedorIdLogado.mockResolvedValue("outro-vendedor");
    dobles.adminIdLogado.mockResolvedValue("adm1");
    await marcar("dfd", { feito: "true" });
    expect(dobles.registrarAuditoria.mock.calls[0][0].ator).toBe("admin:adm1");
  });
});

describe("marcarItemInstrucao", () => {
  it("marca o item com o dia de hoje, audita como vendedor e atualiza as telas", async () => {
    await expect(marcar("dfd", { feito: "true" })).resolves.toEqual({ ok: true });

    expect(memoria.registro?.itens).toEqual({ dfd: { feito: true, em: "2026-10-21" } });
    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(dobles.registrarAuditoria).toHaveBeenCalledWith({
      ator: "vendedor:vend1",
      acao: "vendedor.marcarItemInstrucao",
      alvo: OPORTUNIDADE_ID,
      detalhe: "item dfd: marcado",
    });
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/vendedor/atas/ata1");
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/pipeline");
  });

  it("o dia gravado é o de Brasília: 22h30 de 21/10 lá já é 22/10 em UTC", async () => {
    vi.setSystemTime(new Date("2026-10-22T01:30:00Z"));
    await marcar("dfd", { feito: "true" });
    expect(memoria.registro?.itens.dfd?.em).toBe("2026-10-21");
  });

  it("marcar de novo não troca a data original e não audita (nada mudou)", async () => {
    memoria.registro = registro({ itens: { dfd: { feito: true, em: "2026-10-05" } } });
    await expect(marcar("dfd", { feito: "true" })).resolves.toEqual({ ok: true });
    expect(memoria.registro?.itens.dfd?.em).toBe("2026-10-05");
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
  });

  it("desmarca e a data some", async () => {
    memoria.registro = registro({ itens: { dfd: { feito: true, em: "2026-10-05" } } });
    await marcar("dfd", { feito: "false" });
    expect(memoria.registro?.itens.dfd).toEqual({ feito: false });
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe("item dfd: desmarcado");
  });

  it("sem o campo nota, a nota que já existia é mantida", async () => {
    memoria.registro = registro({ itens: { dfd: { feito: false, nota: "pedido por e-mail" } } });
    await marcar("dfd", { feito: "true" });
    expect(memoria.registro?.itens.dfd).toEqual({ feito: true, em: "2026-10-21", nota: "pedido por e-mail" });
  });

  it("com o campo nota, troca; com o campo vazio, apaga; e a auditoria diz o que houve", async () => {
    await marcar("dfd", { feito: "false", nota: "  enviado ao jurídico  " });
    expect(memoria.registro?.itens.dfd).toEqual({ feito: false, nota: "enviado ao jurídico" });
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe("item dfd: nota alterada");

    await marcar("dfd", { feito: "false", nota: "" });
    expect(memoria.registro?.itens.dfd).toEqual({ feito: false });
    expect(dobles.registrarAuditoria.mock.calls[1][0].detalhe).toBe("item dfd: nota apagada");
  });

  it("a nota longa é cortada em 300 caracteres (limite do módulo de regras)", async () => {
    await marcar("dfd", { feito: "false", nota: "n".repeat(500) });
    expect(memoria.registro?.itens.dfd?.nota).toHaveLength(300);
  });

  it("arquivo no campo nota é ignorado como se não tivesse vindo", async () => {
    memoria.registro = registro({ itens: { dfd: { feito: false, nota: "antiga" } } });
    await marcar("dfd", { feito: "true", nota: new File(["x"], "x.txt") });
    expect(memoria.registro?.itens.dfd?.nota).toBe("antiga");
  });

  it.each([
    ["inexistente", "nao_existe"],
    ["vazia", ""],
    ["com maiúscula diferente", "DFD"],
    ["propriedade herdada do objeto", "__proto__"],
    ["constructor", "constructor"],
  ])("chave %s é recusada sem tocar no banco", async (_descricao, chave) => {
    await expect(marcar(chave, { feito: "true" })).resolves.toEqual({ erro: "Item da instrução inválido." });
    expect(dobles.buscarOportunidadeDaInstrucao).not.toHaveBeenCalled();
    nenhumaEscrita();
  });

  it.each([
    ["ausente", {}],
    ["texto livre", { feito: "sim" }],
    ["verdadeiro com maiúscula", { feito: "True" }],
    ["arquivo", { feito: new File(["true"], "feito.txt") }],
  ])("marcação %s é recusada", async (_descricao, campos) => {
    await expect(marcar("dfd", campos)).resolves.toEqual({ erro: "Não foi possível ler a marcação do item." });
    nenhumaEscrita();
  });

  it("desmarcar item obrigatório com a declaração já registrada MANTÉM a declaração e audita isso", async () => {
    const declaracaoEm = new Date("2026-10-15T10:00:00Z");
    memoria.registro = registro({
      itens: mapaObrigatoriosFeitos(),
      declaracaoEm,
      declaracaoPorTipo: "vendedor",
      declaracaoPorId: "vend1",
      declaracaoVersao: VERSAO_DECLARACAO,
    });
    await expect(marcar("parecer_juridico", { feito: "false" })).resolves.toEqual({ ok: true });

    expect(memoria.registro?.itens.parecer_juridico).toEqual({ feito: false });
    expect(memoria.registro?.declaracaoEm).toBe(declaracaoEm);
    expect(dobles.apagarDeclaracao).not.toHaveBeenCalled();
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe(
      "item parecer_juridico: desmarcado; declaração mantida",
    );
  });

  it("desmarcar item opcional com declaração registrada não fala em declaração", async () => {
    memoria.registro = registro({
      itens: { ...mapaObrigatoriosFeitos(), publicacao_pncp: { feito: true, em: "2026-10-12" } },
      declaracaoEm: new Date("2026-10-15T10:00:00Z"),
    });
    await marcar("publicacao_pncp", { feito: "false" });
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe("item publicacao_pncp: desmarcado");
  });

  it("depois de Aderiu ainda dá para marcar os itens de formalização", async () => {
    memoria.oportunidade = { ...memoria.oportunidade!, estagio: "aderiu" };
    await expect(marcar("publicacao_pncp", { feito: "true" })).resolves.toEqual({ ok: true });
    expect(memoria.registro?.itens.publicacao_pncp?.feito).toBe(true);
  });

  it("gravação que perdeu a corrida (conflito) devolve erro e não audita", async () => {
    dobles.atualizarItens.mockResolvedValue({ ok: false, motivo: "conflito" });
    const resposta = await marcar("dfd", { feito: "true" });
    expect(resposta.erro).toMatch(/alterada por outra pessoa/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("declararConformidade", () => {
  it("sem nenhum item e sem justificativa é recusado, e a mensagem diz o que falta", async () => {
    const resposta = await declarar();
    expect(resposta.ok).toBeUndefined();
    expect(resposta.erro).toMatch(/Faltam itens obrigatórios da instrução/);
    expect(resposta.erro).toMatch(/explique o motivo em pelo menos 20 caracteres/);
    nenhumaEscrita();
  });

  it("justificativa curta ou só de espaços é recusada", async () => {
    const curta = await declarar({ justificativaExcecao: "falta pouco" });
    expect(curta.erro).toMatch(/curta demais/);
    const espacos = await declarar({ justificativaExcecao: " ".repeat(40) });
    expect(espacos.erro).toMatch(/Faltam itens obrigatórios/);
    nenhumaEscrita();
  });

  it("justificativa longa demais é recusada", async () => {
    const resposta = await declarar({ justificativaExcecao: "a".repeat(1001) });
    expect(resposta.erro).toMatch(/passou de 1000 caracteres/);
    nenhumaEscrita();
  });

  it("com justificativa de 20+ caracteres passa e grava a exceção (já limpa), quem e a versão", async () => {
    const resposta = await declarar({ justificativaExcecao: `  O parecer jurídico   chega na\n próxima semana, ok?  ` });
    expect(resposta).toEqual({ ok: true });

    expect(dobles.registrarDeclaracao).toHaveBeenCalledTimes(1);
    const [id, lidoEm, dados] = dobles.registrarDeclaracao.mock.calls[0];
    expect(id).toBe(OPORTUNIDADE_ID);
    expect(lidoEm).toBeNull(); // a linha ainda não existia
    expect(dados).toEqual({
      declaracaoEm: new Date("2026-10-21T15:00:00Z"),
      declaracaoPorTipo: "vendedor",
      declaracaoPorId: "vend1",
      declaracaoVersao: VERSAO_DECLARACAO,
      declaracaoExcecao: "O parecer jurídico chega na próxima semana, ok?",
    });
  });

  it("a auditoria guarda a justificativa (revogar apaga a da linha) e o ator", async () => {
    await declarar({ justificativaExcecao: JUSTIFICATIVA });
    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    const evento = dobles.registrarAuditoria.mock.calls[0][0];
    expect(evento.ator).toBe("vendedor:vend1");
    expect(evento.acao).toBe("vendedor.declararConformidade");
    expect(evento.alvo).toBe(OPORTUNIDADE_ID);
    expect(evento.detalhe).toContain(`versão ${VERSAO_DECLARACAO}`);
    expect(evento.detalhe).toContain("com exceção");
    expect(evento.detalhe).toContain("9 obrigatório(s) pendente(s)");
    expect(evento.detalhe).toContain(JUSTIFICATIVA);
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/vendedor/atas/ata1");
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/pipeline");
  });

  it("justificativa longa não é cortada na auditoria: o texto inteiro vai em partes numeradas de até 500 caracteres", async () => {
    // A trilha (registrarAuditoria) corta o detalhe em 500; a justificativa pode ter 1000 e é o que sobra depois de revogar.
    const longa = "Motivo do pedido de exceção. ".repeat(33).trim(); // 956 caracteres
    expect(longa.length).toBeGreaterThan(900);
    await declarar({ justificativaExcecao: longa });

    const eventos = dobles.registrarAuditoria.mock.calls.map((c) => c[0]);
    expect(eventos.length).toBeGreaterThan(1);
    for (const e of eventos) {
      expect(e.detalhe.length).toBeLessThanOrEqual(500);
      expect(e.acao).toBe("vendedor.declararConformidade");
      expect(e.alvo).toBe(OPORTUNIDADE_ID);
    }
    expect(eventos[0].detalhe).toMatch(new RegExp(`^\\(1/${eventos.length}\\) versão `));
    const remontado = eventos.map((e) => e.detalhe.replace(/^\(\d+\/\d+\) /, "")).join("");
    expect(remontado).toContain(`justificativa: ${longa}`);
  });

  it("com todos os obrigatórios feitos declara sem justificativa e NÃO grava exceção", async () => {
    memoria.registro = registro({ itens: mapaObrigatoriosFeitos() });
    await expect(declarar()).resolves.toEqual({ ok: true });
    const [, lidoEm, dados] = dobles.registrarDeclaracao.mock.calls[0];
    expect(lidoEm).toEqual(new Date("2026-10-20T10:00:00Z")); // confere a versão lida dos itens
    expect(dados.declaracaoExcecao).toBeNull();
    expect(dobles.registrarAuditoria.mock.calls[0][0].detalhe).toBe(
      `versão ${VERSAO_DECLARACAO}; todos os itens obrigatórios feitos`,
    );
  });

  it("com tudo feito, justificativa enviada de propósito é ignorada (não vira exceção)", async () => {
    memoria.registro = registro({ itens: mapaObrigatoriosFeitos() });
    await declarar({ justificativaExcecao: JUSTIFICATIVA });
    expect(dobles.registrarDeclaracao.mock.calls[0][2].declaracaoExcecao).toBeNull();
  });

  it("item opcional não conta: só os de formalização feitos não liberam", async () => {
    memoria.registro = registro({
      itens: { publicacao_pncp: { feito: true, em: "2026-10-12" }, contrato_ou_empenho: { feito: true, em: "2026-10-12" } },
    });
    const resposta = await declarar();
    expect(resposta.erro).toMatch(/Faltam itens obrigatórios/);
    nenhumaEscrita();
  });

  it("não declara de novo por cima: pede para revogar antes e não escreve", async () => {
    memoria.registro = registro({
      itens: mapaObrigatoriosFeitos(),
      declaracaoEm: new Date("2026-10-15T10:00:00Z"),
      declaracaoPorTipo: "vendedor",
      declaracaoPorId: "vend1",
      declaracaoVersao: VERSAO_DECLARACAO,
    });
    const resposta = await declarar({ justificativaExcecao: JUSTIFICATIVA });
    expect(resposta.erro).toMatch(/revogue a atual/);
    nenhumaEscrita();
    expect(memoria.registro?.declaracaoEm).toEqual(new Date("2026-10-15T10:00:00Z"));
  });

  it("duas declarações ao mesmo tempo: a que perde recebe erro e não audita", async () => {
    dobles.registrarDeclaracao.mockResolvedValue(false);
    const resposta = await declarar({ justificativaExcecao: JUSTIFICATIVA });
    expect(resposta.erro).toMatch(/alterada por outra pessoa/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
  });

  it("o admin que declara fica registrado como admin", async () => {
    dobles.vendedorIdLogado.mockResolvedValue(null);
    dobles.adminIdLogado.mockResolvedValue("adm1");
    await declarar({ justificativaExcecao: JUSTIFICATIVA });
    const dados = dobles.registrarDeclaracao.mock.calls[0][2];
    expect(dados.declaracaoPorTipo).toBe("admin");
    expect(dados.declaracaoPorId).toBe("adm1");
    expect(dobles.registrarAuditoria.mock.calls[0][0].ator).toBe("admin:adm1");
  });

  it("arquivo no campo da justificativa conta como justificativa ausente", async () => {
    const resposta = await declarar({ justificativaExcecao: new File([JUSTIFICATIVA], "j.txt") });
    expect(resposta.erro).toMatch(/Faltam itens obrigatórios/);
    nenhumaEscrita();
  });
});

describe("revogarDeclaracao", () => {
  const declarada = () =>
    registro({
      itens: mapaObrigatoriosFeitos(),
      declaracaoEm: new Date("2026-10-15T10:00:00Z"),
      declaracaoPorTipo: "vendedor",
      declaracaoPorId: "vend1",
      declaracaoVersao: VERSAO_DECLARACAO,
      declaracaoExcecao: "Parecer a caminho, órgão já pediu.",
    });

  it("apaga data, quem, versão e exceção, audita o que foi revogado e atualiza as telas", async () => {
    memoria.registro = declarada();
    await expect(revogar()).resolves.toEqual({ ok: true });

    expect(dobles.apagarDeclaracao).toHaveBeenCalledWith(OPORTUNIDADE_ID, "aderiu");
    expect(memoria.registro?.declaracaoEm).toBeNull();
    expect(memoria.registro?.declaracaoExcecao).toBeNull();
    // Os itens do checklist continuam como estavam.
    expect(memoria.registro?.itens).toEqual(mapaObrigatoriosFeitos());

    expect(dobles.registrarAuditoria).toHaveBeenCalledTimes(1);
    const evento = dobles.registrarAuditoria.mock.calls[0][0];
    expect(evento.ator).toBe("vendedor:vend1");
    expect(evento.acao).toBe("vendedor.revogarDeclaracao");
    expect(evento.alvo).toBe(OPORTUNIDADE_ID);
    expect(evento.detalhe).toContain("2026-10-15T10:00:00.000Z");
    expect(evento.detalhe).toContain("vendedor:vend1");
    expect(evento.detalhe).toContain("Parecer a caminho, órgão já pediu.");
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/vendedor/atas/ata1");
    expect(dobles.revalidatePath).toHaveBeenCalledWith("/admin/pipeline");
  });

  it("a exceção longa da declaração revogada também vai inteira para a auditoria, em partes", async () => {
    const longa = "Motivo do pedido de exceção. ".repeat(33).trim();
    memoria.registro = { ...declarada(), declaracaoExcecao: longa };
    await revogar();
    const eventos = dobles.registrarAuditoria.mock.calls.map((c) => c[0]);
    expect(eventos.length).toBeGreaterThan(1);
    for (const e of eventos) expect(e.detalhe.length).toBeLessThanOrEqual(500);
    expect(eventos.map((e) => e.detalhe.replace(/^\(\d+\/\d+\) /, "")).join("")).toContain(longa);
  });

  it("depois de Aderiu é recusada e a declaração fica", async () => {
    memoria.registro = declarada();
    memoria.oportunidade = { ...memoria.oportunidade!, estagio: "aderiu" };
    const resposta = await revogar();
    expect(resposta.erro).toMatch(/Aderiu/);
    nenhumaEscrita();
    expect(memoria.registro?.declaracaoEm).not.toBeNull();
  });

  it("se o município virou Aderiu no meio do caminho, o banco recusa e nada é auditado", async () => {
    memoria.registro = declarada();
    dobles.apagarDeclaracao.mockResolvedValue(false);
    const resposta = await revogar();
    expect(resposta.erro).toMatch(/já foi revogada ou o município passou para Aderiu/);
    expect(dobles.registrarAuditoria).not.toHaveBeenCalled();
    expect(dobles.revalidatePath).not.toHaveBeenCalled();
  });

  it("sem declaração registrada não há o que revogar", async () => {
    memoria.registro = registro({ itens: mapaObrigatoriosFeitos() });
    const resposta = await revogar();
    expect(resposta.erro).toBe("Não há declaração registrada para revogar.");
    nenhumaEscrita();
  });

  it("sem nenhuma instrução gravada também não há o que revogar", async () => {
    memoria.registro = null;
    const resposta = await revogar();
    expect(resposta.erro).toBe("Não há declaração registrada para revogar.");
    nenhumaEscrita();
  });

  it("o admin pode revogar a declaração de qualquer vendedor", async () => {
    memoria.registro = declarada();
    dobles.vendedorIdLogado.mockResolvedValue(null);
    dobles.adminIdLogado.mockResolvedValue("adm1");
    await expect(revogar()).resolves.toEqual({ ok: true });
    expect(dobles.registrarAuditoria.mock.calls[0][0].ator).toBe("admin:adm1");
    expect(dobles.registrarAuditoria.mock.calls[0][0].acao).toBe("admin.revogarDeclaracao");
  });

  it("revogar e declarar de novo funciona (declaração nova, sem a exceção antiga)", async () => {
    memoria.registro = declarada();
    await revogar();
    await expect(declarar()).resolves.toEqual({ ok: true });
    expect(memoria.registro?.declaracaoEm).toEqual(new Date("2026-10-21T15:00:00Z"));
    expect(memoria.registro?.declaracaoExcecao).toBeNull();
  });
});
