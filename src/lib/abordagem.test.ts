import { describe, expect, it } from "vitest";
import { abordagemSugerida } from "./abordagem";
import { CATEGORIAS_ATAS } from "./categorias";
import {
  CARGO_ADMINISTRACAO,
  CARGO_EDUCACAO,
  CARGO_PREFEITO,
  CARGO_SAUDE,
} from "./decisores";

const CARGOS: (string | null)[] = [
  CARGO_EDUCACAO,
  CARGO_SAUDE,
  CARGO_ADMINISTRACAO,
  CARGO_PREFEITO,
  null,
  "Cargo que o sistema não conhece",
];

// Os quatro formatos reais de "por que agora" (raio-X e sinais por script).
const RAIO_X = "Contratou kit escolar há 30 meses";
const RAIO_X_RECORRENTE = "Contratou veículos e frota há 26 meses — necessidade recorrente em aberto";
const RAIO_X_RECENTE = "Contratou combustível há pouco tempo";
const CONTRATO = "Contrato vence em 01/12/2026: Locação de veículos";
const PCA = "Compra prevista no PCA 2026 para 11/2026: Material de expediente";
const ORCAMENTO = "Orçamento 2026: despesa com Saúde cresceu 45% (R$ 2.300.000)";
// Textos de origem desconhecida ou com defeitos que a mensagem não pode repetir.
const NOTICIA_COM_NOME = "Prefeito João da Silva anuncia compra de kits escolares";
const OBJETO_EM_CAIXA_ALTA = "Contrato vence em 15/03/2027: LOCAÇÃO DE VEÍCULOS PARA A SECRETARIA DE SAÚDE";
const OBJETO_COM_GRITO = "Contrato vence em 15/03/2027: Aquisição de merenda!!!";
const OBJETO_COM_URGENCIA = "Contrato vence em 15/03/2027: Compra sem licitação urgente";
const OBJETO_LONGO = `Contrato vence em 15/03/2027: ${"Fornecimento de material permanente para as unidades. ".repeat(10)}`;
const OBJETO_COM_GARANTIA = "Contrato vence em 15/03/2027: Aquisição de veículos com garantia estendida";
const OBJETO_COM_CONTATO = "Contrato vence em 15/03/2027: Serviço de limpeza; contato joao@exemplo.com.br";

/**
 * Trechos de registro público com cada expressão que a mensagem nunca pode
 * repetir, uma para cada alternativa dos padrões de PROIBIDOS: se qualquer
 * alternativa da trava for removida, o teste do objeto hostil derruba.
 */
const FRASES_PROIBIDAS = [
  "sem licitação", "sem nova licitação", "sem novo certame", "sem abrir uma nova licitação",
  "sem processo licitatório", "sem licitar",
  "com garantia estendida", "garantido",
  "imperdível", "oportunidade única", "última chance", "últimas vagas", "últimas unidades",
  "aproveite", "não perca", "não deixe passar",
  "corra", "só hoje", "hoje mesmo", "urgente", "com urgência", "entrega imediata",
  "o quanto antes", "com pressa", "último dia", "prazo final", "prazo encerra",
  "com economia", "para economizar", "com desconto", "a preço barato", "com vantagem",
  "com ganho", "com lucro", "pelo melhor preço", "pelo menor preço",
  "redução de custos", "para reduzir os custos", "redução de gastos",
  "exclusivo", "informação privilegiada", "informação interna", "informações internas",
  "nos bastidores", "sabemos que", "ficamos sabendo", "fonte interna", "acesso antecipado", "sem burocracia",
  "você precisa", "vocês precisam", "não pode perder", "não pode deixar", "risco de perder", "perder a ata",
];

const GANCHOS: (string | null)[] = [
  null,
  RAIO_X,
  RAIO_X_RECORRENTE,
  RAIO_X_RECENTE,
  CONTRATO,
  PCA,
  ORCAMENTO,
  NOTICIA_COM_NOME,
  OBJETO_EM_CAIXA_ALTA,
  OBJETO_COM_GRITO,
  OBJETO_COM_URGENCIA,
  OBJETO_LONGO,
  OBJETO_COM_GARANTIA,
  OBJETO_COM_CONTATO,
];

const CATEGORIAS: (string | null)[] = [
  null,
  ...CATEGORIAS_ATAS.map((c) => c.slug),
  "categoria-fora-da-lista",
  "LIMPEZA GERAL DE PRÉDIOS",
  "   ",
];

/** Todas as combinações que o sistema pode gerar. */
function todasAsVariacoes() {
  const saida: { cargo: string | null; categoria: string | null; gancho: string | null; titulo: string; texto: string }[] = [];
  for (const cargo of CARGOS) {
    for (const categoria of CATEGORIAS) {
      for (const gancho of GANCHOS) {
        saida.push({ cargo, categoria, gancho, ...abordagemSugerida(cargo, categoria, gancho) });
      }
    }
  }
  return saida;
}

/** Minúsculas e sem acento, para a varredura não depender de como a palavra foi escrita. */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Palavras e padrões que nunca podem aparecer (comparados no texto normalizado).
const PROIBIDOS: { rotulo: string; padrao: RegExp }[] = [
  { rotulo: "sem licitação / sem novo certame", padrao: /sem (nova |novo |abrir (uma )?(nova |novo )?)?(licitacao|certame|processo licitatorio)|sem licitar/ },
  { rotulo: "garantia", padrao: /garant/ },
  { rotulo: "apelo de oportunidade", padrao: /imperdivel|oportunidade unica|ultima chance|ultimas? (vagas|unidades)|aproveite|nao perca|nao deixe/ },
  { rotulo: "pressa", padrao: /\bcorra\b|so hoje|\bhoje mesmo\b|urgente|urgencia|imediat|o quanto antes|com pressa|ultimo dia|prazo (acaba|encerra|esgota|final)/ },
  { rotulo: "promessa de economia ou de ganho", padrao: /economi(a|z)|desconto|barato|vantagem|\bganho|lucro|melhor preco|menor preco|\b(reduc|reduz)\w* (\w+ )?(\w+ )?(custo|gasto)/ },
  { rotulo: "insinuação de informação interna", padrao: /exclusiv|privilegiad|informacao interna|informacoes internas|bastidor|sabemos que|ficamos sabendo|fontes? internas?|acesso antecipado|sem burocracia/ },
  { rotulo: "pressão", padrao: /voce precisa|voces precisam|nao pode (perder|deixar)|risco de perder|perder a ata/ },
];

// Siglas que podem aparecer em caixa alta; qualquer outra palavra de 4 letras ou mais em maiúsculas é grito.
const SIGLAS_PERMITIDAS = ["PNCP", "SICONFI", "REURB"];

const TAMANHO_MAXIMO = 850;

describe("abordagemSugerida", () => {
  it("usa o cargo e a categoria da ata", () => {
    const a = abordagemSugerida(CARGO_EDUCACAO, "kit-escolar", null);
    expect(a.titulo).toContain("Educação");
    expect(a.texto).toContain("Secretário(a) de Educação");
    expect(a.texto.toLowerCase()).toContain("kit escolar");
    expect(a.texto).toContain("art. 86");
  });

  it("cita o dado público do 'por que agora' e a fonte, depois da identificação", () => {
    const a = abordagemSugerida(CARGO_PREFEITO, "veiculos", "Contratou veículos há 30 meses");
    expect(a.texto).toContain("Em consulta ao PNCP (fonte pública), vi que o município contratou veículos há 30 meses.");
    expect(a.texto.indexOf("plataforma privada")).toBeLessThan(a.texto.indexOf("Em consulta ao PNCP"));
  });

  it("cargo desconhecido ou nulo cai no texto genérico", () => {
    expect(abordagemSugerida(null, null, null).titulo).toBe("Abordagem sugerida");
    expect(abordagemSugerida("Cargo que o sistema não conhece", null, null).titulo).toBe("Abordagem sugerida");
  });

  it("mantém um título e um texto próprios para cada cargo", () => {
    const resultados = [CARGO_EDUCACAO, CARGO_SAUDE, CARGO_ADMINISTRACAO, CARGO_PREFEITO, null].map((c) =>
      abordagemSugerida(c, "limpeza", null),
    );
    expect(new Set(resultados.map((r) => r.titulo)).size).toBe(5);
    expect(new Set(resultados.map((r) => r.texto)).size).toBe(5);
    expect(resultados[0].titulo).toContain("Educação");
    expect(resultados[1].titulo).toContain("Saúde");
    expect(resultados[2].titulo).toContain("Administração/Finanças");
    expect(resultados[3].titulo).toContain("Prefeito(a)");
  });

  it("trata o agente público só pelo cargo", () => {
    expect(abordagemSugerida(CARGO_SAUDE, "material-hospitalar", null).texto).toContain("Prezado(a) Secretário(a) de Saúde,");
    expect(abordagemSugerida(CARGO_PREFEITO, null, null).texto).toContain("Prezado(a) Prefeito(a),");
    expect(abordagemSugerida(null, null, null).texto).toContain("Prezado(a) responsável,");
  });

  it("sem categoria, não repete 'objeto desta ata' e a frase continua inteira", () => {
    const a = abordagemSugerida(CARGO_ADMINISTRACAO, null, null);
    expect(a.texto).not.toContain("objeto desta ata");
    expect(a.texto).toContain("Há uma ata de registro de preços que pode ser do interesse da área de administração e finanças.");
  });

  it("mantém siglas e nomes compostos da categoria como estão", () => {
    expect(abordagemSugerida(null, "equipamento-ti", null).texto).toContain("equipamento de TI");
    expect(abordagemSugerida(null, "reurb", null).texto).toContain("REURB (regularização fundiária)");
    expect(abordagemSugerida(null, "nr1", null).texto).toContain("NR-1 (segurança ocupacional)");
    expect(abordagemSugerida(null, "ovos-de-pascoa", null).texto).toContain("ovos de Páscoa");
  });
});

describe("abordagemSugerida: fonte pública do sinal", () => {
  it("raio-X recorrente: cita só o fato, sem a conclusão interna", () => {
    const t = abordagemSugerida(CARGO_ADMINISTRACAO, "veiculos", RAIO_X_RECORRENTE).texto;
    expect(t).toContain("Em consulta ao PNCP (fonte pública), vi que o município contratou veículos e frota há 26 meses.");
    expect(t).not.toContain("em aberto");
    expect(t).not.toContain("recorrente");
  });

  it("raio-X recente", () => {
    expect(abordagemSugerida(null, "combustivel", RAIO_X_RECENTE).texto).toContain(
      "vi que o município contratou combustível há pouco tempo.",
    );
  });

  it("contrato: cita o PNCP, a data de término da vigência e o objeto", () => {
    expect(abordagemSugerida(CARGO_ADMINISTRACAO, "veiculos", CONTRATO).texto).toContain(
      "Em consulta ao PNCP (fonte pública), vi um contrato do município com término de vigência em 01/12/2026 (objeto: Locação de veículos).",
    );
  });

  it("PCA: cita o PNCP e o plano de contratações", () => {
    expect(abordagemSugerida(CARGO_ADMINISTRACAO, "material-escritorio", PCA).texto).toContain(
      "Em consulta ao PNCP (fonte pública), vi, no plano de contratações anual (PCA) do município, uma previsão para 11/2026: Material de expediente.",
    );
  });

  it("orçamento: cita o SICONFI e o ano, sem repetir o percentual de crescimento", () => {
    const t = abordagemSugerida(CARGO_SAUDE, "material-hospitalar", ORCAMENTO).texto;
    expect(t).toContain("Em consulta ao SICONFI (fonte pública), vi os dados de despesa do município em 2026, na área de Saúde.");
    expect(t).not.toContain("45%");
    expect(t).not.toContain("cresceu");
  });

  it("texto de origem desconhecida (notícia, digitado à mão) não entra na mensagem", () => {
    const t = abordagemSugerida(CARGO_PREFEITO, "kit-escolar", NOTICIA_COM_NOME).texto;
    expect(t).not.toContain("João");
    expect(t).not.toContain("Silva");
    expect(t).not.toContain("Em consulta");
    expect(t).toBe(abordagemSugerida(CARGO_PREFEITO, "kit-escolar", null).texto);
  });

  it("palavras em caixa alta do PNCP viram minúsculas e o grito sai", () => {
    const caixaAlta = abordagemSugerida(CARGO_SAUDE, null, OBJETO_EM_CAIXA_ALTA).texto;
    expect(caixaAlta).toContain("(objeto: locação de veículos para a secretaria de saúde).");
    const grito = abordagemSugerida(CARGO_SAUDE, null, OBJETO_COM_GRITO).texto;
    expect(grito).toContain("(objeto: Aquisição de merenda).");
    expect(grito).not.toContain("!");
    // Texto misto: só a palavra gritada muda; sigla curta e sigla conhecida ficam.
    const misto = abordagemSugerida(CARGO_SAUDE, null, "Contrato vence em 15/03/2027: Compra de EPI para a UBS Central, com ENTREGA PARCELADA e acompanhamento mensal").texto;
    expect(misto).toContain("(objeto: Compra de EPI para a UBS Central, com entrega parcelada e acompanhamento mensal).");
    // Tudo em caixa alta: sigla conhecida volta em caixa alta, o resto em minúsculas.
    const tudo = abordagemSugerida(CARGO_SAUDE, null, "Contrato vence em 15/03/2027: AQUISIÇÃO DE EPI PARA A UBS CENTRAL E O SUS").texto;
    expect(tudo).toContain("(objeto: aquisição de EPI para a UBS central e o SUS).");
  });

  it("registro público que traz expressão proibida não é repetido", () => {
    const t = abordagemSugerida(CARGO_SAUDE, null, OBJETO_COM_URGENCIA).texto;
    expect(t).not.toContain("Em consulta");
    expect(normalizar(t)).not.toContain("urgente");
  });

  it("a lista de frases hostis do teste é pega pela própria varredura", () => {
    for (const frase of FRASES_PROIBIDAS) {
      const alvo = normalizar(frase);
      expect(PROIBIDOS.some(({ padrao }) => padrao.test(alvo)), frase).toBe(true);
    }
  });

  it("cada expressão proibida, vinda de um registro público, derruba a frase da fonte", () => {
    for (const frase of FRASES_PROIBIDAS) {
      const objeto = `Aquisição de materiais, ${frase}`;
      for (const formato of [
        `Contrato vence em 15/03/2027: ${objeto}`,
        `Compra prevista no PCA 2026 para 11/2026: ${objeto}`,
      ]) {
        const t = abordagemSugerida(CARGO_ADMINISTRACAO, "limpeza", formato).texto;
        expect(t, formato).not.toContain("Em consulta");
        const alvo = normalizar(t);
        for (const { rotulo, padrao } of PROIBIDOS) {
          expect(padrao.test(alvo), `${rotulo} em [${formato}]: ${t}`).toBe(false);
        }
      }
    }
    // O raio-X e o orçamento também passam pela mesma trava.
    const raioX = abordagemSugerida(null, "limpeza", "Contratou serviço imediato há 30 meses").texto;
    expect(raioX).not.toContain("Em consulta");
    const orcamento = abordagemSugerida(null, "limpeza", "Orçamento 2026: despesa com Saúde exclusiva cresceu 45% (R$ 2.300.000)").texto;
    expect(orcamento).not.toContain("Em consulta");
  });

  it("e-mail, CPF e telefone que vierem no texto público não vão na mensagem", () => {
    for (const lixo of ["contato joao@exemplo.com.br", "responsável CPF 123.456.789-09", "ligar (62) 99999-9999"]) {
      const t = abordagemSugerida(CARGO_ADMINISTRACAO, "limpeza", `Contrato vence em 15/03/2027: Serviço de limpeza; ${lixo}`).texto;
      expect(t, lixo).not.toContain("Em consulta");
      expect(t, lixo).not.toMatch(/@|\d{3}\.\d{3}\.\d{3}|\(\d{2}\)/);
    }
    // Número de processo comum no objeto não é dado pessoal e continua sendo citado.
    const ok = abordagemSugerida(CARGO_ADMINISTRACAO, "limpeza", "Contrato vence em 15/03/2027: Serviço de limpeza, processo 1234/2026").texto;
    expect(ok).toContain("(objeto: Serviço de limpeza, processo 1234/2026).");
  });

  it("raio-X: o rótulo da categoria volta com as siglas certas e igual ao da frase da ata", () => {
    expect(abordagemSugerida(null, "equipamento-ti", "Contratou equipamento de ti há 30 meses").texto).toContain(
      "vi que o município contratou equipamento de TI há 30 meses.",
    );
    expect(abordagemSugerida(null, "reurb", "Contratou reurb (regularização fundiária) há 25 meses").texto).toContain(
      "vi que o município contratou REURB (regularização fundiária) há 25 meses.",
    );
    for (const c of CATEGORIAS_ATAS) {
      const t = abordagemSugerida(null, c.slug, `Contratou ${c.rotulo.toLowerCase()} há 30 meses`).texto;
      const citado = t.match(/o município contratou (.+?) há 30 meses\./)?.[1];
      expect(citado, t).toBeTruthy();
      expect(t, t).toContain(`uma ata de registro de preços de ${citado}`);
    }
  });

  it("categoria fora do vocabulário não vaza código cru nem caixa alta", () => {
    const slug = abordagemSugerida(null, "categoria-fora-da-lista", null).texto;
    expect(slug).toContain("ata de registro de preços de categoria fora da lista.");
    expect(slug).not.toContain("categoria-fora-da-lista");
    const grito = abordagemSugerida(null, "LIMPEZA GERAL DE PRÉDIOS", null).texto;
    expect(grito).toContain("ata de registro de preços de limpeza geral de prédios.");
    const vazia = abordagemSugerida(null, "   ", null).texto;
    expect(vazia).toContain("Há uma ata de registro de preços. ");
  });

  it("objeto muito longo é resumido", () => {
    const t = abordagemSugerida(CARGO_SAUDE, null, OBJETO_LONGO).texto;
    expect(t).toContain("(objeto: Fornecimento de material permanente");
    expect(t).toContain("…)");
  });
});

describe("abordagemSugerida: tom em todas as variações", () => {
  const variacoes = todasAsVariacoes();

  it("gera todas as combinações de cargo, categoria e sinal", () => {
    expect(variacoes.length).toBe(CARGOS.length * CATEGORIAS.length * GANCHOS.length);
    expect(variacoes.length).toBeGreaterThan(1000);
  });

  it("nenhuma palavra ou padrão proibido aparece, no título nem no texto", () => {
    for (const v of variacoes) {
      const alvo = normalizar(`${v.titulo} ${v.texto}`);
      for (const { rotulo, padrao } of PROIBIDOS) {
        expect(padrao.test(alvo), `${rotulo} em [${v.cargo} | ${v.categoria} | ${v.gancho}]: ${v.texto}`).toBe(false);
      }
    }
  });

  it("se identifica como plataforma privada, que não é órgão público nem o PNCP, logo no começo", () => {
    for (const v of variacoes) {
      const antes = v.texto.indexOf("plataforma privada");
      expect(antes, v.texto).toBeGreaterThan(-1);
      // Identificação vem antes de qualquer dado, motivo ou base legal.
      expect(antes, v.texto).toBeLessThan(120);
      expect(v.texto.indexOf("não sou órgão público nem falo pelo PNCP"), v.texto).toBeGreaterThan(antes);
      expect(v.texto.indexOf("Prezado(a) "), v.texto).toBe(0);
    }
  });

  it("diz que a adesão é caminho previsto em lei e que a decisão e a instrução são do órgão", () => {
    for (const v of variacoes) {
      expect(v.texto, v.texto).toContain("Lei 14.133/2021, art. 86");
      expect(v.texto, v.texto).toContain("caminho previsto em lei");
      expect(v.texto, v.texto).toContain("a decisão e a instrução do processo cabem ao órgão");
    }
  });

  it("oferece a ata e o modelo de documentos e pergunta quem é o responsável", () => {
    for (const v of variacoes) {
      expect(v.texto, v.texto).toContain("Posso enviar as informações da ata e o modelo de documentos?");
      expect(v.texto, v.texto).toMatch(/responsável[^?]*\?$/);
    }
  });

  it("só cita fonte pública conhecida, e a fonte vem na mesma frase do dado", () => {
    for (const v of variacoes) {
      const citou = v.texto.match(/Em consulta ao (\w+) \(fonte pública\)/);
      if (citou) expect(["PNCP", "SICONFI"], v.texto).toContain(citou[1]);
    }
  });

  it("cabe numa mensagem curta", () => {
    for (const v of variacoes) {
      expect(v.texto.length, `${v.texto.length} caracteres: ${v.texto}`).toBeLessThanOrEqual(TAMANHO_MAXIMO);
    }
  });

  it("sem caixa alta, sem exclamação, sem pontuação repetida nem espaço duplo", () => {
    for (const v of variacoes) {
      const semSiglas = SIGLAS_PERMITIDAS.reduce((t, s) => t.split(s).join(""), `${v.titulo} ${v.texto}`);
      expect(semSiglas, v.texto).not.toMatch(/[A-ZÀ-Ý]{4,}/);
      expect(v.texto, v.texto).not.toContain("!");
      expect(v.texto, v.texto).not.toMatch(/[?.,;:]{2}/);
      expect(v.texto, v.texto).not.toMatch(/\.\.\./);
      expect(v.texto, v.texto).not.toMatch(/\s{2,}/);
      expect(v.texto, v.texto).toBe(v.texto.trim());
    }
  });

  it("termina em frase completa", () => {
    for (const v of variacoes) {
      expect(v.texto, v.texto).toMatch(/\?$/);
      expect(v.texto, v.texto).not.toMatch(/\b(undefined|null)\b/);
    }
  });

  it("não vaza nome de pessoa vindo de texto de origem desconhecida", () => {
    for (const v of variacoes.filter((x) => x.gancho === NOTICIA_COM_NOME)) {
      expect(v.texto).not.toMatch(/João|Silva/);
    }
  });
});
