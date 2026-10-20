import { describe, expect, it } from "vitest";
import { contatoValido, lerDemanda, validarDemanda } from "./demandas";
import { destinoSeguro } from "./destino-login";
import {
  GRUPOS,
  TODOS_OS_SLUGS_MAPEADOS,
  grupoDaCategoria,
  grupoValido,
  slugsDoGrupo,
} from "./site/categorias";
import { CATEGORIAS_ATAS } from "./categorias";
import { normalizar, plural } from "./site/formato";
import {
  codigoPublico,
  saldoDoItem,
  saldoMedio,
  vigenciaCompleta,
  vigenciaPublica,
} from "./site/regras";

describe("saldo para adesão", () => {
  it("usa o limite agregado de 200% do registrado", () => {
    expect(saldoDoItem(100, 0)).toBe(1);
    expect(saldoDoItem(100, 100)).toBe(0.5);
    expect(saldoDoItem(100, 200)).toBe(0);
    // nunca fica negativo, mesmo com consumo acima do limite
    expect(saldoDoItem(100, 350)).toBe(0);
    expect(saldoDoItem(0, 0)).toBe(0);
  });

  it("calcula a média e trata lista vazia", () => {
    expect(saldoMedio([1, 0.5, 0])).toBeCloseTo(0.5);
    expect(saldoMedio([])).toBe(0);
  });
});

describe("vigência exibida", () => {
  it("ao visitante mostra só faixas, nunca datas nem dias exatos", () => {
    expect(vigenciaPublica(10)).toMatchObject({ linha1: "menos de 30 dias", tom: "atencao" });
    expect(vigenciaPublica(60).linha1).toBe("até 3 meses");
    expect(vigenciaPublica(120).linha1).toBe("3 a 6 meses");
    expect(vigenciaPublica(400).linha1).toBe("mais de 6 meses");
    for (const dias of [10, 60, 120, 400]) {
      const v = vigenciaPublica(dias);
      expect(`${v.linha1}${v.linha2 ?? ""}`).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    }
  });

  it("à equipe mostra data e dias restantes", () => {
    const fim = new Date("2027-03-05T12:00:00Z");
    const fmt = () => "05/03/2027";
    expect(vigenciaCompleta(fim, 100, fmt)).toMatchObject({ tom: "", linha1: "até 05/03/2027", linha2: "100 dias" });
    expect(vigenciaCompleta(fim, 3, fmt)).toMatchObject({ tom: "alerta", linha2: "faltam 3 dias" });
    expect(vigenciaCompleta(fim, 1, fmt).linha2).toBe("faltam 1 dia");
    expect(vigenciaCompleta(fim, 0, fmt).linha1).toBe("último dia de vigência");
    expect(vigenciaCompleta(fim, -2, fmt)).toMatchObject({ tom: "critico", linha1: "vencida em 05/03/2027" });
  });
});

describe("código público da ata", () => {
  it("é estável, curto e não contém o id interno", () => {
    const id = "cmvgps9g70000bfwsljdjp455";
    expect(codigoPublico(id)).toBe(codigoPublico(id));
    expect(codigoPublico(id)).toMatch(/^[0-9A-Z]{6}$/);
    expect(codigoPublico(id)).not.toBe(codigoPublico("cmvgps9g70000bfwsljdjp456"));
    expect(id.toUpperCase()).not.toContain(codigoPublico(id));
  });
});

describe("categorias do site", () => {
  it("toda categoria do sistema cai em um grupo existente", () => {
    for (const c of CATEGORIAS_ATAS) {
      expect(grupoValido(grupoDaCategoria(c.slug))).toBe(true);
    }
  });

  it("atas sem categoria ou desconhecidas vão para 'outros'", () => {
    expect(grupoDaCategoria(null)).toBe("outros");
    expect(grupoDaCategoria("categoria-que-nao-existe")).toBe("outros");
    expect(slugsDoGrupo("outros")).toEqual([]);
  });

  it("slugs mapeados e filtro de grupo são coerentes", () => {
    expect(grupoDaCategoria("material-hospitalar")).toBe("saude");
    expect(slugsDoGrupo("saude")).toContain("material-hospitalar");
    expect(TODOS_OS_SLUGS_MAPEADOS).toContain("material-hospitalar");
    expect(new Set(GRUPOS.map((g) => g.id)).size).toBe(GRUPOS.length);
  });
});

describe("formato", () => {
  it("normaliza acentos e caixa", () => {
    expect(normalizar("Alimentação Escolar")).toBe("alimentacao escolar");
    expect(normalizar(null)).toBe("");
  });
  it("pluraliza", () => {
    expect(plural(1, "ata", "atas")).toBe("1 ata");
    expect(plural(12, "ata", "atas")).toBe("12 atas");
  });
});

describe("formulário 'Não achei a ata'", () => {
  function form(campos: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  }
  const valido = {
    objeto: "Luminárias LED de 150 W",
    orgao: "Prefeitura de Pedra Alta",
    nome: "Maria Souza",
    contato: "maria@pedraalta.go.gov.br",
  };

  it("aceita o mínimo obrigatório", () => {
    expect(validarDemanda(lerDemanda(form(valido)))).toEqual({});
  });

  it("exige objeto, órgão, nome e contato", () => {
    const erros = validarDemanda(lerDemanda(form({})));
    expect(Object.keys(erros).sort()).toEqual(["contato", "nome", "objeto", "orgao"]);
  });

  it("valida contato como e-mail ou telefone com DDD", () => {
    expect(contatoValido("a@b.com")).toBe(true);
    expect(contatoValido("(62) 3636-2671")).toBe(true);
    expect(contatoValido("+55 62 99999-0000")).toBe(true);
    expect(contatoValido("12345")).toBe(false);
    expect(contatoValido("sem-arroba")).toBe(false);
  });

  it("recusa UF e prazo fora da lista e limita tamanhos", () => {
    const erros = validarDemanda(lerDemanda(form({ ...valido, uf: "ZZ", prazo: "qualquer" })));
    expect(erros.uf).toBeDefined();
    expect(erros.prazo).toBeDefined();
    const longo = lerDemanda(form({ ...valido, objeto: "x".repeat(5000), obs: "y".repeat(9000) }));
    expect(longo.objeto.length).toBe(300);
    expect(longo.observacoes.length).toBe(2000);
  });
});

describe("destino depois do login", () => {
  it("aceita caminhos internos da própria área", () => {
    expect(destinoSeguro("/orgao/pedido/novo?itemId=abc123", "orgao", "/orgao")).toBe(
      "/orgao/pedido/novo?itemId=abc123",
    );
    expect(destinoSeguro("/fornecedor", "fornecedor", "/fornecedor")).toBe("/fornecedor");
  });

  it("o órgão pode voltar à página da ata de onde veio, mas só a ela", () => {
    expect(destinoSeguro("/catalogo/cmvh1t6uc0004bf1sikbxv4mw", "orgao", "/orgao")).toBe(
      "/catalogo/cmvh1t6uc0004bf1sikbxv4mw",
    );
    // outras páginas do catálogo, ids curtos ou com sobra não passam
    expect(destinoSeguro("/catalogo", "orgao", "/orgao")).toBe("/orgao");
    expect(destinoSeguro("/catalogo/abc", "orgao", "/orgao")).toBe("/orgao");
    expect(destinoSeguro("/catalogo/cmvh1t6uc0004bf1sikbxv4mw/x", "orgao", "/orgao")).toBe("/orgao");
    expect(destinoSeguro("/catalogo/cmvh1t6uc0004bf1sikbxv4mw", "fornecedor", "/fornecedor")).toBe("/fornecedor");
  });

  it("recusa endereço externo, outra área e truques de caminho", () => {
    const padrao = "/orgao";
    for (const ruim of [
      "https://malicioso.com",
      "//malicioso.com",
      "/\\malicioso.com",
      "/admin",
      "/orgao/../admin",
      "/orgao//x",
      "/orgao?x=<script>",
      "javascript:alert(1)",
    ]) {
      expect(destinoSeguro(ruim, "orgao", padrao)).toBe(padrao);
    }
    expect(destinoSeguro(null, "orgao", padrao)).toBe(padrao);
    expect(destinoSeguro("/fornecedor", "orgao", padrao)).toBe(padrao);
  });
});
