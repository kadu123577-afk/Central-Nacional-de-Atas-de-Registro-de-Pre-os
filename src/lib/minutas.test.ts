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
  type DadosMinutas,
  type Minuta,
} from "./minutas";

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
    expect(gerenciador).toContain("Ao Prefeitura Municipal de Goiânia (GO)");
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
    expect(texto).toContain(`Justificativa registrada: ${EXCECAO}`);
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
    ["qualquer menção a licitação ou concorrência", /licita|concorr/i],
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
