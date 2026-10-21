import { describe, expect, it } from "vitest";
import {
  MENSAGEM_COBRANCA_SEM_PAGAMENTO_ENTE,
  ONDE_LIQUIDACAO_AGUARDANDO_PAGAMENTO_ENTE,
  ONDE_LIQUIDACAO_A_COBRAR,
  contarPorSituacao,
  interpretarDataLiquidacao,
  interpretarDataPagamentoEnte,
  lerDiaAAAAMMDD,
  motivoParaRecusarCobranca,
  resumirComissao,
  situacaoDaLiquidacao,
  statusCobrancaValido,
  tipoLiquidacaoValido,
} from "./recebiveis";

describe("resumirComissao", () => {
  it("aplica o mesmo percentual a original, aditivo e renovação", () => {
    const r = resumirComissao(
      [
        { valorLiquidado: 1000, statusCobranca: "recebida" },
        { valorLiquidado: 500, statusCobranca: "cobrada" },
        { valorLiquidado: 500, statusCobranca: "pendente" },
      ],
      0.1,
    );
    expect(r.devida).toBeCloseTo(200);
    expect(r.recebida).toBeCloseTo(100);
    expect(r.faltaReceber).toBeCloseTo(100);
  });

  it("é zero sem liquidações", () => {
    expect(resumirComissao([], 0.1)).toEqual({ devida: 0, recebida: 0, faltaReceber: 0 });
  });

  it("sem dataPagamentoEnte na entrada, não inventa os campos novos (retrocompatível)", () => {
    const r = resumirComissao([{ valorLiquidado: 1000, statusCobranca: "pendente" }], 0.1);
    expect(r).not.toHaveProperty("aCobrar");
    expect(r).not.toHaveProperty("aguardandoPagamentoEnte");
  });

  it("separa 'a cobrar' (ente já pagou) de 'aguardando pagamento do ente'", () => {
    const r = resumirComissao(
      [
        { valorLiquidado: 1000, statusCobranca: "pendente", dataPagamentoEnte: new Date("2026-10-10T00:00:00Z") },
        { valorLiquidado: 2000, statusCobranca: "pendente", dataPagamentoEnte: null },
        { valorLiquidado: 500, statusCobranca: "cobrada", dataPagamentoEnte: new Date("2026-09-30T00:00:00Z") },
        { valorLiquidado: 4000, statusCobranca: "recebida", dataPagamentoEnte: new Date("2026-09-01T00:00:00Z") },
      ],
      0.1,
    );
    expect(r.devida).toBeCloseTo(750);
    expect(r.recebida).toBeCloseTo(400);
    expect(r.faltaReceber).toBeCloseTo(350);
    expect(r.aCobrar).toBe(100);
    expect(r.aguardandoPagamentoEnte).toBe(200);
  });

  it("liquidação antiga sem data (null) fica aguardando, não 'a cobrar'", () => {
    const r = resumirComissao([{ valorLiquidado: 3000, statusCobranca: "pendente", dataPagamentoEnte: null }], 0.05);
    expect(r.aCobrar).toBe(0);
    expect(r.aguardandoPagamentoEnte).toBe(150);
  });

  it("cobrada ou recebida sem data não conta como aguardando (já passou da porta)", () => {
    const r = resumirComissao(
      [
        { valorLiquidado: 1000, statusCobranca: "cobrada", dataPagamentoEnte: null },
        { valorLiquidado: 1000, statusCobranca: "recebida", dataPagamentoEnte: null },
      ],
      0.1,
    );
    expect(r.aCobrar).toBe(0);
    expect(r.aguardandoPagamentoEnte).toBe(0);
  });

  it("aceita a data como texto ISO e não acumula ruído de ponto flutuante", () => {
    const r = resumirComissao(
      [
        { valorLiquidado: 0.1, statusCobranca: "pendente", dataPagamentoEnte: "2026-10-10T00:00:00.000Z" },
        { valorLiquidado: 0.2, statusCobranca: "pendente", dataPagamentoEnte: "2026-10-11T00:00:00.000Z" },
      ],
      1,
    );
    expect(r.aCobrar).toBe(0.3);
    expect(r.aguardandoPagamentoEnte).toBe(0);
  });

  it("aCobrar + aguardando + cobrada + recebida fecham com a comissão devida", () => {
    const liquidacoes = [
      { valorLiquidado: 1234.56, statusCobranca: "pendente", dataPagamentoEnte: "2026-10-10" },
      { valorLiquidado: 789.01, statusCobranca: "pendente", dataPagamentoEnte: null },
      { valorLiquidado: 55.55, statusCobranca: "cobrada", dataPagamentoEnte: null },
      { valorLiquidado: 100, statusCobranca: "recebida", dataPagamentoEnte: "2026-09-01" },
    ];
    const r = resumirComissao(liquidacoes, 0.0825);
    const cobrada = resumirComissao([liquidacoes[2]], 0.0825).devida;
    expect((r.aCobrar ?? 0) + (r.aguardandoPagamentoEnte ?? 0) + cobrada + r.recebida).toBeCloseTo(r.devida, 1);
  });

  it("'a cobrar' não conta liquidação cobrada/recebida e não depende da ordem das liquidações", () => {
    const a = { valorLiquidado: 1000, statusCobranca: "pendente", dataPagamentoEnte: "2026-10-10" };
    const b = { valorLiquidado: 500, statusCobranca: "pendente", dataPagamentoEnte: null };
    const c = { valorLiquidado: 700, statusCobranca: "cobrada", dataPagamentoEnte: "2026-10-01" };
    const direto = resumirComissao([a, b, c], 0.1);
    const invertido = resumirComissao([c, b, a], 0.1);
    expect(direto.aCobrar).toBe(100);
    expect(direto.aguardandoPagamentoEnte).toBe(50);
    expect(invertido).toEqual(direto);
  });

  it("percentual zero (oportunidade sem comissão definida) zera tudo sem quebrar", () => {
    const r = resumirComissao([{ valorLiquidado: 1000, statusCobranca: "pendente", dataPagamentoEnte: null }], 0);
    expect(r).toEqual({ devida: 0, recebida: 0, faltaReceber: 0, aCobrar: 0, aguardandoPagamentoEnte: 0 });
  });
});

describe("situacaoDaLiquidacao", () => {
  it("pendente sem data aguarda o pagamento do ente", () => {
    expect(situacaoDaLiquidacao({ statusCobranca: "pendente", dataPagamentoEnte: null })).toBe(
      "aguardando_pagamento_ente",
    );
    expect(situacaoDaLiquidacao({ statusCobranca: "pendente" })).toBe("aguardando_pagamento_ente");
    expect(situacaoDaLiquidacao({ statusCobranca: "pendente", dataPagamentoEnte: "" })).toBe(
      "aguardando_pagamento_ente",
    );
  });

  it("pendente com data está a cobrar", () => {
    expect(situacaoDaLiquidacao({ statusCobranca: "pendente", dataPagamentoEnte: new Date("2026-10-10") })).toBe(
      "a_cobrar",
    );
  });

  it("cobrada e recebida valem pelo status gravado, com ou sem data", () => {
    expect(situacaoDaLiquidacao({ statusCobranca: "cobrada", dataPagamentoEnte: null })).toBe("cobrada");
    expect(situacaoDaLiquidacao({ statusCobranca: "recebida", dataPagamentoEnte: null })).toBe("recebida");
    expect(situacaoDaLiquidacao({ statusCobranca: "cobrada", dataPagamentoEnte: new Date("2026-10-10") })).toBe(
      "cobrada",
    );
  });

  it("conta por situação", () => {
    expect(
      contarPorSituacao([
        { statusCobranca: "pendente", dataPagamentoEnte: null },
        { statusCobranca: "pendente", dataPagamentoEnte: null },
        { statusCobranca: "pendente", dataPagamentoEnte: "2026-10-10" },
        { statusCobranca: "cobrada" },
        { statusCobranca: "recebida" },
      ]),
    ).toEqual({ aguardando_pagamento_ente: 2, a_cobrar: 1, cobrada: 1, recebida: 1 });
  });
});

describe("motivoParaRecusarCobranca", () => {
  it("recusa pendente → cobrada sem data de pagamento do ente", () => {
    expect(motivoParaRecusarCobranca({ statusCobranca: "pendente", dataPagamentoEnte: null }, "cobrada")).toBe(
      MENSAGEM_COBRANCA_SEM_PAGAMENTO_ENTE,
    );
  });

  it("recusa pendente → recebida direto sem data (não dá para pular a porta)", () => {
    expect(motivoParaRecusarCobranca({ statusCobranca: "pendente" }, "recebida")).not.toBeNull();
  });

  it("libera pendente → cobrada quando o ente já pagou", () => {
    expect(
      motivoParaRecusarCobranca({ statusCobranca: "pendente", dataPagamentoEnte: new Date("2026-10-10") }, "cobrada"),
    ).toBeNull();
  });

  it("não impede ficar pendente nem ajustar quem já estava cobrada ou recebida sem data", () => {
    expect(motivoParaRecusarCobranca({ statusCobranca: "pendente", dataPagamentoEnte: null }, "pendente")).toBeNull();
    expect(motivoParaRecusarCobranca({ statusCobranca: "cobrada", dataPagamentoEnte: null }, "recebida")).toBeNull();
    expect(motivoParaRecusarCobranca({ statusCobranca: "recebida", dataPagamentoEnte: null }, "cobrada")).toBeNull();
  });

  it("a mensagem diz o que fazer", () => {
    expect(MENSAGEM_COBRANCA_SEM_PAGAMENTO_ENTE).toMatch(/pagamento do ente/);
  });
});

describe("interpretarDataPagamentoEnte", () => {
  const agora = new Date("2026-10-21T15:00:00Z");

  it("devolve o dia à meia-noite UTC, como a data da liquidação", () => {
    const r = interpretarDataPagamentoEnte("2026-10-10", agora);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.toISOString()).toBe("2026-10-10T00:00:00.000Z");
  });

  it("aceita hoje, mesmo à noite em Brasília quando em UTC já é amanhã", () => {
    // 21/10 23:30 em Brasília = 22/10 02:30 UTC
    const noite = new Date("2026-10-22T02:30:00Z");
    expect(interpretarDataPagamentoEnte("2026-10-21", noite).ok).toBe(true);
    expect(interpretarDataPagamentoEnte("2026-10-22", noite).ok).toBe(false);
  });

  it("recusa data futura com mensagem clara", () => {
    const r = interpretarDataPagamentoEnte("2026-10-22", agora);
    expect(r).toEqual({ ok: false, erro: "A data do pagamento do ente não pode ser futura." });
  });

  it("recusa data inexistente, ano absurdo, formato errado e vazio", () => {
    expect(interpretarDataPagamentoEnte("2026-02-30", agora).ok).toBe(false);
    expect(interpretarDataPagamentoEnte("0026-10-10", agora).ok).toBe(false);
    expect(interpretarDataPagamentoEnte("10/10/2026", agora).ok).toBe(false);
    expect(interpretarDataPagamentoEnte("", agora).ok).toBe(false);
    expect(interpretarDataPagamentoEnte("   ", agora).ok).toBe(false);
  });

  it("aceita 29 de fevereiro em ano bissexto", () => {
    expect(interpretarDataPagamentoEnte("2024-02-29", agora).ok).toBe(true);
    expect(interpretarDataPagamentoEnte("2025-02-29", agora).ok).toBe(false);
  });
});

describe("lerDiaAAAAMMDD e interpretarDataLiquidacao", () => {
  it("lê o dia à meia-noite UTC e ignora espaços nas pontas", () => {
    expect(lerDiaAAAAMMDD(" 2026-10-10 ")?.toISOString()).toBe("2026-10-10T00:00:00.000Z");
    const r = interpretarDataLiquidacao("2026-10-10");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.toISOString()).toBe("2026-10-10T00:00:00.000Z");
  });

  it("não aceita o que `new Date(texto)` aceitaria e mudaria o dia gravado", () => {
    // new Date("2026-02-30") vira 02/03; os demais viram hora local, não meia-noite UTC.
    for (const ruim of [
      "2026-02-30",
      "2026-13-01",
      "2026-10-10T23:30:00-03:00",
      "10/05/2026",
      "Oct 5 2026",
      "0001-01-01",
      "",
      "   ",
    ]) {
      expect(lerDiaAAAAMMDD(ruim)).toBeNull();
      expect(interpretarDataLiquidacao(ruim)).toEqual({ ok: false, erro: "Data da liquidação inválida." });
    }
  });

  it("aceita 29 de fevereiro só em ano bissexto", () => {
    expect(lerDiaAAAAMMDD("2024-02-29")).not.toBeNull();
    expect(lerDiaAAAAMMDD("2025-02-29")).toBeNull();
  });
});

describe("filtros de banco", () => {
  it("'a cobrar' exige a data; 'aguardando' é a ausência dela", () => {
    expect(ONDE_LIQUIDACAO_A_COBRAR).toEqual({ statusCobranca: "pendente", dataPagamentoEnte: { not: null } });
    expect(ONDE_LIQUIDACAO_AGUARDANDO_PAGAMENTO_ENTE).toEqual({ statusCobranca: "pendente", dataPagamentoEnte: null });
  });

  it("dão a mesma resposta que situacaoDaLiquidacao para qualquer combinação (painel e telas não divergem)", () => {
    // Avalia o filtro como o Prisma faria: igualdade simples ou { not: null }.
    const casa = (
      filtro: { statusCobranca: string; dataPagamentoEnte: null | { not: null } },
      l: { statusCobranca: string; dataPagamentoEnte: Date | null },
    ) =>
      l.statusCobranca === filtro.statusCobranca &&
      (filtro.dataPagamentoEnte === null ? l.dataPagamentoEnte === null : l.dataPagamentoEnte !== null);

    for (const statusCobranca of ["pendente", "cobrada", "recebida"]) {
      for (const dataPagamentoEnte of [null, new Date("2026-10-10T00:00:00Z")]) {
        const l = { statusCobranca, dataPagamentoEnte };
        expect(casa(ONDE_LIQUIDACAO_A_COBRAR, l)).toBe(situacaoDaLiquidacao(l) === "a_cobrar");
        expect(casa(ONDE_LIQUIDACAO_AGUARDANDO_PAGAMENTO_ENTE, l)).toBe(
          situacaoDaLiquidacao(l) === "aguardando_pagamento_ente",
        );
      }
    }
  });
});

describe("vocabulário", () => {
  it("valida tipo e status", () => {
    expect(tipoLiquidacaoValido("aditivo")).toBe(true);
    expect(tipoLiquidacaoValido("outro")).toBe(false);
    expect(statusCobrancaValido("cobrada")).toBe(true);
    expect(statusCobrancaValido("paga")).toBe(false);
  });
});
