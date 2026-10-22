import { describe, expect, it } from "vitest";
import { ITENS_INSTRUCAO, TEXTO_DECLARACAO, VERSAO_DECLARACAO, textoDeclaracao, type MapaInstrucao } from "./instrucao-adesao";
import {
  AVISO_MINUTA,
  CHAVES_MINUTAS,
  dataPorExtenso,
  dividirMarcadores,
  formatarVigencia,
  marcador,
  montarMinutas,
  separarSubtitulo,
  type ComparativoDaMinuta,
  type DadosMinutas,
  type Minuta,
} from "./minutas";
import { TEXTO_AVISO_VANTAJOSIDADE } from "./vantajosidade";

const HOJE = new Date("2026-10-21T15:00:00Z");

function dadosCompletos(extra: Partial<DadosMinutas> = {}): DadosMinutas {
  return {
    hoje: HOJE,
    orgaoAderente: { nome: "Município de Anápolis", uf: "go" },
    ata: {
      numero: "121/2026",
      objeto: "Registro de preços para aquisição de material de limpeza",
      categoria: "limpeza",
      vigenciaFim: new Date("2027-03-31T00:00:00Z"),
    },
    orgaoGerenciador: { nome: "Prefeitura Municipal de Goiânia", uf: "GO" },
    fornecedor: { razaoSocial: "Limpa Tudo Comércio Ltda" },
    ...extra,
  };
}

function dadosVazios(): DadosMinutas {
  return {
    hoje: HOJE,
    orgaoAderente: { nome: "   ", uf: null },
    ata: { numero: "", objeto: null, categoria: undefined, vigenciaFim: null },
    orgaoGerenciador: { nome: null, uf: "" },
    fornecedor: { razaoSocial: " " },
  };
}

function mapaObrigatoriosFeitos(): MapaInstrucao {
  const mapa: MapaInstrucao = {};
  for (const item of ITENS_INSTRUCAO) {
    if (item.obrigatorio) mapa[item.chave] = { feito: true, em: "2026-10-01" };
  }
  return mapa;
}

/** 9 de 12 itens comparados; 6 compatíveis, 2 acima (18,5% do valor comparado), 1 abaixo, 3 sem comparação. */
const COMPARATIVO: ComparativoDaMinuta = {
  resumo: { itensTotal: 12, itensComReferencia: 9, compativeis: 6, acima: 2, abaixo: 1, semReferencia: 3, pesoAcima: 18.46 },
  consultadoEm: { maisAntiga: new Date("2026-10-22T15:00:00Z"), maisRecente: new Date("2026-10-22T18:00:00Z") },
};

const EXCECAO = "Compra urgente; o parecer jurídico está em análise e será juntado depois.";

function tudo(minutas: Minuta[]): string {
  return minutas.flatMap((m) => [m.titulo, ...m.paragrafos]).join("\n");
}

function minuta(minutas: Minuta[], chave: Minuta["chave"]): Minuta {
  const achada = minutas.find((m) => m.chave === chave);
  if (!achada) throw new Error(`minuta ${chave} não encontrada`);
  return achada;
}

/** Os cenários que os testes de texto percorrem: com dados, sem dados e as três formas da declaração. */
function cenarios(): Array<[string, Minuta[]]> {
  return [
    ["dados completos, sem declaração", montarMinutas(dadosCompletos())],
    ["sem nenhum dado", montarMinutas(dadosVazios())],
    ["com comparativo auxiliar de preços", montarMinutas(dadosCompletos({ comparativo: COMPARATIVO }))],
    [
      "com comparativo auxiliar, sem data de consulta e sem dado nenhum",
      montarMinutas({ ...dadosVazios(), comparativo: { resumo: COMPARATIVO.resumo } }),
    ],
    [
      "declaração registrada sem exceção",
      montarMinutas(
        dadosCompletos({
          itens: mapaObrigatoriosFeitos(),
          declaracao: { em: new Date("2026-10-20T15:00:00Z"), porTipo: "vendedor", porNome: "Maria Souza", versao: 1 },
        }),
      ),
    ],
    [
      "declaração registrada com exceção",
      montarMinutas(
        dadosCompletos({
          itens: {},
          declaracao: { em: new Date("2026-10-20T15:00:00Z"), porTipo: "admin", porNome: "Carlos", excecao: EXCECAO, versao: 1 },
        }),
      ),
    ],
    [
      "declaração registrada sem exceção, com item obrigatório desmarcado depois",
      montarMinutas(
        dadosCompletos({
          itens: { ...mapaObrigatoriosFeitos(), dotacao: { feito: false } },
          declaracao: { em: new Date("2026-10-20T15:00:00Z"), porTipo: "vendedor", porNome: "Maria Souza", versao: 1 },
        }),
      ),
    ],
    [
      "declaração registrada com exceção e tudo feito hoje",
      montarMinutas(
        dadosCompletos({
          itens: mapaObrigatoriosFeitos(),
          declaracao: { em: new Date("2026-10-20T15:00:00Z"), porTipo: "admin", porNome: "Carlos", excecao: EXCECAO, versao: 1 },
        }),
      ),
    ],
  ];
}

describe("estrutura do kit", () => {
  it("devolve as cinco minutas, na ordem, cada uma com chave, título e parágrafos", () => {
    const minutas = montarMinutas(dadosCompletos());
    expect(minutas.map((m) => m.chave)).toEqual([...CHAVES_MINUTAS]);
    expect(minutas).toHaveLength(5);
    for (const m of minutas) {
      expect(m.titulo.length).toBeGreaterThan(0);
      expect(m.paragrafos.length).toBeGreaterThan(1);
      for (const p of m.paragrafos) expect(p.trim().length).toBeGreaterThan(0);
    }
  });

  it("toda minuta começa com o aviso de modelo para adaptação", () => {
    expect(AVISO_MINUTA).toBe(
      "Modelo para adaptação. A instrução do processo e a decisão de aderir são do órgão aderente; revise com o assessoramento jurídico do órgão.",
    );
    for (const [, minutas] of cenarios()) {
      for (const m of minutas) expect(m.paragrafos[0]).toBe(AVISO_MINUTA);
    }
  });

  it("os títulos dos cinco modelos estão corretos", () => {
    const titulos = montarMinutas(dadosCompletos()).map((m) => m.titulo);
    expect(titulos[0]).toMatch(/Formalização da demanda/);
    expect(titulos[1]).toMatch(/Justificativa da vantagem da adesão/);
    expect(titulos[2]).toMatch(/Ofício ao órgão gerenciador/);
    expect(titulos[3]).toMatch(/Ofício ao fornecedor/);
    expect(titulos[4]).toMatch(/Declaração interna de conformidade/);
  });

  it("é determinístico e não altera a entrada", () => {
    const dados = dadosCompletos({ itens: mapaObrigatoriosFeitos() });
    const copia = structuredClone(dados);
    const a = montarMinutas(dados);
    const b = montarMinutas(dados);
    expect(a).toEqual(b);
    expect(dados).toEqual(copia);
  });
});

describe("preenchimento automático", () => {
  const minutas = montarMinutas(dadosCompletos());

  it("usa órgão aderente, UF, gerenciador, fornecedor, ata, objeto, vigência, categoria e a data de hoje", () => {
    const texto = tudo(minutas);
    expect(texto).toContain("Município de Anápolis (GO)");
    expect(texto).toContain("Prefeitura Municipal de Goiânia (GO)");
    expect(texto).toContain("Limpa Tudo Comércio Ltda");
    expect(texto).toContain("121/2026");
    expect(texto).toContain("Registro de preços para aquisição de material de limpeza");
    expect(texto).toContain("31/03/2027");
    expect(texto).toContain("Limpeza e conservação");
    expect(texto).toContain("21 de outubro de 2026");
  });

  it("não deixa marcador onde o dado existe", () => {
    const texto = tudo(minutas);
    for (const faltando of ["nome do órgão aderente", "UF do órgão aderente", "número da ata", "objeto da ata", "categoria da ata", "vigência da ata", "razão social do fornecedor", "nome do órgão gerenciador"]) {
      expect(texto).not.toContain(marcador(faltando));
    }
  });

  it("a formalização da demanda traz objeto, justificativa, quantidade e responsável como marcadores", () => {
    const m = minuta(minutas, "formalizacao-demanda");
    const texto = m.paragrafos.join("\n");
    expect(texto).toContain("1. Objeto");
    expect(texto).toContain("2. Justificativa da necessidade");
    expect(texto).toContain("3. Quantidade estimada");
    expect(texto).toContain("4. Responsável pela demanda");
    const quantidade = m.paragrafos.find((p) => p.startsWith("3. Quantidade estimada")) ?? "";
    expect(quantidade).toContain("[PREENCHER: quantidade estimada");
    const responsavel = m.paragrafos.find((p) => p.startsWith("4. Responsável")) ?? "";
    expect(responsavel).toContain("[PREENCHER: nome do responsável]");
  });

  it("a justificativa da vantagem cita a ata, o art. 23 e deixa a comparação e a conclusão em aberto", () => {
    const m = minuta(minutas, "justificativa-vantagem");
    const texto = m.paragrafos.join("\n");
    expect(texto).toContain("Ata de registro de preços nº 121/2026");
    expect(texto).toContain("Órgão gerenciador: Prefeitura Municipal de Goiânia (GO)");
    expect(texto).toContain("Fornecedor registrado: Limpa Tudo Comércio Ltda");
    expect(texto).toContain("Vigência da ata até: 31/03/2027");
    expect(texto).toContain("art. 23");
    expect(texto).toContain("art. 53");
    const comparacao = m.paragrafos.find((p) => p.startsWith("2. Comparação")) ?? "";
    expect(comparacao).toContain("[PREENCHER: para cada item");
    const conclusao = m.paragrafos.find((p) => p.startsWith("4. Conclusão")) ?? "";
    expect(conclusao).toContain("[PREENCHER:");
  });

  it("o ofício ao gerenciador pede anuência e o do fornecedor pede aceite sem prejuízo dos compromissos da ata", () => {
    const gerenciador = minuta(minutas, "oficio-gerenciador").paragrafos.join("\n");
    expect(gerenciador).toContain("Destinatário: Prefeitura Municipal de Goiânia (GO)");
    expect(gerenciador).toMatch(/pedido de anuência/);
    expect(gerenciador).toContain("art. 86");
    expect(gerenciador).toContain("50% por órgão aderente e 200% no total por item");

    const fornecedor = minuta(minutas, "oficio-fornecedor").paragrafos.join("\n");
    expect(fornecedor).toContain("À empresa Limpa Tudo Comércio Ltda");
    expect(fornecedor).toMatch(/pedido de aceite/);
    expect(fornecedor).toContain("sem prejuízo dos compromissos já assumidos na ata");
    expect(fornecedor).toContain("art. 94");
  });

  it("não coloca CNPJ nem contato do fornecedor, mesmo que a linha do banco inteira seja passada", () => {
    const linhaDoBanco = {
      razaoSocial: "Limpa Tudo Comércio Ltda",
      cnpj: "12.345.678/0001-90",
      email: "contato@limpatudo.example",
      telefone: "(62) 99999-0000",
      contatoTecnicoNome: "João Técnico",
    };
    const texto = tudo(montarMinutas(dadosCompletos({ fornecedor: linhaDoBanco })));
    expect(texto).not.toContain("12.345.678");
    expect(texto).not.toContain("12345678");
    expect(texto).not.toContain("@");
    expect(texto).not.toContain("99999");
    expect(texto).not.toContain("João Técnico");
    expect(texto).not.toMatch(/cnpj|telefone|e-mail|whatsapp/i);
  });
});

describe("justificativa da vantagem: referência auxiliar de preços", () => {
  const PREFIXO = "Referência auxiliar da plataforma:";

  function justificativa(comparativo?: ComparativoDaMinuta | null, extra: Partial<DadosMinutas> = {}): Minuta {
    return minuta(montarMinutas(dadosCompletos({ comparativo, ...extra })), "justificativa-vantagem");
  }
  const referenciaDe = (m: Minuta) => m.paragrafos.find((p) => p.startsWith(PREFIXO)) ?? "";

  it("sem comparativo (ausente, nulo, sem item comparado ou resumo inválido), o texto é o de sempre", () => {
    const base = justificativa().paragrafos;
    const semComparados: ComparativoDaMinuta = {
      resumo: { itensTotal: 5, itensComReferencia: 0, compativeis: 0, acima: 0, abaixo: 0, semReferencia: 5, pesoAcima: null },
    };
    const invalido = { resumo: { itensTotal: Number.NaN, itensComReferencia: Number.NaN } } as unknown as ComparativoDaMinuta;
    for (const comparativo of [undefined, null, semComparados, invalido]) {
      const m = justificativa(comparativo);
      expect(m.paragrafos).toEqual(base);
      expect(m.paragrafos.join("\n")).not.toContain(PREFIXO);
      expect(m.paragrafos.join("\n")).not.toContain("Compras.gov.br");
    }
  });

  it("com comparativo, inclui o resumo, a data da consulta, o aviso-padrão e deixa a avaliação para o órgão", () => {
    const m = justificativa(COMPARATIVO);
    const referencia = referenciaDe(m);
    expect(referencia).not.toBe("");
    expect(referencia).toContain(
      "9 de 12 itens da ata foram comparados com preços de contratações públicas consultados no Compras.gov.br em 22 de outubro de 2026.",
    );
    expect(referencia).toContain("Compatíveis com os preços consultados: 6.");
    expect(referencia).toContain("Acima dos preços consultados: 2.");
    expect(referencia).toContain("Abaixo dos preços consultados: 1.");
    expect(referencia).toContain("Sem comparação (sem código do catálogo, poucos preços consultados ou unidade diferente): 3.");
    expect(referencia).toContain("somam 18,5% do valor dos itens comparados");
    expect(referencia).toContain(TEXTO_AVISO_VANTAJOSIDADE);
    expect(referencia).toContain("Avaliação do órgão sobre esta referência: [PREENCHER: avaliação do órgão");
    // Marcador inteiro: o [PREENCHER: ...] do parágrafo é reconhecido pela tela.
    expect(dividirMarcadores(referencia).some((t) => t.marcador && t.texto.startsWith("[PREENCHER: avaliação do órgão"))).toBe(true);
  });

  it("fica entre o bloco 2 (comparação com a pesquisa) e o bloco 3, sem criar subtítulo novo", () => {
    const m = justificativa(COMPARATIVO);
    const indice = (comeco: string) => m.paragrafos.findIndex((p) => p.startsWith(comeco));
    expect(indice(PREFIXO)).toBe(indice("2. Comparação") + 1);
    expect(indice("3. Vantagem")).toBe(indice(PREFIXO) + 1);
    expect(separarSubtitulo(referenciaDe(m)).subtitulo).toBeNull();
    expect(m.paragrafos.filter((p) => separarSubtitulo(p).subtitulo !== null)).toHaveLength(5);
    // Os blocos e marcadores que já existiam continuam.
    expect(m.paragrafos.join("\n")).toContain("[PREENCHER: para cada item");
    expect(m.paragrafos.find((p) => p.startsWith("4. Conclusão")) ?? "").toContain("[PREENCHER: conclusão do órgão");
  });

  it("as outras quatro minutas não mudam", () => {
    const sem = montarMinutas(dadosCompletos());
    const com = montarMinutas(dadosCompletos({ comparativo: COMPARATIVO }));
    for (const chave of CHAVES_MINUTAS) {
      if (chave === "justificativa-vantagem") continue;
      expect(minuta(com, chave)).toEqual(minuta(sem, chave));
    }
  });

  it("consultas em dias diferentes viram um período; a data vale no fuso de São Paulo", () => {
    const periodo = justificativa({
      ...COMPARATIVO,
      consultadoEm: { maisAntiga: new Date("2026-10-01T15:00:00Z"), maisRecente: "2026-10-22T15:00:00Z" },
    });
    expect(referenciaDe(periodo)).toContain("entre 1º de outubro de 2026 e 22 de outubro de 2026.");

    // 01h UTC de 22/10 ainda é 21/10 em São Paulo.
    const fuso = justificativa({
      ...COMPARATIVO,
      consultadoEm: { maisAntiga: new Date("2026-10-22T01:00:00Z"), maisRecente: new Date("2026-10-22T02:00:00Z") },
    });
    expect(referenciaDe(fuso)).toContain("em 21 de outubro de 2026.");
  });

  it("só uma das datas serve; sem data nenhuma ou inválida, vira marcador", () => {
    const so = justificativa({ ...COMPARATIVO, consultadoEm: { maisRecente: new Date("2026-10-22T15:00:00Z") } });
    expect(referenciaDe(so)).toContain("em 22 de outubro de 2026.");
    for (const consultadoEm of [undefined, null, {}, { maisAntiga: "ontem", maisRecente: null }]) {
      const m = justificativa({ resumo: COMPARATIVO.resumo, consultadoEm });
      expect(referenciaDe(m)).toContain("consultados no Compras.gov.br em [PREENCHER: data da consulta].");
    }
  });

  it("singular para um item só; sem item acima não fala do peso; sem item abaixo não fala da conferência", () => {
    const um = referenciaDe(
      justificativa({
        ...COMPARATIVO,
        resumo: { itensTotal: 1, itensComReferencia: 1, compativeis: 1, acima: 0, abaixo: 0, semReferencia: 0, pesoAcima: 0 },
      }),
    );
    expect(um).toContain("1 de 1 item da ata foi comparado");
    expect(um).not.toContain("somam");
    expect(um).not.toContain("merece conferência");

    const comAbaixo = referenciaDe(justificativa(COMPARATIVO));
    expect(comAbaixo).toContain("Preço abaixo dos preços consultados também merece conferência");
  });

  it("número inválido no resumo vale zero e o total nunca fica menor que os comparados", () => {
    const m = justificativa({
      resumo: {
        itensTotal: 0,
        itensComReferencia: 4,
        compativeis: Number.NaN,
        acima: -3,
        abaixo: Number.POSITIVE_INFINITY,
        semReferencia: Number.NaN,
        pesoAcima: Number.NaN,
      },
      consultadoEm: COMPARATIVO.consultadoEm,
    });
    const referencia = referenciaDe(m);
    expect(referencia).toContain("4 de 4 itens da ata foram comparados");
    expect(referencia).not.toMatch(/undefined|null|NaN|Infinity|-\d/);
  });

  it("não diz que o preço é vantajoso nem que algo foi comprovado: quem conclui é o órgão", () => {
    for (const comparativo of [COMPARATIVO, { resumo: COMPARATIVO.resumo }]) {
      const m = justificativa(comparativo);
      // Fora dos marcadores (que descrevem o que o órgão deve escrever), o texto não afirma nada disso.
      const semMarcadores = m.paragrafos
        .flatMap((p) => dividirMarcadores(p))
        .filter((t) => !t.marcador)
        .map((t) => t.texto)
        .join("");
      expect(semMarcadores).not.toMatch(/vantajos|comprov|garant|asseg|certeza|econom|melhor pre/i);
      expect(referenciaDe(m)).not.toMatch(/vantajos|comprov|garant|econom/i);
    }
  });

  it("não altera a entrada", () => {
    const dados = dadosCompletos({ comparativo: COMPARATIVO });
    const copia = structuredClone(dados);
    montarMinutas(dados);
    expect(dados).toEqual(copia);
  });
});

describe("marcadores quando falta dado", () => {
  it("dado ausente, nulo ou em branco vira marcador visível, nunca texto inventado", () => {
    const minutas = montarMinutas(dadosVazios());
    const texto = tudo(minutas);
    for (const faltando of [
      "nome do órgão aderente",
      "UF do órgão aderente",
      "número da ata",
      "objeto da ata",
      "categoria da ata",
      "vigência da ata",
      "razão social do fornecedor",
      "nome do órgão gerenciador",
      "UF do órgão gerenciador",
    ]) {
      expect(texto).toContain(marcador(faltando));
    }
    expect(texto).not.toMatch(/undefined|null|NaN|\[object/);
  });

  it("falta só a UF do órgão aderente: o resto continua preenchido", () => {
    const texto = tudo(montarMinutas(dadosCompletos({ orgaoAderente: { nome: "Ministério X", uf: null } })));
    expect(texto).toContain("Ministério X ([PREENCHER: UF do órgão aderente])");
    expect(texto).toContain("Limpa Tudo Comércio Ltda");
  });

  it("falta só a categoria", () => {
    const base = dadosCompletos();
    const texto = tudo(montarMinutas({ ...base, ata: { ...base.ata, categoria: null } }));
    expect(texto).toContain("Categoria da ata: [PREENCHER: categoria da ata]");
  });

  it("categoria desconhecida aparece como veio", () => {
    const base = dadosCompletos();
    const texto = tudo(montarMinutas({ ...base, ata: { ...base.ata, categoria: "categoria-nova" } }));
    expect(texto).toContain("Categoria da ata: categoria-nova");
  });

  it("data de hoje inválida vira marcador", () => {
    const texto = tudo(montarMinutas({ ...dadosCompletos(), hoje: new Date("não é data") }));
    expect(texto).toContain("[PREENCHER: data]");
  });

  it("espaços e quebras de linha do objeto viram um espaço só", () => {
    const base = dadosCompletos();
    const texto = tudo(montarMinutas({ ...base, ata: { ...base.ata, objeto: "  Registro   de\npreços\t de limpeza " } }));
    expect(texto).toContain("Objeto da ata: Registro de preços de limpeza");
  });
});

describe("declaração interna de conformidade", () => {
  it("sem declaração registrada: mostra o texto-padrão marcado como ainda não registrada", () => {
    const m = minuta(montarMinutas(dadosCompletos()), "declaracao-conformidade");
    expect(m.paragrafos).toContain(TEXTO_DECLARACAO);
    expect(m.paragrafos.join("\n")).toContain("[AINDA NÃO REGISTRADA NA PLATAFORMA]");
    expect(m.paragrafos.join("\n")).not.toContain("registrada na plataforma em");
  });

  it("a tabela InstrucaoAdesao existindo mas sem declaração (declaracaoEm nulo) conta como não registrada", () => {
    const m = minuta(
      montarMinutas(dadosCompletos({ itens: mapaObrigatoriosFeitos(), declaracao: { em: null, porTipo: null, porNome: null } })),
      "declaracao-conformidade",
    );
    expect(m.paragrafos.join("\n")).toContain("[AINDA NÃO REGISTRADA NA PLATAFORMA]");
    expect(m.paragrafos).toContain(TEXTO_DECLARACAO);
  });

  it("data inválida na declaração também conta como não registrada", () => {
    const m = minuta(
      montarMinutas(dadosCompletos({ declaracao: { em: "ontem", porTipo: "admin", porNome: "Carlos" } })),
      "declaracao-conformidade",
    );
    expect(m.paragrafos.join("\n")).toContain("[AINDA NÃO REGISTRADA NA PLATAFORMA]");
  });

  it("registrada sem exceção: texto registrado, data e quem registrou", () => {
    const m = minuta(
      montarMinutas(
        dadosCompletos({
          itens: mapaObrigatoriosFeitos(),
          declaracao: { em: new Date("2026-10-20T15:00:00Z"), porTipo: "vendedor", porNome: "Maria Souza", versao: VERSAO_DECLARACAO },
        }),
      ),
      "declaracao-conformidade",
    );
    const texto = m.paragrafos.join("\n");
    expect(texto).toContain("registrada na plataforma em 20 de outubro de 2026, por Maria Souza (vendedor).");
    expect(m.paragrafos).toContain(TEXTO_DECLARACAO);
    expect(texto).not.toContain("AINDA NÃO REGISTRADA");
    expect(texto).not.toContain("Itens ainda não confirmados");
    expect(texto).not.toContain("Observação:");
  });

  it("registrada com exceção: imprime o texto da exceção com a justificativa", () => {
    const m = minuta(
      montarMinutas(
        dadosCompletos({
          itens: { dfd: { feito: true, em: "2026-10-01" } },
          declaracao: { em: "2026-10-20T15:00:00.000Z", porTipo: "admin", porNome: "Carlos", excecao: EXCECAO, versao: 1 },
        }),
      ),
      "declaracao-conformidade",
    );
    const esperado = textoDeclaracao({ mapa: { dfd: { feito: true, em: "2026-10-01" } }, justificativaExcecao: EXCECAO });
    expect(m.paragrafos).toContain(esperado);
    const texto = m.paragrafos.join("\n");
    expect(texto).toContain("Itens ainda não confirmados:");
    expect(texto).toContain(EXCECAO);
    expect(texto).toContain("por Carlos (administrador)");
    expect(texto).toContain("20 de outubro de 2026");
  });

  it("a data de registro vale no fuso de São Paulo", () => {
    const m = minuta(
      montarMinutas(dadosCompletos({ declaracao: { em: new Date("2026-10-21T01:00:00Z"), porTipo: "admin", porNome: "Carlos" } })),
      "declaracao-conformidade",
    );
    expect(m.paragrafos.join("\n")).toContain("em 20 de outubro de 2026");
  });

  it("se a justificativa foi registrada mas hoje todos os itens estão feitos, ela continua no texto", () => {
    const m = minuta(
      montarMinutas(
        dadosCompletos({
          itens: mapaObrigatoriosFeitos(),
          declaracao: { em: new Date("2026-10-20T15:00:00Z"), porTipo: "vendedor", porNome: "Maria", excecao: EXCECAO, versao: 1 },
        }),
      ),
      "declaracao-conformidade",
    );
    const texto = m.paragrafos.join("\n");
    expect(texto).toContain(TEXTO_DECLARACAO);
    expect(texto).toContain("Declaração registrada com exceção: na data do registro havia itens obrigatórios ainda não confirmados.");
    expect(texto).toContain(`Justificativa registrada: ${EXCECAO}`);
  });

  it("sem exceção gravada mas com item obrigatório desmarcado depois: o texto registrado continua o padrão e a situação de hoje vai numa observação", () => {
    // Desmarcar item depois do registro não revoga a declaração (instrucao-actions): o papel não pode
    // transformar a situação de hoje no que foi declarado.
    const itens: MapaInstrucao = { ...mapaObrigatoriosFeitos(), parecer_juridico: { feito: false } };
    const m = minuta(
      montarMinutas(
        dadosCompletos({
          itens,
          declaracao: { em: new Date("2026-10-20T15:00:00Z"), porTipo: "vendedor", porNome: "Maria", excecao: null, versao: 1 },
        }),
      ),
      "declaracao-conformidade",
    );
    expect(m.paragrafos).toContain(TEXTO_DECLARACAO);
    const registrado = m.paragrafos.find((p) => p.startsWith(TEXTO_DECLARACAO)) ?? "";
    expect(registrado).not.toContain("Itens ainda não confirmados");
    const observacao = m.paragrafos.find((p) => p.startsWith("Observação: em 21 de outubro de 2026")) ?? "";
    expect(observacao).toContain("Parecer jurídico do órgão, art. 53");
    expect(observacao).toContain("não foi revogada");
    expect(m.paragrafos.join("\n")).not.toContain("Justificativa");
  });

  it("com exceção e itens ainda pendentes: texto da exceção e aviso de que a lista é a de hoje", () => {
    const m = minuta(
      montarMinutas(
        dadosCompletos({
          itens: { dfd: { feito: true, em: "2026-10-01" } },
          declaracao: { em: new Date("2026-10-20T15:00:00Z"), porTipo: "admin", porNome: "Carlos", excecao: EXCECAO, versao: 1 },
        }),
      ),
      "declaracao-conformidade",
    );
    const observacao = m.paragrafos.find((p) => p.startsWith("Observação: a lista de itens")) ?? "";
    expect(observacao).toContain("em 21 de outubro de 2026");
    expect(observacao).toContain("no dia do registro ela pode ter sido diferente");
  });

  it("registrada sem exceção e sem pendência hoje: nenhuma observação", () => {
    const m = minuta(
      montarMinutas(
        dadosCompletos({
          itens: mapaObrigatoriosFeitos(),
          declaracao: { em: new Date("2026-10-20T15:00:00Z"), porTipo: "vendedor", porNome: "Maria", excecao: "   ", versao: 1 },
        }),
      ),
      "declaracao-conformidade",
    );
    expect(m.paragrafos.some((p) => p.startsWith("Observação:"))).toBe(false);
  });

  it("quem registrou desconhecido vira marcador", () => {
    const m = minuta(
      montarMinutas(dadosCompletos({ declaracao: { em: new Date("2026-10-20T15:00:00Z"), porTipo: "vendedor", porNome: null } })),
      "declaracao-conformidade",
    );
    expect(m.paragrafos.join("\n")).toContain("[PREENCHER: nome de quem registrou] (vendedor)");
  });

  it("avisa quando a versão registrada do texto não é a atual", () => {
    const m = minuta(
      montarMinutas(
        dadosCompletos({
          itens: mapaObrigatoriosFeitos(),
          declaracao: { em: new Date("2026-10-20T15:00:00Z"), porTipo: "admin", porNome: "Carlos", versao: VERSAO_DECLARACAO + 1 },
        }),
      ),
      "declaracao-conformidade",
    );
    expect(m.paragrafos.join("\n")).toContain(`versão ${VERSAO_DECLARACAO + 1} do texto`);
  });
});

describe("o que os textos não podem dizer", () => {
  const PROIBIDOS: Array<[string, RegExp]> = [
    ["sem licitação", /sem\s+licita/i],
    ["dispensa", /dispens/i],
    ["qualquer menção a licitação ou concorrência", /\blicita|\bconcorr/i],
    ["garantia ou promessa", /garant|assegur|promet|certeza|sem\s+risco|sem\s+burocracia/i],
    ["automático", /autom[aá]tic/i],
    ["órgão regular", /\bregular(es)?\b|regularidade|irregular/i],
    ["aprovação já dada", /aprovad[oa]|autorizad[oa]/i],
    ["tom comercial", /imperd[ií]vel|melhor pre[cç]o|economia garantida/i],
  ];

  it.each(PROIBIDOS)("nenhum texto diz: %s", (_nome, regex) => {
    for (const [cenario, minutas] of cenarios()) {
      const achado = tudo(minutas).match(regex);
      expect(achado, `${cenario}: "${achado?.[0]}"`).toBeNull();
    }
  });

  it("só cita a Lei 14.133/2021 e os artigos 86, 23, 53 e 94", () => {
    const permitidos = new Set(["86", "23", "53", "94"]);
    for (const [cenario, minutas] of cenarios()) {
      const texto = tudo(minutas);
      for (const achado of texto.matchAll(/\bart(?:s?\.|igos?)\s*(\d+)/gi)) {
        expect(permitidos.has(achado[1]), `${cenario}: art. ${achado[1]}`).toBe(true);
      }
      for (const achado of texto.matchAll(/\bLei\s+(?:n[ºo°.]*\s*)?(\d+(?:\.\d+)*(?:\/\d+)?)/g)) {
        expect(achado[1], cenario).toBe("14.133/2021");
      }
      expect(texto, cenario).not.toMatch(/§|\binciso\b|\bDecreto\b|\bLC\b|\bPortaria\b|\bIN\s/);
    }
  });

  it("os artigos citados aparecem no kit", () => {
    const texto = tudo(montarMinutas(dadosCompletos()));
    for (const artigo of ["art. 86", "art. 23", "art. 53", "art. 94"]) expect(texto).toContain(artigo);
    expect(texto).toContain("Lei 14.133/2021");
  });

  it("deixa claro que a decisão é do órgão e que a plataforma só organiza", () => {
    const texto = tudo(montarMinutas(dadosCompletos()));
    expect(texto).toContain("a decisão de aderir são do órgão aderente");
    expect(texto).toContain("A decisão sobre a anuência cabe a esse órgão gerenciador");
    expect(texto).toContain("O aceite é uma decisão da empresa");
    expect(minuta(montarMinutas(dadosCompletos()), "declaracao-conformidade").paragrafos).toContain(TEXTO_DECLARACAO);
  });
});

describe("dataPorExtenso", () => {
  it("escreve dia, mês e ano por extenso", () => {
    expect(dataPorExtenso(new Date("2026-10-21T15:00:00Z"))).toBe("21 de outubro de 2026");
    expect(dataPorExtenso(new Date("2027-03-08T15:00:00Z"))).toBe("8 de março de 2027");
  });

  it("usa o fuso de São Paulo, não o do servidor", () => {
    expect(dataPorExtenso(new Date("2026-10-22T01:30:00Z"))).toBe("21 de outubro de 2026");
    expect(dataPorExtenso(new Date("2026-10-21T02:59:59Z"))).toBe("20 de outubro de 2026");
    expect(dataPorExtenso(new Date("2026-10-21T03:00:00Z"))).toBe("21 de outubro de 2026");
  });

  it("dia 1 sai como 1º", () => {
    expect(dataPorExtenso(new Date("2026-11-01T12:00:00Z"))).toBe("1º de novembro de 2026");
  });

  it("data inválida vira marcador", () => {
    expect(dataPorExtenso(new Date("x"))).toBe("[PREENCHER: data]");
  });
});

describe("formatarVigencia", () => {
  it("lê o dia em UTC (o banco guarda a meia-noite UTC)", () => {
    expect(formatarVigencia(new Date("2026-12-31T00:00:00Z"))).toBe("31/12/2026");
    expect(formatarVigencia("2027-01-05")).toBe("05/01/2027");
    expect(formatarVigencia("2027-01-05T00:00:00.000Z")).toBe("05/01/2027");
  });

  it("ausente ou inválida vira marcador", () => {
    expect(formatarVigencia(null)).toBe("[PREENCHER: vigência da ata]");
    expect(formatarVigencia(undefined)).toBe("[PREENCHER: vigência da ata]");
    expect(formatarVigencia("")).toBe("[PREENCHER: vigência da ata]");
    expect(formatarVigencia("lixo")).toBe("[PREENCHER: vigência da ata]");
    expect(formatarVigencia(new Date("x"))).toBe("[PREENCHER: vigência da ata]");
  });
});

describe("separarSubtitulo", () => {
  it("separa o título curto dos blocos numerados", () => {
    expect(separarSubtitulo("1. Objeto\nContratação de algo")).toEqual({ subtitulo: "1. Objeto", corpo: "Contratação de algo" });
    expect(separarSubtitulo("2. Comparação com a pesquisa de preços (art. 23)\nTexto\nOutra linha")).toEqual({
      subtitulo: "2. Comparação com a pesquisa de preços (art. 23)",
      corpo: "Texto\nOutra linha",
    });
  });

  it("não separa frases numeradas, parágrafos de uma linha só nem linhas sem número", () => {
    const frase = "1. O Município tem interesse em aderir à ata.\nDados da ata: objeto";
    expect(separarSubtitulo(frase)).toEqual({ subtitulo: null, corpo: frase });
    expect(separarSubtitulo("3. Título sozinho")).toEqual({ subtitulo: null, corpo: "3. Título sozinho" });
    expect(separarSubtitulo("Órgão aderente: X\nOutra")).toEqual({ subtitulo: null, corpo: "Órgão aderente: X\nOutra" });
  });

  it("no kit, os blocos numerados da formalização e da justificativa têm subtítulo e os ofícios não", () => {
    const minutas = montarMinutas(dadosCompletos());
    const quantos = (chave: Minuta["chave"]) =>
      minuta(minutas, chave).paragrafos.filter((p) => separarSubtitulo(p).subtitulo !== null).length;
    expect(quantos("formalizacao-demanda")).toBe(4);
    expect(quantos("justificativa-vantagem")).toBe(5);
    expect(quantos("oficio-gerenciador")).toBe(0);
    expect(quantos("oficio-fornecedor")).toBe(0);
    expect(quantos("declaracao-conformidade")).toBe(0);
  });
});

describe("dividirMarcadores", () => {
  it("separa os marcadores do texto e juntar de volta devolve o original", () => {
    const texto = `Nome: ${marcador("nome do responsável")}\nCargo: ${marcador("cargo")}.`;
    const trechos = dividirMarcadores(texto);
    expect(trechos).toEqual([
      { texto: "Nome: ", marcador: false },
      { texto: "[PREENCHER: nome do responsável]", marcador: true },
      { texto: "\nCargo: ", marcador: false },
      { texto: "[PREENCHER: cargo]", marcador: true },
      { texto: ".", marcador: false },
    ]);
    expect(trechos.map((t) => t.texto).join("")).toBe(texto);
  });

  it("destaca também o aviso de declaração ainda não registrada", () => {
    const trechos = dividirMarcadores("Situação: [AINDA NÃO REGISTRADA NA PLATAFORMA]");
    expect(trechos.filter((t) => t.marcador).map((t) => t.texto)).toEqual(["[AINDA NÃO REGISTRADA NA PLATAFORMA]"]);
  });

  it("texto sem marcador vem inteiro; vazio não gera trecho; colchete comum não é marcador", () => {
    expect(dividirMarcadores("só texto")).toEqual([{ texto: "só texto", marcador: false }]);
    expect(dividirMarcadores("")).toEqual([]);
    expect(dividirMarcadores("item [a] e [b]").every((t) => !t.marcador)).toBe(true);
  });

  it("todo marcador gerado pelo kit é reconhecido", () => {
    for (const [, minutas] of cenarios()) {
      for (const texto of minutas.flatMap((m) => m.paragrafos)) {
        const aberturas = (texto.match(/\[PREENCHER:/g) ?? []).length;
        const reconhecidos = dividirMarcadores(texto).filter((t) => t.marcador && t.texto.startsWith("[PREENCHER:")).length;
        expect(reconhecidos).toBe(aberturas);
      }
    }
  });
});
