import { verificarElegibilidadeEsfera } from "@/lib/esferas";
import { diasAte } from "@/lib/pos-venda";

/**
 * Panorama de vendas (16/11/2026): o match entre cada município e as atas do catálogo, para ver onde é
 * mais fácil vender. Para cada par (município, ata) da mesma categoria, dá uma nota de 0 a 100 e diz os
 * motivos em português. Regras puras, sem banco e sem relógio; as notas ficam todas na tabela PESOS, à
 * vista, para a equipe poder ajustar. É uma ajuda para escolher por onde começar, não uma garantia de
 * venda: a nota só usa o que o município já consumiu (PNCP) e o que a ata é.
 */

export const PESOS = {
  /** O município já contrata esta categoria. */
  consome: 35,
  /** Volume por ano, do maior para o menor (valor mínimo anual em reais, pontos). */
  volume: [
    { minimo: 1_000_000, pontos: 25 },
    { minimo: 300_000, pontos: 20 },
    { minimo: 100_000, pontos: 15 },
    { minimo: 30_000, pontos: 9 },
    { minimo: 0, pontos: 4 },
  ],
  /** Quantos contratos na janela (mínimo, pontos). */
  recorrencia: [
    { minimo: 6, pontos: 10 },
    { minimo: 3, pontos: 6 },
    { minimo: 1, pontos: 3 },
  ],
  /** O contrato vence nos próximos 180 dias: é a hora de oferecer. */
  vencendo: 20,
  /** O contrato venceu nos últimos 90 dias. */
  venceuHaPouco: 14,
  /** Sem contrato vigente e sem contratação nos últimos 12 meses. */
  semContratoRecente: 6,
  /** Já comprou por adesão a ata (carona). */
  jaCompraPorAdesao: 10,
  /** Esfera do gerenciador não confirmada: a adesão não pode ser tratada como certa. */
  esferaNaoConfirmada: -30,
  /** Ata de órgão municipal: exige que o registro de preços tenha nascido de licitação. */
  ataMunicipal: -5,
} as const;

/** Acima deste consumo por ano, a categoria provavelmente pegou obra ou serviço grande: vale conferir. */
export const CONSUMO_ANUAL_ATIPICO = 20_000_000;

export const DIAS_JANELA_VENCENDO = 180;
export const DIAS_JANELA_VENCEU = 90;

export type NivelDoPar = "muito_provavel" | "provavel" | "possivel";

export const ROTULO_NIVEL: Record<NivelDoPar, string> = {
  muito_provavel: "Muito provável",
  provavel: "Provável",
  possivel: "Possível",
};

export function nivelDosPontos(pontos: number): NivelDoPar {
  if (pontos >= 75) return "muito_provavel";
  if (pontos >= 55) return "provavel";
  return "possivel";
}

/** O consumo do município numa categoria, como o banco o guarda (os campos novos podem faltar). */
export interface ConsumoParaMatch {
  categoria: string;
  valorUltimaContratacao: number;
  /** Contratos na janela. */
  quantidadeContratos: number;
  ultimaContratacao: Date;
  valorTotalNaJanela: number | null;
  janelaMeses: number | null;
  vigenciaFimMaisRecente: Date | null;
  contratosPorAdesao: number | null;
  fornecedoresDistintos: number | null;
}

export interface AtaParaMatch {
  id: string;
  numero: string;
  objeto: string;
  categoria: string | null;
  /** Esfera do órgão gerenciador (federal, estadual, distrital ou municipal). */
  esferaGerenciador: string | null;
}

export interface ParPontuado {
  pontos: number;
  nivel: NivelDoPar;
  motivos: string[];
  avisos: string[];
  /** Quanto o município gasta por ano nesta categoria, e se o número é estimativa. */
  consumoAnual: number;
  consumoAnualEstimado: boolean;
  /** Dias até o contrato mais recente vencer (negativo = já venceu); null = sem vigência conhecida. Serve de desempate. */
  diasParaVencer: number | null;
}

/**
 * Consumo por ano. Com o total da janela, é o total dividido pelos anos da janela. Sem ele (só o
 * resumo simples do raio-X), estima: valor da última contratação vezes o número de contratos, em 3 anos.
 */
export function consumoAnual(c: ConsumoParaMatch): { valor: number; estimado: boolean } {
  if (c.valorTotalNaJanela !== null && c.janelaMeses !== null && c.janelaMeses > 0) {
    return { valor: c.valorTotalNaJanela / (c.janelaMeses / 12), estimado: false };
  }
  return { valor: (c.valorUltimaContratacao * Math.max(1, c.quantidadeContratos)) / 3, estimado: true };
}

const reais = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Nota do par município x ata. Devolve null quando não há par: a ata sem categoria, ou de categoria
 * diferente da que o município consome.
 */
export function pontuarPar(consumo: ConsumoParaMatch, ata: AtaParaMatch, hoje: Date): ParPontuado | null {
  if (!ata.categoria || ata.categoria !== consumo.categoria) return null;

  const motivos: string[] = [];
  const avisos: string[] = [];
  let pontos: number = PESOS.consome;

  const anual = consumoAnual(consumo);
  const faixa = PESOS.volume.find((f) => anual.valor >= f.minimo) ?? PESOS.volume[PESOS.volume.length - 1];
  pontos += faixa.pontos;
  motivos.push(
    `Já contrata esta categoria: cerca de ${reais(anual.valor)} por ano${anual.estimado ? " (estimativa)" : ""}, ${plural(consumo.quantidadeContratos, "contrato", "contratos")} no período.`,
  );

  const rec = PESOS.recorrencia.find((r) => consumo.quantidadeContratos >= r.minimo);
  if (rec) pontos += rec.pontos;

  if (anual.valor > CONSUMO_ANUAL_ATIPICO) {
    avisos.push(
      `Consumo muito alto (${reais(anual.valor)} por ano): a categoria pode ter pegado obra ou serviço grande. Confira os contratos antes de contar com esse valor.`,
    );
  }

  // Quando o consumo precisa ser renovado.
  let diasParaVencer: number | null = null;
  if (consumo.vigenciaFimMaisRecente) {
    const dias = diasAte(consumo.vigenciaFimMaisRecente, hoje);
    diasParaVencer = dias;
    if (dias >= 0 && dias <= DIAS_JANELA_VENCENDO) {
      pontos += PESOS.vencendo;
      motivos.push(`O contrato mais recente vence em ${plural(dias, "dia", "dias")}: é a hora de oferecer.`);
    } else if (dias < 0 && dias >= -DIAS_JANELA_VENCEU) {
      pontos += PESOS.venceuHaPouco;
      motivos.push(`O contrato mais recente venceu há ${plural(-dias, "dia", "dias")}: o município pode estar sem cobertura.`);
    } else if (dias < -DIAS_JANELA_VENCEU && diasAte(consumo.ultimaContratacao, hoje) < -365) {
      pontos += PESOS.semContratoRecente;
      motivos.push("Sem contrato vigente e sem contratação há mais de um ano.");
    }
  } else if (diasAte(consumo.ultimaContratacao, hoje) < -365) {
    pontos += PESOS.semContratoRecente;
    motivos.push("Sem contratação há mais de um ano.");
  }

  if (consumo.contratosPorAdesao !== null && consumo.contratosPorAdesao > 0) {
    pontos += PESOS.jaCompraPorAdesao;
    motivos.push(`Já comprou por adesão a ata (${plural(consumo.contratosPorAdesao, "contrato", "contratos")}): conhece o caminho.`);
  }

  // Elegibilidade pela esfera do gerenciador (art. 86, §§ 3º e 8º).
  const elegivel = verificarElegibilidadeEsfera("municipal", ata.esferaGerenciador ?? "");
  if (!elegivel.permitido) {
    pontos += PESOS.esferaNaoConfirmada;
    avisos.push("Esfera do órgão gerenciador não confirmada: confirme antes de oferecer.");
  } else if (ata.esferaGerenciador === "municipal") {
    pontos += PESOS.ataMunicipal;
    avisos.push("Ata de órgão municipal: só serve se o registro de preços nasceu de licitação (art. 86, § 3º, II).");
  }

  const final = Math.max(0, Math.min(100, Math.round(pontos)));
  return {
    pontos: final,
    nivel: nivelDosPontos(final),
    motivos,
    avisos,
    consumoAnual: anual.valor,
    consumoAnualEstimado: anual.estimado,
    diasParaVencer,
  };
}
