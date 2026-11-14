import { limitePorOrgao, saldoAgregadoDisponivel } from "@/lib/saldo";

/**
 * Pós-venda e renovação (atividade 17 do workflow, 14/11/2026): é dos VENDEDORES. Depois que a
 * adesão do município foi registrada, o consultor acompanha o que o município ainda pode render:
 * a vigência da ata e do contrato (renovação), os aditivos que o PNCP mostra e os novos pedidos na
 * mesma ata (o que ainda cabe nos limites do art. 86). Regras puras, sem banco e sem relógio:
 * quem chama passa o dia de hoje. Quem carrega os dados é src/lib/pos-venda-db.ts.
 */

/** Daqui para trás, a vigência "está terminando" e pede ação (renovar ou pedir mais enquanto a ata vale). */
export const DIAS_AVISO_VIGENCIA = 90;
/** Dentro deste prazo a vigência é urgente. */
export const DIAS_URGENTE_VIGENCIA = 30;

export type EtapaPosicao = 14 | 15 | 16 | 17;

export type TipoSinalPosVenda =
  | "ata_encerrada"
  | "ata_terminando"
  | "contrato_vencido"
  | "contrato_terminando"
  | "contato_vencido"
  | "aditivo"
  | "novo_pedido";

/** Como cada sinal aparece na tela. */
export const ROTULO_SINAL: Record<TipoSinalPosVenda, string> = {
  ata_encerrada: "Ata encerrada",
  ata_terminando: "Ata vencendo",
  contrato_vencido: "Contrato vencido",
  contrato_terminando: "Contrato vencendo",
  contato_vencido: "Contato atrasado",
  aditivo: "Aditivo",
  novo_pedido: "Novo pedido",
};

export interface SinalPosVenda {
  tipo: TipoSinalPosVenda;
  /** Pede ação do consultor agora. */
  urgente: boolean;
  texto: string;
}

export interface DadosPosVenda {
  agora: Date;
  /** Onde a adesão está no ciclo (14 contrato, 15 liquidação, 16 comissão, 17 pós-venda). */
  etapa: EtapaPosicao;
  ataVigenciaFim: Date;
  /** Fim da vigência do contrato do município (a maior, contando as prorrogações); null = não confirmado. */
  contratoVigenciaFim: Date | null;
  /** Aditivos que o PNCP mostra no contrato do município. */
  aditivos: number;
  /** Itens da ata em que o município ainda pode aderir a mais. */
  itensComMargem: number;
  proximoContatoEm: Date | null;
}

/** Dia de hoje em Brasília, "AAAA-MM-DD". */
function hojeEmBrasilia(agora: Date): string {
  return agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/**
 * Dias corridos de hoje até uma data de vigência (negativo = já passou). As datas de vigência são só
 * dia, guardadas à meia-noite UTC: compara-se o dia, sem hora.
 */
export function diasAte(data: Date, agora: Date): number {
  const alvo = Date.parse(data.toISOString().slice(0, 10));
  const hoje = Date.parse(hojeEmBrasilia(agora));
  return Math.round((alvo - hoje) / 86_400_000);
}

/** "27/11/2026" a partir de uma data só-dia (sem deslocar pelo fuso). */
export function dataSoDiaBr(data: Date): string {
  const [a, m, d] = data.toISOString().slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Quanto o município ainda pode aderir no item: o menor entre o que falta para os 50% dele e o que
 * sobra do dobro da ata (art. 86, §§ 4º e 5º). Nunca negativo.
 */
export function margemDoItem(quantidadeRegistrada: number, quantidadeConsumida: number, quantidadeDoMunicipio: number): number {
  const doOrgao = limitePorOrgao(quantidadeRegistrada) - quantidadeDoMunicipio;
  const doTotal = saldoAgregadoDisponivel(quantidadeRegistrada, quantidadeConsumida);
  return Math.max(0, Math.floor(Math.min(doOrgao, doTotal)));
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/**
 * Os sinais do pós-venda de uma adesão, os que pedem ação primeiro. Sem sinal nenhum, a adesão só
 * está sendo acompanhada.
 */
export function sinaisDePosVenda(d: DadosPosVenda): SinalPosVenda[] {
  const sinais: SinalPosVenda[] = [];

  const diasAta = diasAte(d.ataVigenciaFim, d.agora);
  if (diasAta < 0) {
    sinais.push({
      tipo: "ata_encerrada",
      urgente: true,
      texto: `A vigência da ata terminou em ${dataSoDiaBr(d.ataVigenciaFim)}: não cabe mais adesão. Veja uma ata nova do mesmo fornecedor para renovar.`,
    });
  } else if (diasAta <= DIAS_AVISO_VIGENCIA) {
    sinais.push({
      tipo: "ata_terminando",
      urgente: diasAta <= DIAS_URGENTE_VIGENCIA,
      texto: `A ata vence em ${plural(diasAta, "dia", "dias")} (${dataSoDiaBr(d.ataVigenciaFim)}): é o prazo para novos pedidos e para combinar a renovação.`,
    });
  }

  if (d.contratoVigenciaFim) {
    const diasContrato = diasAte(d.contratoVigenciaFim, d.agora);
    if (diasContrato < 0) {
      sinais.push({
        tipo: "contrato_vencido",
        urgente: true,
        texto: `O contrato do município venceu em ${dataSoDiaBr(d.contratoVigenciaFim)}: converse sobre a renovação.`,
      });
    } else if (diasContrato <= DIAS_AVISO_VIGENCIA) {
      sinais.push({
        tipo: "contrato_terminando",
        urgente: diasContrato <= DIAS_URGENTE_VIGENCIA,
        texto: `O contrato do município vence em ${plural(diasContrato, "dia", "dias")} (${dataSoDiaBr(d.contratoVigenciaFim)}): combine a renovação com o órgão.`,
      });
    }
  }

  if (d.proximoContatoEm && diasAte(d.proximoContatoEm, d.agora) < 0) {
    sinais.push({
      tipo: "contato_vencido",
      urgente: true,
      texto: `O contato combinado para ${dataSoDiaBr(d.proximoContatoEm)} ainda não foi feito.`,
    });
  }

  if (d.aditivos > 0) {
    sinais.push({
      tipo: "aditivo",
      urgente: false,
      texto: `${plural(d.aditivos, "aditivo apareceu", "aditivos apareceram")} no contrato do município, no PNCP. A comissão sobre ele é acompanhada pela equipe.`,
    });
  }

  // Novo pedido na mesma ata: só depois que o contrato existe (etapa 15 em diante) e enquanto a ata vale.
  if (d.etapa >= 15 && diasAta >= 0 && d.itensComMargem > 0) {
    sinais.push({
      tipo: "novo_pedido",
      urgente: false,
      texto: `Ainda cabem ${plural(d.itensComMargem, "item", "itens")} na adesão deste município: ofereça um novo pedido na mesma ata.`,
    });
  }

  return sinais.sort((a, b) => Number(b.urgente) - Number(a.urgente));
}

/** Onde a adesão está, dito ao consultor (quem faz cada etapa não é ele, mas ele precisa saber). */
export function situacaoParaOConsultor(etapa: EtapaPosicao): string {
  switch (etapa) {
    case 14:
      return "Aguardando o contrato ou o empenho do município";
    case 15:
      return "Entrega e liquidação em andamento";
    case 16:
      return "Comissão em cobrança pela equipe";
    case 17:
      return "Tudo liquidado e recebido: pós-venda";
  }
}
