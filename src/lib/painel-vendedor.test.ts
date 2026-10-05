import { describe, expect, it } from "vitest";
import { montarPainel, type LinhaOportunidade } from "./painel-vendedor";

const agora = new Date("2026-10-04T12:00:00Z");
const emDias = (n: number) => new Date(agora.getTime() + n * 24 * 60 * 60 * 1000);

const linha = (extra: Partial<LinhaOportunidade>): LinhaOportunidade => ({
  oportunidadeId: Math.random().toString(36).slice(2),
  ataId: "a1",
  ataNumero: "001/2026",
  ataCategoria: "veiculos",
  fornecedor: "Forn",
  municipio: "Prefeitura X",
  uf: "GO",
  estagio: "a_contatar",
  prazoEm: emDias(9),
  proximoContatoEm: null,
  valorAderido: null,
  percentualComissao: null,
  valorEstimado: null,
  semCanal: false,
  liquidacoes: [],
  ...extra,
});

describe("montarPainel", () => {
  it("indicadores: aderido, comissão, potencial, prazos e sem contato", () => {
    const p = montarPainel(
      [
        linha({
          estagio: "aderiu",
          prazoEm: null,
          valorAderido: 800000,
          percentualComissao: 0.075,
          liquidacoes: [{ valorLiquidado: 200000, statusCobranca: "recebida" }],
        }),
        linha({ estagio: "em_negociacao", prazoEm: emDias(2), valorEstimado: 100000 }),
        linha({ estagio: "a_contatar", valorEstimado: 50000, semCanal: true }),
      ],
      agora,
    );
    expect(p.kpis.aderido).toBe(800000);
    expect(p.kpis.comissaoDevida).toBeCloseTo(15000);
    expect(p.kpis.comissaoRecebida).toBeCloseTo(15000);
    expect(p.kpis.emNegociacao).toBe(1);
    expect(p.kpis.potencial).toBe(150000);
    expect(p.kpis.vencendo).toBe(1);
    expect(p.kpis.semContato).toBe(1);
    expect(p.kpis.abertos).toBe(2);
  });

  it("funil por estágio com valor aderido ou estimado", () => {
    const p = montarPainel(
      [
        linha({ estagio: "aderiu", valorAderido: 10 }),
        linha({ estagio: "a_contatar", valorEstimado: 5 }),
        linha({ estagio: "recusado", valorEstimado: 99 }),
      ],
      agora,
    );
    const por = Object.fromEntries(p.funil.map((f) => [f.estagio, f]));
    expect(por.aderiu.valor).toBe(10);
    expect(por.a_contatar.valor).toBe(5);
    expect(por.recusado.valor).toBe(0);
    expect(por.a_contatar.estimado).toBe(true);
  });

  it("tarefas: crítico primeiro, depois retorno e sem contato; aderidos não geram tarefa", () => {
    const p = montarPainel(
      [
        linha({ municipio: "Sem canal", semCanal: true }),
        linha({ municipio: "Urgente", prazoEm: emDias(1) }),
        linha({ municipio: "Retorno", proximoContatoEm: emDias(0) }),
        linha({ municipio: "Fechado", estagio: "aderiu", prazoEm: null, semCanal: true }),
      ],
      agora,
    );
    expect(p.tarefas.map((t) => t.municipio)).toEqual(["Urgente", "Retorno", "Sem canal"]);
    expect(p.tarefas[0].nivel).toBe("critico");
  });

  it("agrega por ata", () => {
    const p = montarPainel(
      [
        linha({ estagio: "aderiu", valorAderido: 10 }),
        linha({ valorEstimado: 4 }),
        linha({ ataId: "a2", ataNumero: "002/2026" }),
      ],
      agora,
    );
    const a1 = p.atas.find((a) => a.ataId === "a1")!;
    expect(a1).toMatchObject({ aderidas: 1, total: 2, valorFechado: 10, valorEmAberto: 4 });
    expect(p.atas).toHaveLength(2);
  });
});
