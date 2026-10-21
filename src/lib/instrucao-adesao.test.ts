import { describe, expect, it } from "vitest";
import {
  GRUPOS_INSTRUCAO,
  ITENS_INSTRUCAO,
  MAX_JUSTIFICATIVA,
  MAX_NOTA,
  MIN_JUSTIFICATIVA,
  TEXTO_DECLARACAO,
  VERSAO_DECLARACAO,
  condicaoParaAderiu,
  itemInstrucaoValido,
  marcarItem,
  normalizarJustificativa,
  normalizarMapa,
  podeDeclararConformidade,
  resumirInstrucao,
  textoDeclaracao,
  validarDeclaracao,
  type MapaInstrucao,
} from "./instrucao-adesao";

const HOJE = "2026-10-21";

const obrigatorios = ITENS_INSTRUCAO.filter((i) => i.obrigatorio);

/** Mapa com todos os obrigatórios feitos (e nenhum de formalização). */
function mapaObrigatoriosFeitos(): MapaInstrucao {
  const mapa: MapaInstrucao = {};
  for (const i of obrigatorios) mapa[i.chave] = { feito: true, em: "2026-10-01" };
  return mapa;
}

function congelarFundo<T>(valor: T): T {
  if (valor && typeof valor === "object") {
    for (const v of Object.values(valor)) congelarFundo(v);
    Object.freeze(valor);
  }
  return valor;
}

/** Texto de n caracteres que não é só espaço. */
const texto = (n: number) => "a".repeat(n);

describe("ITENS_INSTRUCAO", () => {
  it("tem os 11 itens na ordem combinada", () => {
    expect(ITENS_INSTRUCAO.map((i) => i.chave)).toEqual([
      "dfd",
      "justificativa_vantagem",
      "pesquisa_precos",
      "dotacao",
      "parecer_juridico",
      "autorizacao",
      "anuencia_gerenciador",
      "aceite_fornecedor",
      "limites_conferidos",
      "publicacao_pncp",
      "contrato_ou_empenho",
    ]);
  });

  it("usa chaves únicas em snake_case e textos preenchidos", () => {
    const chaves = ITENS_INSTRUCAO.map((i) => i.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const i of ITENS_INSTRUCAO) {
      expect(i.chave).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(i.rotulo.trim().length).toBeGreaterThan(0);
      expect(i.ajuda.trim().length).toBeGreaterThan(0);
      // Uma frase só: termina em ponto e não tem outro ponto no meio.
      expect(i.ajuda.endsWith(".")).toBe(true);
      expect(i.ajuda.slice(0, -1)).not.toContain(".");
    }
  });

  it("separa os grupos e marca como obrigatórios só os nove de antes da adesão", () => {
    expect(GRUPOS_INSTRUCAO).toEqual(["Instrução do órgão aderente", "Aceites", "Formalização"]);
    expect(ITENS_INSTRUCAO.filter((i) => i.grupo === "Instrução do órgão aderente")).toHaveLength(6);
    expect(ITENS_INSTRUCAO.filter((i) => i.grupo === "Aceites")).toHaveLength(3);
    const formalizacao = ITENS_INSTRUCAO.filter((i) => i.grupo === "Formalização");
    expect(formalizacao.map((i) => i.chave)).toEqual(["publicacao_pncp", "contrato_ou_empenho"]);
    expect(formalizacao.every((i) => !i.obrigatorio)).toBe(true);
    expect(obrigatorios).toHaveLength(9);
  });
});

describe("itemInstrucaoValido", () => {
  it("aceita as chaves conhecidas", () => {
    for (const i of ITENS_INSTRUCAO) expect(itemInstrucaoValido(i.chave)).toBe(true);
  });

  it("recusa o resto", () => {
    for (const v of ["", "DFD", "dfd ", "toString", "__proto__", "constructor", null, undefined, 1, {}, []]) {
      expect(itemInstrucaoValido(v)).toBe(false);
    }
  });
});

describe("normalizarMapa", () => {
  it("devolve mapa vazio para entrada que não é objeto simples, sem lançar", () => {
    for (const v of [null, undefined, [], [{ dfd: { feito: true } }], 0, 42, NaN, "dfd", "", true, false, () => 1, Symbol("x")]) {
      expect(normalizarMapa(v)).toEqual({});
    }
  });

  it("descarta chaves desconhecidas e valores que não são objeto", () => {
    const r = normalizarMapa({
      dfd: { feito: true, em: "2026-10-01" },
      inventada: { feito: true },
      pesquisa_precos: true,
      dotacao: 1,
      autorizacao: null,
      parecer_juridico: [],
      justificativa_vantagem: "feito",
    });
    expect(r).toEqual({ dfd: { feito: true, em: "2026-10-01" } });
  });

  it("não deixa __proto__ nem constructor passarem", () => {
    const r = normalizarMapa(JSON.parse('{"__proto__":{"feito":true},"constructor":{"feito":true},"dfd":{"feito":true}}'));
    expect(Object.keys(r)).toEqual(["dfd"]);
    expect(({} as Record<string, unknown>).feito).toBeUndefined();
  });

  it("só aceita feito exatamente true", () => {
    const r = normalizarMapa({
      dfd: { feito: "true" },
      dotacao: { feito: 1 },
      autorizacao: { feito: null },
      parecer_juridico: {},
      justificativa_vantagem: { feito: true },
    });
    expect(r.dfd?.feito).toBe(false);
    expect(r.dotacao?.feito).toBe(false);
    expect(r.autorizacao?.feito).toBe(false);
    expect(r.parecer_juridico?.feito).toBe(false);
    expect(r.justificativa_vantagem?.feito).toBe(true);
  });

  it("só mantém data real no formato AAAA-MM-DD, e só em item feito", () => {
    const r = normalizarMapa({
      dfd: { feito: true, em: "2026-10-01" },
      justificativa_vantagem: { feito: true, em: "21/10/2026" },
      pesquisa_precos: { feito: true, em: "2026-02-30" },
      dotacao: { feito: true, em: 20261001 },
      parecer_juridico: { feito: true, em: "2026-13-01" },
      autorizacao: { feito: false, em: "2026-10-01" },
      anuencia_gerenciador: { feito: true, em: "2026-10-01T10:00:00Z" },
    });
    expect(r.dfd).toEqual({ feito: true, em: "2026-10-01" });
    expect(r.justificativa_vantagem).toEqual({ feito: true });
    expect(r.pesquisa_precos).toEqual({ feito: true });
    expect(r.dotacao).toEqual({ feito: true });
    expect(r.parecer_juridico).toEqual({ feito: true });
    expect(r.autorizacao).toEqual({ feito: false });
    // Data com hora não é só-dia: descartada (quem grava usa marcarItem).
    expect(r.anuencia_gerenciador).toEqual({ feito: true });
  });

  it("corta nota gigante em 300 caracteres e ignora nota que não é texto", () => {
    const r = normalizarMapa({
      dfd: { feito: true, nota: "x".repeat(5000) },
      dotacao: { feito: true, nota: 123 },
      autorizacao: { feito: true, nota: { a: 1 } },
      parecer_juridico: { feito: true, nota: "   " },
      justificativa_vantagem: { feito: true, nota: "  ok  " },
    });
    expect(r.dfd?.nota).toHaveLength(MAX_NOTA);
    expect(r.dotacao).toEqual({ feito: true });
    expect(r.autorizacao).toEqual({ feito: true });
    expect(r.parecer_juridico).toEqual({ feito: true });
    expect(r.justificativa_vantagem?.nota).toBe("ok");
  });

  it("tira caractere nulo e metade solta de emoji da nota (o jsonb recusaria)", () => {
    const r = normalizarMapa({
      dfd: { feito: true, nota: "a\u0000b\u0007c\ud83dd" },
      dotacao: { feito: true, nota: "linha 1\nlinha 2\tfim" },
    });
    expect(r.dfd?.nota).toBe("abcd");
    expect(r.dotacao?.nota).toBe("linha 1\nlinha 2\tfim");
  });

  it("não parte um emoji ao cortar a nota", () => {
    const nota = `${"a".repeat(MAX_NOTA - 1)}😀resto`;
    const r = normalizarMapa({ dfd: { feito: true, nota } });
    expect(r.dfd?.nota).toBe("a".repeat(MAX_NOTA - 1));
    expect(JSON.parse(JSON.stringify(r)).dfd.nota).toBe("a".repeat(MAX_NOTA - 1));
  });

  it("não lança com valor hostil e mantém os outros itens", () => {
    const hostil = {
      dfd: {
        get feito(): boolean {
          throw new Error("boom");
        },
      },
      dotacao: { feito: true },
    };
    expect(() => normalizarMapa(hostil)).not.toThrow();
    expect(normalizarMapa(hostil)).toEqual({ dotacao: { feito: true } });
    const proxy = new Proxy(
      {},
      {
        has() {
          throw new Error("boom");
        },
        getOwnPropertyDescriptor() {
          throw new Error("boom");
        },
      },
    );
    expect(() => normalizarMapa(proxy)).not.toThrow();
  });

  it("só lê chaves próprias, nunca as herdadas do protótipo", () => {
    expect(normalizarMapa(Object.create({ dfd: { feito: true } }))).toEqual({});
  });

  it("aceita 29 de fevereiro só em ano bissexto", () => {
    const r = normalizarMapa({
      dfd: { feito: true, em: "2024-02-29" },
      dotacao: { feito: true, em: "2026-02-29" },
    });
    expect(r.dfd?.em).toBe("2024-02-29");
    expect(r.dotacao).toEqual({ feito: true });
  });

  it("não lança nem com proxy revogado, dentro ou fora do mapa", () => {
    const revogado = Proxy.revocable({}, {});
    revogado.revoke();
    expect(() => normalizarMapa(revogado.proxy)).not.toThrow();
    expect(normalizarMapa(revogado.proxy)).toEqual({});
    const dentro = Proxy.revocable({}, {});
    dentro.revoke();
    expect(normalizarMapa({ dfd: dentro.proxy, dotacao: { feito: true } })).toEqual({ dotacao: { feito: true } });
  });

  it("é idempotente e não altera a entrada", () => {
    const entrada = congelarFundo({
      dfd: { feito: true, em: "2026-10-01", nota: "  ok " },
      xis: { feito: true },
    });
    const uma = normalizarMapa(entrada);
    expect(normalizarMapa(uma)).toEqual(uma);
    expect(uma).not.toBe(entrada);
    expect(entrada.xis).toEqual({ feito: true });
  });
});

describe("marcarItem", () => {
  it("marca com a data de hoje", () => {
    expect(marcarItem({}, "dfd", true, HOJE)).toEqual({ dfd: { feito: true, em: HOJE } });
  });

  it("aceita hoje com hora (só o dia conta) e ignora hoje inválido", () => {
    expect(marcarItem({}, "dfd", true, "2026-10-21T15:30:00.000Z").dfd).toEqual({ feito: true, em: HOJE });
    expect(marcarItem({}, "dfd", true, "ontem").dfd).toEqual({ feito: true });
    expect(marcarItem({}, "dfd", true, "").dfd).toEqual({ feito: true });
    for (const hoje of [undefined, null, 20261021, new Date("2026-10-21T00:00:00Z"), {}]) {
      expect(marcarItem({}, "dfd", true, hoje as unknown as string).dfd).toEqual({ feito: true });
    }
  });

  it("só marca como feito com true de verdade", () => {
    for (const feito of ["true", 1, null, undefined, {}]) {
      expect(marcarItem({}, "dfd", feito as unknown as boolean, HOJE).dfd).toEqual({ feito: false });
    }
  });

  it("devolve um mapa novo e não mexe no recebido (mesmo congelado)", () => {
    const original = congelarFundo<MapaInstrucao>({ dfd: { feito: true, em: "2026-10-01", nota: "a" } });
    const novo = marcarItem(original, "dotacao", true, HOJE);
    expect(novo).not.toBe(original);
    expect(novo.dfd).not.toBe(original.dfd);
    expect(original).toEqual({ dfd: { feito: true, em: "2026-10-01", nota: "a" } });
    expect(novo).toEqual({
      dfd: { feito: true, em: "2026-10-01", nota: "a" },
      dotacao: { feito: true, em: HOJE },
    });
  });

  it("marcar de novo item já feito mantém a data original", () => {
    const antes: MapaInstrucao = { dfd: { feito: true, em: "2026-10-01" } };
    expect(marcarItem(antes, "dfd", true, HOJE).dfd?.em).toBe("2026-10-01");
  });

  it("desmarcar apaga a data e mantém a nota", () => {
    const antes: MapaInstrucao = { dfd: { feito: true, em: "2026-10-01", nota: "falta assinar" } };
    expect(marcarItem(antes, "dfd", false, HOJE).dfd).toEqual({ feito: false, nota: "falta assinar" });
  });

  it("nota omitida mantém, texto troca, vazio ou nulo apaga", () => {
    const antes: MapaInstrucao = { dfd: { feito: false, nota: "velha" } };
    expect(marcarItem(antes, "dfd", true, HOJE).dfd?.nota).toBe("velha");
    expect(marcarItem(antes, "dfd", true, HOJE, "nova").dfd?.nota).toBe("nova");
    expect(marcarItem(antes, "dfd", true, HOJE, "").dfd).toEqual({ feito: true, em: HOJE });
    expect(marcarItem(antes, "dfd", true, HOJE, null).dfd).toEqual({ feito: true, em: HOJE });
    expect(marcarItem(antes, "dfd", true, HOJE, "y".repeat(900)).dfd?.nota).toHaveLength(MAX_NOTA);
  });

  it("chave desconhecida não muda nada (e não lança)", () => {
    const antes: MapaInstrucao = { dfd: { feito: true, em: "2026-10-01" } };
    const r = marcarItem(antes, "inventada", true, HOJE);
    expect(r).toEqual(antes);
    expect(r).not.toBe(antes);
    expect(marcarItem(antes, "__proto__", true, HOJE)).toEqual(antes);
  });

  it("aceita mapa sujo vindo do banco", () => {
    const sujo = { dfd: { feito: "sim" }, xis: 1 } as unknown as MapaInstrucao;
    expect(marcarItem(sujo, "dotacao", true, HOJE)).toEqual({
      dfd: { feito: false },
      dotacao: { feito: true, em: HOJE },
    });
    expect(marcarItem(null as unknown as MapaInstrucao, "dfd", true, HOJE)).toEqual({ dfd: { feito: true, em: HOJE } });
  });
});

describe("resumirInstrucao", () => {
  it("sem nenhum item feito", () => {
    const r = resumirInstrucao({});
    expect(r).toMatchObject({
      total: 11,
      feitos: 0,
      obrigatoriosTotal: 9,
      obrigatoriosFeitos: 0,
      completo: false,
      percentual: 0,
    });
    expect(r.pendentesObrigatorios).toEqual(obrigatorios.map((i) => i.rotulo));
  });

  it("com alguns itens feitos", () => {
    const mapa = marcarItem(marcarItem(marcarItem({}, "dfd", true, HOJE), "autorizacao", true, HOJE), "publicacao_pncp", true, HOJE);
    const r = resumirInstrucao(mapa);
    expect(r.feitos).toBe(3);
    expect(r.obrigatoriosFeitos).toBe(2);
    expect(r.completo).toBe(false);
    expect(r.percentual).toBe(22);
    expect(r.pendentesObrigatorios).toHaveLength(7);
    expect(r.pendentesObrigatorios).not.toContain("Formalização da demanda assinada");
    expect(r.pendentesObrigatorios).not.toContain("Autorização da autoridade competente");
    // Pendentes seguem a ordem da tela.
    expect(r.pendentesObrigatorios[0]).toBe("Justificativa da vantagem da adesão");
  });

  it("com todos os obrigatórios feitos, formalização não faz falta", () => {
    const r = resumirInstrucao(mapaObrigatoriosFeitos());
    expect(r).toMatchObject({ total: 11, feitos: 9, obrigatoriosFeitos: 9, completo: true, percentual: 100 });
    expect(r.pendentesObrigatorios).toEqual([]);
  });

  it("com todos os itens feitos", () => {
    let mapa = mapaObrigatoriosFeitos();
    mapa = marcarItem(mapa, "publicacao_pncp", true, HOJE);
    mapa = marcarItem(mapa, "contrato_ou_empenho", true, HOJE);
    expect(resumirInstrucao(mapa)).toMatchObject({ feitos: 11, obrigatoriosFeitos: 9, completo: true, percentual: 100 });
  });

  it("só formalização feita não completa nada", () => {
    const mapa = marcarItem(marcarItem({}, "publicacao_pncp", true, HOJE), "contrato_ou_empenho", true, HOJE);
    expect(resumirInstrucao(mapa)).toMatchObject({ feitos: 2, obrigatoriosFeitos: 0, completo: false, percentual: 0 });
  });

  it("item presente mas desmarcado não conta", () => {
    expect(resumirInstrucao({ dfd: { feito: false, nota: "x" } }).feitos).toBe(0);
  });

  it("só chega a 100% quando completo (8 de 9 é 88%)", () => {
    const mapa = mapaObrigatoriosFeitos();
    delete mapa.dfd;
    const r = resumirInstrucao(mapa);
    expect(r.percentual).toBe(88);
    expect(r.completo).toBe(false);
  });

  it("não lança com entrada hostil", () => {
    for (const v of [null, undefined, [], 7, "x", { dfd: true }]) {
      expect(() => resumirInstrucao(v as unknown as MapaInstrucao)).not.toThrow();
      expect(resumirInstrucao(v as unknown as MapaInstrucao).feitos).toBe(0);
    }
  });
});

describe("podeDeclararConformidade", () => {
  it("libera com todos os obrigatórios feitos", () => {
    expect(podeDeclararConformidade(mapaObrigatoriosFeitos())).toEqual({ liberado: true });
  });

  it("não libera com pendência e diz o que falta", () => {
    const mapa = mapaObrigatoriosFeitos();
    delete mapa.dotacao;
    const r = podeDeclararConformidade(mapa);
    expect(r.liberado).toBe(false);
    expect(r.motivo).toContain("Indicação de dotação orçamentária");
    expect(r.motivo).not.toContain("Formalização da demanda assinada");
  });

  it("não libera com mapa vazio", () => {
    const r = podeDeclararConformidade({});
    expect(r.liberado).toBe(false);
    expect(r.motivo).toBeTruthy();
  });
});

describe("limites combinados", () => {
  it("nota até 300, justificativa de 20 a 1000 caracteres", () => {
    expect(MAX_NOTA).toBe(300);
    expect(MIN_JUSTIFICATIVA).toBe(20);
    expect(MAX_JUSTIFICATIVA).toBe(1000);
  });
});

describe("validarDeclaracao", () => {
  it("com tudo feito, passa sem justificativa", () => {
    expect(validarDeclaracao({ mapa: mapaObrigatoriosFeitos() })).toEqual({ ok: true });
    expect(validarDeclaracao({ mapa: mapaObrigatoriosFeitos(), justificativaExcecao: null })).toEqual({ ok: true });
  });

  it("com tudo feito, a justificativa não importa", () => {
    expect(validarDeclaracao({ mapa: mapaObrigatoriosFeitos(), justificativaExcecao: "curta" })).toEqual({ ok: true });
  });

  it("com pendência e sem justificativa, recusa dizendo o que falta", () => {
    for (const justificativaExcecao of [undefined, null, ""]) {
      const r = validarDeclaracao({ mapa: {}, justificativaExcecao });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.erro).toContain("Faltam itens obrigatórios");
        expect(r.erro).toContain(String(MIN_JUSTIFICATIVA));
      }
    }
  });

  it("com pendência e justificativa curta, recusa", () => {
    const r = validarDeclaracao({ mapa: {}, justificativaExcecao: texto(MIN_JUSTIFICATIVA - 1) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("curta demais");
  });

  it("espaços não contam: só espaços e texto cercado de espaços", () => {
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: " ".repeat(50) }).ok).toBe(false);
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: `\n\t ${texto(10)} \n\t ` }).ok).toBe(false);
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: `   ${texto(MIN_JUSTIFICATIVA - 1)}   ` }).ok).toBe(false);
  });

  it("caractere de controle também não conta", () => {
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: "\u0000".repeat(40) }).ok).toBe(false);
  });

  it("caractere invisível não conta: largura zero, espaço sem quebra, braille em branco", () => {
    const invisiveis = [
      "​", // espaço de largura zero
      "‍", // junção de largura zero
      "﻿", // marca de ordem de bytes
      "­", // hífen suave
      "⁠", // junção de palavras
      " ", // espaço sem quebra
      " ", // espaço em
      " ", // separador de linha
      "⠀", // braille em branco
      "ㅤ", // preenchimento do hangul
    ];
    for (const c of invisiveis) {
      expect(validarDeclaracao({ mapa: {}, justificativaExcecao: c.repeat(40) }).ok).toBe(false);
      // Escondidos entre poucas letras, também não completam os 20.
      expect(validarDeclaracao({ mapa: {}, justificativaExcecao: `ab${c.repeat(40)}cd` }).ok).toBe(false);
    }
  });

  it("espaços repetidos no meio contam como um só", () => {
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: `a${" ".repeat(30)}b` }).ok).toBe(false);
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: `a${"\n\t  ".repeat(10)}b` }).ok).toBe(false);
  });

  it("os limites valem em números: 19 recusa, 20 aceita", () => {
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: "a".repeat(19) }).ok).toBe(false);
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: "a".repeat(20) }).ok).toBe(true);
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: "a".repeat(1000) }).ok).toBe(true);
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: "a".repeat(1001) }).ok).toBe(false);
  });

  it("20 caracteres depois do trim já bastam", () => {
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: texto(MIN_JUSTIFICATIVA) })).toEqual({ ok: true });
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: `  ${texto(MIN_JUSTIFICATIVA)}  ` })).toEqual({ ok: true });
  });

  it("texto com acento, espaço e emoji de verdade passa", () => {
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: "Parecer sai amanhã 👍" })).toEqual({ ok: true });
  });

  it("justificativa que não é texto vale como ausente", () => {
    for (const v of [123, {}, [], true]) {
      expect(validarDeclaracao({ mapa: {}, justificativaExcecao: v as unknown as string }).ok).toBe(false);
    }
  });

  it("recusa justificativa gigante", () => {
    expect(validarDeclaracao({ mapa: {}, justificativaExcecao: texto(MAX_JUSTIFICATIVA) })).toEqual({ ok: true });
    const r = validarDeclaracao({ mapa: {}, justificativaExcecao: texto(MAX_JUSTIFICATIVA + 1) });
    expect(r.ok).toBe(false);
  });

  it("mapa sujo não lança e conta como sem itens feitos", () => {
    expect(validarDeclaracao({ mapa: null as unknown as MapaInstrucao }).ok).toBe(false);
  });
});

describe("normalizarJustificativa", () => {
  it("tira espaços, controle e metade solta de emoji", () => {
    expect(normalizarJustificativa("  motivo\u0000 real\ud83d  ")).toBe("motivo real");
  });

  it("devolve vazio para o que não é texto", () => {
    for (const v of [null, undefined, 1, {}, []]) expect(normalizarJustificativa(v)).toBe("");
  });

  it("tira caractere invisível e reduz espaços e quebras de linha a um espaço só", () => {
    expect(normalizarJustificativa("​  motivo  real⠀\n\n  dito ﻿ ")).toBe("motivo real dito");
    expect(normalizarJustificativa("​⠀ㅤ \n")).toBe("");
  });

  it("mantém acento (inclusive decomposto) e emoji simples", () => {
    expect(normalizarJustificativa("urgência 👍")).toBe("urgência 👍");
    // "ê" decomposto (e + acento combinante) não é tratado como lixo.
    expect(normalizarJustificativa("urgência")).toBe("urgência");
  });
});

describe("texto da declaração", () => {
  it("está na versão 1 e com o texto combinado", () => {
    expect(VERSAO_DECLARACAO).toBe(1);
    expect(TEXTO_DECLARACAO).toBe(
      "Declaro que, até onde sei, o pedido de adesão foi instruído pelo órgão aderente com os documentos e aceites indicados, que a decisão de aderir é do órgão aderente, do órgão gerenciador e do fornecedor, e que a plataforma apenas organizou as informações e o pedido.",
    );
  });

  it("sem pendências, é o texto padrão", () => {
    expect(textoDeclaracao({ mapa: mapaObrigatoriosFeitos() })).toBe(TEXTO_DECLARACAO);
  });

  it("sem pendências, ignora a justificativa", () => {
    expect(textoDeclaracao({ mapa: mapaObrigatoriosFeitos(), justificativaExcecao: "qualquer coisa que alguém escreveu" })).toBe(
      TEXTO_DECLARACAO,
    );
  });

  it("com pendências e justificativa, acrescenta a variante de exceção", () => {
    const mapa = mapaObrigatoriosFeitos();
    delete mapa.dotacao;
    delete mapa.parecer_juridico;
    const r = textoDeclaracao({ mapa, justificativaExcecao: "  O parecer sai amanhã e a dotação já foi reservada  " });
    expect(r).toBe(
      `${TEXTO_DECLARACAO} Itens ainda não confirmados: Indicação de dotação orçamentária; Parecer jurídico do órgão, art. 53. Justificativa: O parecer sai amanhã e a dotação já foi reservada.`,
    );
  });

  it("não duplica o ponto final da justificativa", () => {
    const r = textoDeclaracao({ mapa: {}, justificativaExcecao: "O órgão já tem tudo, falta só anexar." });
    expect(r.endsWith("falta só anexar.")).toBe(true);
    expect(r.endsWith("..")).toBe(false);
  });

  it("com pendências lista todos os obrigatórios que faltam, e só eles", () => {
    const r = textoDeclaracao({ mapa: {}, justificativaExcecao: texto(25) });
    for (const i of obrigatorios) expect(r).toContain(i.rotulo);
    expect(r).not.toContain("Publicação da contratação no PNCP");
    expect(r).not.toContain("Contrato ou nota de empenho");
  });

  it("a justificativa entra numa frase só, sem quebra de linha", () => {
    const r = textoDeclaracao({ mapa: {}, justificativaExcecao: "Primeira linha\n\n  segunda linha​ do motivo" });
    expect(r.endsWith(" Justificativa: Primeira linha segunda linha do motivo.")).toBe(true);
    expect(r).not.toContain("\n");
  });

  it("com pendências e sem justificativa, lista os itens e não inventa justificativa", () => {
    const r = textoDeclaracao({ mapa: {}, justificativaExcecao: "   " });
    expect(r).toContain("Itens ainda não confirmados:");
    expect(r).not.toContain("Justificativa:");
  });
});

describe("condicaoParaAderiu", () => {
  it("recusa sem declaração registrada", () => {
    for (const declaracaoEm of [
      null,
      undefined,
      "",
      "   ",
      "lixo",
      "1",
      "2026-99-99",
      "2026-02-31",
      "2026-02-30T10:00:00Z",
      "2026-10-21 lixo",
      "2026-10-21abc",
      new Date("lixo"),
      1761000000000 as unknown as string,
      {} as unknown as string,
      true as unknown as string,
    ]) {
      const r = condicaoParaAderiu({ declaracaoEm });
      expect(r.permitido).toBe(false);
      expect(r.erro).toContain("declaração");
    }
    expect(condicaoParaAderiu({}).permitido).toBe(false);
  });

  it("libera com a declaração registrada (data ou texto ISO)", () => {
    expect(condicaoParaAderiu({ declaracaoEm: new Date("2026-10-21T12:00:00Z") })).toEqual({ permitido: true });
    expect(condicaoParaAderiu({ declaracaoEm: "2026-10-21T12:00:00.000Z" })).toEqual({ permitido: true });
    expect(condicaoParaAderiu({ declaracaoEm: "2026-10-21" }).permitido).toBe(true);
    expect(condicaoParaAderiu({ declaracaoEm: "2024-02-29T08:00:00-03:00" }).permitido).toBe(true);
  });
});
