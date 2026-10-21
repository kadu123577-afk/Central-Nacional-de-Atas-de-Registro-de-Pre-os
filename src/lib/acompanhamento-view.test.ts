import { describe, expect, it } from "vitest";
import {
  EXPLICACAO_NIVEL,
  dataHoraBrasilia,
  dataSoDia,
  distribuirLimite,
  formatarCnpj,
  moedaReais,
  nivelConhecido,
  nomeFornecedorParaTela,
  paraNumero,
  rotuloDoNivel,
  rotuloStatusVinculo,
  rotuloTipoTermo,
  textoVigencia,
  tomDoNivel,
  tomDoStatusVinculo,
} from "./acompanhamento-view";
import { NIVEIS_VINCULO } from "./acompanhamento";

describe("níveis do vínculo", () => {
  it("reconhece só os três níveis da regra", () => {
    expect(nivelConhecido("certo")).toBe(true);
    expect(nivelConhecido("forte")).toBe(true);
    expect(nivelConhecido("desvio")).toBe(true);
    expect(nivelConhecido("fraco")).toBe(false);
  });

  it("usa o rótulo da regra e devolve o texto cru para nível desconhecido", () => {
    expect(rotuloDoNivel("desvio")).toBe("Possível desvio do funil");
    expect(rotuloDoNivel("outro")).toBe("outro");
  });

  it("desvio fica em atenção, certo na marca e o resto neutro", () => {
    expect(tomDoNivel("certo")).toBe("marca");
    expect(tomDoNivel("forte")).toBe("neutro");
    expect(tomDoNivel("desvio")).toBe("atencao");
    expect(tomDoNivel("qualquer")).toBe("neutro");
  });

  it("tem uma explicação para cada nível", () => {
    for (const nivel of NIVEIS_VINCULO) expect(EXPLICACAO_NIVEL[nivel].length).toBeGreaterThan(10);
  });
});

describe("status do vínculo", () => {
  it("traduz o status e escolhe o tom", () => {
    expect(rotuloStatusVinculo("sugerido")).toBe("A confirmar");
    expect(rotuloStatusVinculo("confirmado")).toBe("Confirmado");
    expect(rotuloStatusVinculo("descartado")).toBe("Descartado");
    expect(rotuloStatusVinculo("x")).toBe("x");
    expect(tomDoStatusVinculo("confirmado")).toBe("marca");
    expect(tomDoStatusVinculo("descartado")).toBe("neutro");
    expect(tomDoStatusVinculo("sugerido")).toBe("atencao");
  });
});

describe("distribuirLimite", () => {
  it("serve o primeiro grupo antes dos demais", () => {
    expect(distribuirLimite([150, 100, 80], 200)).toEqual([150, 50, 0]);
  });

  it("não passa do total de cada grupo", () => {
    expect(distribuirLimite([2, 0, 3], 200)).toEqual([2, 0, 3]);
  });

  it("limite zero ou negativo não busca nada", () => {
    expect(distribuirLimite([5, 5], 0)).toEqual([0, 0]);
    expect(distribuirLimite([5, 5], -3)).toEqual([0, 0]);
  });

  it("ignora totais negativos", () => {
    expect(distribuirLimite([-4, 3], 10)).toEqual([0, 3]);
  });
});

describe("rotuloTipoTermo", () => {
  it("traduz os tipos que o script grava", () => {
    expect(rotuloTipoTermo("aditivo_valor")).toBe("Aditivo de valor");
    expect(rotuloTipoTermo("aditivo_prazo")).toBe("Aditivo de prazo");
  });

  it("deixa legível um tipo desconhecido", () => {
    expect(rotuloTipoTermo("apostilamento_reajuste")).toBe("Apostilamento reajuste");
    expect(rotuloTipoTermo("")).toBe("Termo");
  });
});

describe("nomeFornecedorParaTela", () => {
  it("mantém o nome de empresa", () => {
    expect(nomeFornecedorParaTela("ALFA COMERCIO DE MATERIAIS LTDA")).toBe("ALFA COMERCIO DE MATERIAIS LTDA");
    expect(nomeFornecedorParaTela("pessoa física")).toBe("pessoa física");
  });

  it("retira o CPF que o MEI carrega na razão social", () => {
    expect(nomeFornecedorParaTela("FULANO DE TAL 12345678901")).toBe("FULANO DE TAL");
    expect(nomeFornecedorParaTela("FULANO DE TAL 123.456.789-01 ME")).toBe("FULANO DE TAL ME");
  });

  it("não confunde CNPJ de 14 dígitos com CPF", () => {
    expect(nomeFornecedorParaTela("EMPRESA 11222333000181")).toBe("EMPRESA 11222333000181");
  });

  it("vazio vira null", () => {
    expect(nomeFornecedorParaTela(null)).toBeNull();
    expect(nomeFornecedorParaTela("   ")).toBeNull();
    expect(nomeFornecedorParaTela("12345678901")).toBeNull();
  });
});

describe("formatarCnpj", () => {
  it("formata 14 dígitos, com ou sem pontuação", () => {
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81");
  });

  it("não mostra CPF nem valor vazio", () => {
    expect(formatarCnpj("12345678901")).toBeNull();
    expect(formatarCnpj("")).toBeNull();
    expect(formatarCnpj(null)).toBeNull();
  });
});

describe("valores e datas", () => {
  it("converte Decimal/string/number em número", () => {
    expect(paraNumero(1234.5)).toBe(1234.5);
    expect(paraNumero({ toString: () => "98765.43" })).toBe(98765.43);
    expect(paraNumero(null)).toBeNull();
    expect(paraNumero(undefined)).toBeNull();
    expect(paraNumero("abc")).toBeNull();
  });

  it("formata moeda em reais e traço quando não há valor", () => {
    expect(moedaReais(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(moedaReais(null)).toBe("—");
  });

  it("data só-dia não desloca pelo fuso", () => {
    expect(dataSoDia(new Date("2026-12-31T00:00:00Z"))).toBe("31/12/2026");
    expect(dataSoDia(null)).toBe("—");
  });

  it("momento da decisão sai no horário de Brasília", () => {
    expect(dataHoraBrasilia(new Date("2026-10-21T15:30:00Z"))).toBe("21/10/2026 12:30");
    expect(dataHoraBrasilia(new Date("2026-10-21T03:00:00Z"))).toBe("21/10/2026 00:00");
    expect(dataHoraBrasilia(null)).toBe("—");
  });

  it("descreve a vigência com o que houver", () => {
    const inicio = new Date("2026-01-01T00:00:00Z");
    const fim = new Date("2026-12-31T00:00:00Z");
    expect(textoVigencia(inicio, fim)).toBe("01/01/2026 a 31/12/2026");
    expect(textoVigencia(null, fim)).toBe("até 31/12/2026");
    expect(textoVigencia(inicio, null)).toBe("desde 01/01/2026");
    expect(textoVigencia(null, null)).toBe("Vigência não informada");
  });
});
