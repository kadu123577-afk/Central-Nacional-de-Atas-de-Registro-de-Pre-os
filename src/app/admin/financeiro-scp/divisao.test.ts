import { describe, expect, it } from "vitest";
import { planejarDivisao, type ParticipacaoCadastrada, type SocioParaDivisao } from "./divisao";

/** Só dados fictícios: "Sócio A", "Sócio B", 60% e 40%. */
const dia = (texto: string) => new Date(`${texto}T00:00:00.000Z`);

const A: SocioParaDivisao = { id: "a", nome: "Sócio A", ativo: true };
const B: SocioParaDivisao = { id: "b", nome: "Sócio B", ativo: true };
const C: SocioParaDivisao = { id: "c", nome: "Sócio C", ativo: true };

function p(id: string, socioId: string, percentual: number, desde: string, ate: string | null = null): ParticipacaoCadastrada {
  return { id, socioId, percentual, vigenteDesde: dia(desde), vigenteAte: ate ? dia(ate) : null };
}

/** Situação de partida: A 60% e B 40%, em vigor desde 01/01/2026. */
const SESSENTA_QUARENTA = [p("p1", "a", 0.6, "2026-01-01"), p("p2", "b", 0.4, "2026-01-01")];

describe("planejarDivisao", () => {
  it("primeira divisão: abre uma participação por sócio e não encerra nada", () => {
    const r = planejarDivisao({
      desde: dia("2026-01-01"),
      entradas: [
        { socioId: "a", fracao: 0.6 },
        { socioId: "b", fracao: 0.4 },
      ],
      socios: [A, B],
      participacoes: [],
    });
    expect(r).toEqual({
      ok: true,
      encerrar: [],
      abrir: [
        { socioId: "a", fracao: 0.6 },
        { socioId: "b", fracao: 0.4 },
      ],
      mudancas: [
        { socioId: "a", antes: null, depois: 0.6 },
        { socioId: "b", antes: null, depois: 0.4 },
      ],
    });
  });

  it("60/40 → 50/50 numa data: encerra as duas no dia anterior e abre as duas novas", () => {
    const r = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [
        { socioId: "a", fracao: 0.5 },
        { socioId: "b", fracao: 0.5 },
      ],
      socios: [A, B],
      participacoes: SESSENTA_QUARENTA,
    });
    expect(r).toEqual({
      ok: true,
      encerrar: [
        { id: "p1", vigenteAte: dia("2026-10-31") },
        { id: "p2", vigenteAte: dia("2026-10-31") },
      ],
      abrir: [
        { socioId: "a", fracao: 0.5 },
        { socioId: "b", fracao: 0.5 },
      ],
      mudancas: [
        { socioId: "a", antes: 0.6, depois: 0.5 },
        { socioId: "b", antes: 0.4, depois: 0.5 },
      ],
    });
  });

  it("quem não muda não é tocado (nem encerrado nem reaberto)", () => {
    // B continua com 40%; A cede 10 pontos a C, que entra.
    const r = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [
        { socioId: "a", fracao: 0.5 },
        { socioId: "b", fracao: 0.4 },
        { socioId: "c", fracao: 0.1 },
      ],
      socios: [A, B, C],
      participacoes: SESSENTA_QUARENTA,
    });
    expect(r).toEqual({
      ok: true,
      encerrar: [{ id: "p1", vigenteAte: dia("2026-10-31") }],
      abrir: [
        { socioId: "a", fracao: 0.5 },
        { socioId: "c", fracao: 0.1 },
      ],
      mudancas: [
        { socioId: "a", antes: 0.6, depois: 0.5 },
        { socioId: "c", antes: null, depois: 0.1 },
      ],
    });
  });

  it("mesmo percentual escrito de outro jeito não conta como mudança (comparação em 4 casas)", () => {
    const r = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [
        { socioId: "a", fracao: 0.6000000001 },
        { socioId: "b", fracao: 0.4 },
      ],
      socios: [A, B],
      participacoes: SESSENTA_QUARENTA,
    });
    expect(r).toEqual({ ok: true, encerrar: [], abrir: [], mudancas: [] });
  });

  it("mudar só 0,01 ponto (33,33% para 33,34%) conta como mudança: a comparação é em 4 casas, não em pontos inteiros", () => {
    const r = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [
        { socioId: "a", fracao: 0.3334 },
        { socioId: "b", fracao: 0.6666 },
      ],
      socios: [A, B],
      participacoes: [p("p1", "a", 0.3333, "2026-01-01"), p("p2", "b", 0.6667, "2026-01-01")],
    });
    expect(r).toMatchObject({
      ok: true,
      encerrar: [
        { id: "p1", vigenteAte: dia("2026-10-31") },
        { id: "p2", vigenteAte: dia("2026-10-31") },
      ],
      abrir: [
        { socioId: "a", fracao: 0.3334 },
        { socioId: "b", fracao: 0.6666 },
      ],
      mudancas: [
        { socioId: "a", antes: 0.3333, depois: 0.3334 },
        { socioId: "b", antes: 0.6667, depois: 0.6666 },
      ],
    });
  });

  it("sócio com percentual em branco sai da partilha: a participação dele é encerrada", () => {
    const r = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [
        { socioId: "a", fracao: 1 },
        { socioId: "b", fracao: null },
      ],
      socios: [A, B],
      participacoes: SESSENTA_QUARENTA,
    });
    expect(r).toMatchObject({
      ok: true,
      encerrar: [
        { id: "p1", vigenteAte: dia("2026-10-31") },
        { id: "p2", vigenteAte: dia("2026-10-31") },
      ],
      abrir: [{ socioId: "a", fracao: 1 }],
      mudancas: [
        { socioId: "a", antes: 0.6, depois: 1 },
        { socioId: "b", antes: 0.4, depois: null },
      ],
    });
  });

  it("em branco para quem nunca teve participação não muda nada", () => {
    const r = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [
        { socioId: "a", fracao: 0.6 },
        { socioId: "b", fracao: 0.4 },
        { socioId: "c", fracao: null },
      ],
      socios: [A, B, C],
      participacoes: SESSENTA_QUARENTA,
    });
    expect(r).toEqual({ ok: true, encerrar: [], abrir: [], mudancas: [] });
  });

  it("não fecha 100%: recusa com a soma no texto (60 + 30)", () => {
    const r = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [
        { socioId: "a", fracao: 0.6 },
        { socioId: "b", fracao: 0.3 },
      ],
      socios: [A, B],
      participacoes: SESSENTA_QUARENTA,
    });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.erro).toMatch(/exatamente 100%.*90%/);
  });

  it("passa de 100%: recusa", () => {
    const r = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [
        { socioId: "a", fracao: 0.7 },
        { socioId: "b", fracao: 0.4 },
      ],
      socios: [A, B],
      participacoes: SESSENTA_QUARENTA,
    });
    expect(!r.ok && r.erro).toMatch(/110%/);
  });

  it("sócio que ficou fora do formulário mantém o que tem, e a soma de 100% pega o esquecimento", () => {
    // O formulário só trouxe A (50%); B continua com 40% vigente: 90%.
    const r = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [{ socioId: "a", fracao: 0.5 }],
      socios: [A, B],
      participacoes: SESSENTA_QUARENTA,
    });
    expect(!r.ok && r.erro).toMatch(/90%/);
  });

  it("tudo em branco: recusa (sem nenhuma participação vigente)", () => {
    const r = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [
        { socioId: "a", fracao: null },
        { socioId: "b", fracao: null },
      ],
      socios: [A, B],
      participacoes: SESSENTA_QUARENTA,
    });
    expect(!r.ok && r.erro).toMatch(/ao menos um sócio/);
  });

  it("a data precisa ser posterior à divisão mais recente (nada se reescreve)", () => {
    const entradas = [
      { socioId: "a", fracao: 0.5 },
      { socioId: "b", fracao: 0.5 },
    ];
    const igual = planejarDivisao({ desde: dia("2026-01-01"), entradas, socios: [A, B], participacoes: SESSENTA_QUARENTA });
    expect(!igual.ok && igual.erro).toContain("depois de 01/01/2026");
    const antes = planejarDivisao({ desde: dia("2025-12-31"), entradas, socios: [A, B], participacoes: SESSENTA_QUARENTA });
    expect(antes.ok).toBe(false);
    const depois = planejarDivisao({ desde: dia("2026-01-02"), entradas, socios: [A, B], participacoes: SESSENTA_QUARENTA });
    expect(depois.ok).toBe(true);
  });

  it("a data é comparada com o início mais recente de QUALQUER sócio", () => {
    const participacoes = [
      p("p1", "a", 0.6, "2026-01-01", "2026-05-31"),
      p("p2", "b", 0.4, "2026-01-01"),
      p("p3", "a", 0.6, "2026-06-01"),
    ];
    const r = planejarDivisao({
      desde: dia("2026-06-01"),
      entradas: [
        { socioId: "a", fracao: 0.5 },
        { socioId: "b", fracao: 0.5 },
      ],
      socios: [A, B],
      participacoes,
    });
    expect(!r.ok && r.erro).toContain("depois de 01/06/2026");
  });

  it("sócio inativo não ganha participação nova, mas pode continuar com a que já tem", () => {
    const inativo = { ...B, ativo: false };
    const novo = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [
        { socioId: "a", fracao: 0.5 },
        { socioId: "b", fracao: 0.5 },
      ],
      socios: [A, inativo],
      participacoes: SESSENTA_QUARENTA,
    });
    expect(!novo.ok && novo.erro).toBe("Sócio B está inativo. Reative o sócio antes de dar participação a ele.");

    const mantem = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [
        { socioId: "a", fracao: 0.6 },
        { socioId: "b", fracao: 0.4 },
      ],
      socios: [A, inativo],
      participacoes: SESSENTA_QUARENTA,
    });
    expect(mantem.ok).toBe(true);
  });

  it("sócio inexistente e sócio repetido são recusados", () => {
    const inexistente = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [{ socioId: "zzz", fracao: 1 }],
      socios: [A],
      participacoes: [],
    });
    expect(!inexistente.ok && inexistente.erro).toMatch(/Sócio não encontrado/);

    const repetido = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [
        { socioId: "a", fracao: 0.5 },
        { socioId: "a", fracao: 0.5 },
      ],
      socios: [A],
      participacoes: [],
    });
    expect(!repetido.ok && repetido.erro).toMatch(/mais de uma vez/);
  });

  it("participação com fim marcado no futuro (ajustado direto no banco) é encerrada no dia anterior à nova data", () => {
    const participacoes = [p("p1", "a", 1, "2026-01-01", "2026-12-31")];
    const r = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [{ socioId: "a", fracao: 1 }],
      socios: [A],
      participacoes,
    });
    // Mesmo percentual, mas não está em aberto: fecha no dia anterior e reabre em aberto.
    expect(r).toMatchObject({
      ok: true,
      encerrar: [{ id: "p1", vigenteAte: dia("2026-10-31") }],
      abrir: [{ socioId: "a", fracao: 1 }],
    });
  });

  it("dados já inconsistentes (vigências sobrepostas) são recusados antes de qualquer plano", () => {
    const r = planejarDivisao({
      desde: dia("2026-11-01"),
      entradas: [{ socioId: "a", fracao: 1 }],
      socios: [A],
      participacoes: [p("p1", "a", 0.5, "2026-01-01"), p("p2", "a", 0.5, "2026-02-01")],
    });
    expect(!r.ok && r.erro).toMatch(/se sobrepõem/);
  });

  it("uma data inválida é recusada", () => {
    const r = planejarDivisao({
      desde: new Date("lixo"),
      entradas: [{ socioId: "a", fracao: 1 }],
      socios: [A],
      participacoes: [],
    });
    expect(!r.ok && r.erro).toMatch(/Informe a data/);
  });
});
