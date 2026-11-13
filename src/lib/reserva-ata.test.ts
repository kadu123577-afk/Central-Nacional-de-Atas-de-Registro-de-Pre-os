import { describe, expect, it } from "vitest";
import { diaDaReserva, mensagemDeAtaReservada, motivoDePedidoNegadoPorReserva, reservaDaAta } from "./reserva-ata";

const d = (iso: string) => new Date(`${iso}T15:00:00Z`);
const AGORA = d("2026-11-16");

const outro = (extra: Record<string, unknown> = {}) => ({
  vendedorId: "outro",
  estagio: "em_negociacao",
  expiradaEm: null,
  prazoEm: d("2026-11-27"),
  ...extra,
});

describe("reservaDaAta: a ata fica suspensa para os outros enquanto alguém negocia", () => {
  it("sem nenhuma oportunidade, a ata está livre", () => {
    expect(reservaDaAta([], "eu", AGORA)).toBeNull();
  });

  it("outro consultor negociando (a contatar ou em negociação) reserva a ata até o prazo dele", () => {
    expect(reservaDaAta([outro({ estagio: "a_contatar" })], "eu", AGORA)).toEqual({ ate: d("2026-11-27") });
    expect(reservaDaAta([outro()], "eu", AGORA)).toEqual({ ate: d("2026-11-27") });
  });

  it("com vários municípios do outro, vale o maior prazo", () => {
    const r = reservaDaAta([outro({ prazoEm: d("2026-11-20") }), outro({ prazoEm: d("2026-11-30") })], "eu", AGORA);
    expect(r?.ate).toEqual(d("2026-11-30"));
  });

  it("as minhas oportunidades nunca me impedem: quem negocia pode pedir mais municípios", () => {
    expect(reservaDaAta([outro({ vendedorId: "eu" })], "eu", AGORA)).toBeNull();
  });

  it("estágio final (aderiu, recusado) não reserva: a negociação daquele município terminou", () => {
    expect(reservaDaAta([outro({ estagio: "aderiu", prazoEm: null })], "eu", AGORA)).toBeNull();
    expect(reservaDaAta([outro({ estagio: "recusado", prazoEm: null })], "eu", AGORA)).toBeNull();
  });

  it("oportunidade expirada, ou com prazo já vencido (a expiração é preguiçosa), não reserva", () => {
    expect(reservaDaAta([outro({ expiradaEm: d("2026-11-10") })], "eu", AGORA)).toBeNull();
    expect(reservaDaAta([outro({ prazoEm: d("2026-11-13") })], "eu", AGORA)).toBeNull();
  });

  it("uma oportunidade vencida do outro não apaga a reserva de outra que ainda corre", () => {
    const r = reservaDaAta([outro({ prazoEm: d("2026-11-13") }), outro({ prazoEm: d("2026-11-25") })], "eu", AGORA);
    expect(r?.ate).toEqual(d("2026-11-25"));
  });

  it("oportunidade sem prazo gravado (registro antigo) não reserva: nunca venceria e prenderia a ata para sempre", () => {
    expect(reservaDaAta([outro({ prazoEm: null })], "eu", AGORA)).toBeNull();
    expect(reservaDaAta([outro({ prazoEm: undefined })], "eu", AGORA)).toBeNull();
  });

  it("registro sem consultor e sem estágio (dado incompleto) não reserva", () => {
    expect(reservaDaAta([{}], "eu", AGORA)).toBeNull();
  });
});

describe("textos da reserva", () => {
  it("o dia é lido no fuso de Brasília", () => {
    expect(diaDaReserva(d("2026-11-27"))).toBe("27/11/2026");
    expect(diaDaReserva(new Date("2026-11-28T01:00:00Z"))).toBe("27/11/2026");
  });

  it("a mensagem ao consultor diz até quando e quando a ata volta", () => {
    const m = mensagemDeAtaReservada({ ate: d("2026-11-27") });
    expect(m).toContain("reservada até 27/11/2026");
    expect(m).toContain("volta a ficar disponível quando a negociação terminar ou o prazo vencer sem avanço");
  });

  it("o motivo do pedido negado pede para tentar de novo depois", () => {
    expect(motivoDePedidoNegadoPorReserva({ ate: d("2026-11-27") })).toBe(
      "Ata reservada até 27/11/2026: outro consultor está negociando nela. Peça de novo quando ela voltar a ficar disponível.",
    );
  });
});
