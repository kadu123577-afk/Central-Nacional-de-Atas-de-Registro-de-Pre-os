import { describe, expect, it } from "vitest";
import { ESTADOS, dadosDaEntidade, escolherNovos, lerPopulacaoIbge, resolverUfs, type MunicipioIbge } from "./ampliar-municipios";

const serie = (id: string, nome: string, populacao: unknown, ano = "2026") => ({
  localidade: { id, nivel: { id: "N6", nome: "Município" }, nome },
  serie: { [ano]: populacao },
});
const resposta = (series: unknown[]) => [{ id: "9324", resultados: [{ classificacoes: [], series }] }];

describe("ESTADOS", () => {
  it("são os 27, com siglas e códigos únicos", () => {
    expect(ESTADOS).toHaveLength(27);
    expect(new Set(ESTADOS.map((e) => e.sigla)).size).toBe(27);
    expect(new Set(ESTADOS.map((e) => e.codigo)).size).toBe(27);
    expect(ESTADOS.find((e) => e.sigla === "GO")?.codigo).toBe(52);
  });
});

describe("resolverUfs", () => {
  it("lê siglas separadas por vírgula, sem repetir e na ordem pedida", () => {
    const r = resolverUfs(" sp, rj ,SP ");
    expect(r.ok && r.ufs.map((u) => u.sigla)).toEqual(["SP", "RJ"]);
  });

  it("'todas' traz todos menos o DF, que é órgão distrital e entra à parte", () => {
    const r = resolverUfs("todas");
    expect(r.ok && r.ufs).toHaveLength(26);
    expect(r.ok && r.ufs.some((u) => u.sigla === "DF")).toBe(false);
  });

  it.each([[undefined], [""], ["   "]])("sem nada informado (%s) pede a UF", (v) => {
    const r = resolverUfs(v);
    expect(!r.ok && r.erro).toContain("UF=");
  });

  it("recusa sigla desconhecida e o DF", () => {
    expect(resolverUfs("GO,XX")).toEqual({ ok: false, erro: 'UF desconhecida: "XX".' });
    const df = resolverUfs("DF");
    expect(!df.ok && df.erro).toContain("distrital");
  });
});

describe("lerPopulacaoIbge", () => {
  it("lê código, município, UF e a população do ano mais recente", () => {
    const r = lerPopulacaoIbge(
      resposta([
        serie("5200050", "Abadia de Goiás - GO", "22918"),
        serie("5208707", "Goiânia - GO", { "x": 1 } as unknown),
      ]),
    );
    expect(r[0]).toEqual({ codigo: "5200050", municipio: "Abadia de Goiás", uf: "GO", populacao: 22918 });
    expect(r).toHaveLength(1);
  });

  it("o nome com hífen no meio fica inteiro: só o último ' - ' separa a UF", () => {
    const [m] = lerPopulacaoIbge(resposta([serie("3500000", "Ribeirão do Pinhal - Norte - SP", "100")]));
    expect(m).toMatchObject({ municipio: "Ribeirão do Pinhal - Norte", uf: "SP" });
  });

  it("com mais de um ano, vale o mais recente", () => {
    const s = { localidade: { id: "5200050", nome: "Abadia de Goiás - GO" }, serie: { "2024": "20000", "2026": "22918", "2025": "21000" } };
    expect(lerPopulacaoIbge(resposta([s]))[0].populacao).toBe(22918);
  });

  it.each([
    ["população '-'", serie("5200050", "A - GO", "-")],
    ["população zero", serie("5200050", "A - GO", "0")],
    ["código que não tem 7 dígitos", serie("52000", "A - GO", "10")],
    ["nome sem UF", serie("5200050", "Abadia de Goiás", "10")],
  ])("deixa de fora: %s", (_nome, s) => {
    expect(lerPopulacaoIbge(resposta([s]))).toEqual([]);
  });

  it("resposta que não tem a forma esperada vira lista vazia, sem lançar", () => {
    for (const v of [null, undefined, {}, [], [{}], [{ resultados: [] }], "texto", 7]) {
      expect(lerPopulacaoIbge(v)).toEqual([]);
    }
  });
});

describe("escolherNovos", () => {
  const C: MunicipioIbge[] = [
    { codigo: "1", municipio: "Grande", uf: "GO", populacao: 300_000 },
    { codigo: "2", municipio: "Medio", uf: "GO", populacao: 50_000 },
    { codigo: "3", municipio: "Pequeno", uf: "GO", populacao: 3_000 },
    { codigo: "4", municipio: "Outro Medio", uf: "GO", populacao: 50_000 },
  ];

  it("só o que ainda não está na base, os mais populosos primeiro (empate por nome)", () => {
    const r = escolherNovos(C, new Set(["2"]));
    expect(r.map((m) => m.municipio)).toEqual(["Grande", "Outro Medio", "Pequeno"]);
    expect(escolherNovos(C, new Set()).map((m) => m.municipio)).toEqual(["Grande", "Medio", "Outro Medio", "Pequeno"]);
  });

  it("respeita a faixa de população, com os limites incluídos", () => {
    expect(escolherNovos(C, new Set(), { minPop: 50_000, maxPop: 300_000 }).map((m) => m.municipio)).toEqual(["Grande", "Medio", "Outro Medio"]);
    expect(escolherNovos(C, new Set(), { maxPop: 10_000 }).map((m) => m.municipio)).toEqual(["Pequeno"]);
  });

  it("o limite corta nos maiores", () => {
    expect(escolherNovos(C, new Set(), { limite: 2 }).map((m) => m.municipio)).toEqual(["Grande", "Medio"]);
    expect(escolherNovos(C, new Set(), { limite: 0 })).toEqual([]);
  });

  it("não altera a lista recebida", () => {
    const antes = C.map((m) => m.codigo);
    escolherNovos(C, new Set());
    expect(C.map((m) => m.codigo)).toEqual(antes);
  });
});

describe("dadosDaEntidade", () => {
  it("monta o cadastro como o primeiro lote montou", () => {
    expect(dadosDaEntidade({ codigo: "5200050", municipio: "Abadia de Goiás", uf: "GO", populacao: 1 })).toEqual({
      nome: "Prefeitura de Abadia de Goiás",
      tipo: "municipal",
      esfera: "municipal",
      uf: "GO",
      municipio: "Abadia de Goiás",
      codigoIbgeMunicipio: "5200050",
    });
  });
});
