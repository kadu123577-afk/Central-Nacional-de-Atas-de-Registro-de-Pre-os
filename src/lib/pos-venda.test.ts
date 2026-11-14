import { describe, expect, it } from "vitest";
import {
  DIAS_AVISO_VIGENCIA,
  dataSoDiaBr,
  diasAte,
  margemDoItem,
  situacaoParaOConsultor,
  sinaisDePosVenda,
  type DadosPosVenda,
} from "./pos-venda";

// "Hoje" é 16/11/2026, meio-dia em Brasília.
const AGORA = new Date("2026-11-16T15:00:00Z");
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

function dados(extra: Partial<DadosPosVenda> = {}): DadosPosVenda {
  return {
    agora: AGORA,
    etapa: 17,
    ataVigenciaFim: dia("2027-08-01"),
    contratoVigenciaFim: null,
    aditivos: 0,
    itensComMargem: 0,
    proximoContatoEm: null,
    ...extra,
  };
}

describe("diasAte e dataSoDiaBr", () => {
  it("conta dias corridos pelo dia, sem hora e sem deslocar pelo fuso", () => {
    expect(diasAte(dia("2026-11-16"), AGORA)).toBe(0);
    expect(diasAte(dia("2026-11-17"), AGORA)).toBe(1);
    expect(diasAte(dia("2026-11-15"), AGORA)).toBe(-1);
    expect(diasAte(dia("2027-02-14"), AGORA)).toBe(90);
  });

  it("hoje é o dia de Brasília: 01h UTC de 17/11 ainda é 16/11 em Brasília", () => {
    expect(diasAte(dia("2026-11-16"), new Date("2026-11-17T01:00:00Z"))).toBe(0);
  });

  it("a data de vigência aparece com o dia que está guardado", () => {
    expect(dataSoDiaBr(dia("2026-12-31"))).toBe("31/12/2026");
  });
});

describe("margemDoItem (art. 86, §§ 4º e 5º)", () => {
  it("é o menor entre o que falta dos 50% do município e o que sobra do dobro da ata", () => {
    expect(margemDoItem(1000, 0, 0)).toBe(500); // 50% de 1.000; o dobro sobra
    expect(margemDoItem(1000, 0, 300)).toBe(200); // já aderiu 300 dos 500
    expect(margemDoItem(1000, 1900, 0)).toBe(100); // só sobram 100 do total de 2.000
  });

  it("nunca é negativo e arredonda para baixo", () => {
    expect(margemDoItem(1000, 0, 500)).toBe(0);
    expect(margemDoItem(1000, 2000, 0)).toBe(0);
    expect(margemDoItem(1000, 2500, 0)).toBe(0);
    expect(margemDoItem(5, 0, 0)).toBe(2); // 50% de 5 = 2,5
  });
});

describe("sinaisDePosVenda", () => {
  it("adesão em dia, sem nada a fazer: nenhum sinal", () => {
    expect(sinaisDePosVenda(dados())).toEqual([]);
  });

  it("ata que vence dentro de 90 dias avisa; dentro de 30, é urgente", () => {
    const aviso = sinaisDePosVenda(dados({ ataVigenciaFim: dia("2027-02-14") }));
    expect(aviso).toHaveLength(1);
    expect(aviso[0]).toMatchObject({ tipo: "ata_terminando", urgente: false });
    expect(aviso[0].texto).toContain("90 dias (14/02/2027)");

    const urgente = sinaisDePosVenda(dados({ ataVigenciaFim: dia("2026-12-16") }));
    expect(urgente[0]).toMatchObject({ tipo: "ata_terminando", urgente: true });
    expect(urgente[0].texto).toContain("30 dias");
  });

  it("ata que vence amanhã diz '1 dia', não '1 dias'", () => {
    expect(sinaisDePosVenda(dados({ ataVigenciaFim: dia("2026-11-17") }))[0].texto).toContain("vence em 1 dia ");
  });

  it("além de 90 dias, a vigência da ata não é assunto", () => {
    expect(sinaisDePosVenda(dados({ ataVigenciaFim: dia("2027-02-15") }))).toEqual([]);
    expect(DIAS_AVISO_VIGENCIA).toBe(90);
  });

  it("ata encerrada é urgente e manda procurar uma ata nova", () => {
    const [s] = sinaisDePosVenda(dados({ ataVigenciaFim: dia("2026-11-10") }));
    expect(s).toMatchObject({ tipo: "ata_encerrada", urgente: true });
    expect(s.texto).toContain("terminou em 10/11/2026");
    expect(s.texto).toContain("ata nova");
  });

  it("contrato do município: terminando e vencido, com a mesma escala", () => {
    expect(sinaisDePosVenda(dados({ contratoVigenciaFim: dia("2026-12-10") }))[0]).toMatchObject({ tipo: "contrato_terminando", urgente: true });
    expect(sinaisDePosVenda(dados({ contratoVigenciaFim: dia("2027-01-30") }))[0]).toMatchObject({ tipo: "contrato_terminando", urgente: false });
    expect(sinaisDePosVenda(dados({ contratoVigenciaFim: dia("2026-11-01") }))[0]).toMatchObject({ tipo: "contrato_vencido", urgente: true });
    expect(sinaisDePosVenda(dados({ contratoVigenciaFim: dia("2027-06-01") }))).toEqual([]);
  });

  it("contato combinado que passou é urgente; o de hoje ainda não passou", () => {
    expect(sinaisDePosVenda(dados({ proximoContatoEm: dia("2026-11-14") }))[0]).toMatchObject({ tipo: "contato_vencido", urgente: true });
    expect(sinaisDePosVenda(dados({ proximoContatoEm: dia("2026-11-16") }))).toEqual([]);
    expect(sinaisDePosVenda(dados({ proximoContatoEm: dia("2026-11-20") }))).toEqual([]);
  });

  it("aditivo no contrato é informação, no singular e no plural", () => {
    const um = sinaisDePosVenda(dados({ aditivos: 1 }))[0];
    expect(um).toMatchObject({ tipo: "aditivo", urgente: false });
    expect(um.texto).toContain("1 aditivo apareceu");
    expect(sinaisDePosVenda(dados({ aditivos: 3 }))[0].texto).toContain("3 aditivos apareceram");
  });

  it("novo pedido: só do contrato em diante (etapa 15), com ata vigente e com margem", () => {
    expect(sinaisDePosVenda(dados({ itensComMargem: 2, etapa: 17 }))[0]).toMatchObject({ tipo: "novo_pedido", urgente: false });
    expect(sinaisDePosVenda(dados({ itensComMargem: 1, etapa: 15 }))[0].texto).toContain("1 item ");
    expect(sinaisDePosVenda(dados({ itensComMargem: 2, etapa: 14 }))).toEqual([]);
    expect(sinaisDePosVenda(dados({ itensComMargem: 0, etapa: 17 }))).toEqual([]);
    // ata encerrada: não se oferece pedido novo nela
    expect(sinaisDePosVenda(dados({ itensComMargem: 2, ataVigenciaFim: dia("2026-11-01") })).map((s) => s.tipo)).toEqual(["ata_encerrada"]);
  });

  it("os que pedem ação vêm primeiro, e a ordem de dentro do grupo se mantém", () => {
    const s = sinaisDePosVenda(
      dados({ aditivos: 1, itensComMargem: 2, ataVigenciaFim: dia("2026-12-01"), proximoContatoEm: dia("2026-11-01") }),
    );
    expect(s.map((x) => x.tipo)).toEqual(["ata_terminando", "contato_vencido", "aditivo", "novo_pedido"]);
    expect(s.map((x) => x.urgente)).toEqual([true, true, false, false]);
  });
});

describe("situacaoParaOConsultor", () => {
  it("diz em palavras onde a adesão está", () => {
    expect(situacaoParaOConsultor(14)).toContain("contrato");
    expect(situacaoParaOConsultor(15)).toContain("liquidação");
    expect(situacaoParaOConsultor(16).toLowerCase()).toContain("comissão");
    expect(situacaoParaOConsultor(17)).toContain("pós-venda");
  });
});
