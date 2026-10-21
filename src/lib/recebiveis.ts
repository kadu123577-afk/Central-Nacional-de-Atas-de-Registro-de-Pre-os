import { cobrancaLiberada } from "./acompanhamento";

/**
 * Vocabulário de liquidação e cobrança da comissão (2026-10-04) — mesmo
 * racional de categorias/estágios: texto fixo, não enum do Prisma.
 */
export const TIPOS_LIQUIDACAO = ["original", "aditivo", "renovacao"] as const;
export type TipoLiquidacao = (typeof TIPOS_LIQUIDACAO)[number];

export const ROTULO_TIPO_LIQUIDACAO: Record<TipoLiquidacao, string> = {
  original: "Fornecimento original",
  aditivo: "Aditivo (valor/quantidade)",
  renovacao: "Renovação/prorrogação",
};

export function tipoLiquidacaoValido(valor: string): valor is TipoLiquidacao {
  return (TIPOS_LIQUIDACAO as readonly string[]).includes(valor);
}

export const STATUS_COBRANCA = ["pendente", "cobrada", "recebida"] as const;
export type StatusCobranca = (typeof STATUS_COBRANCA)[number];

export const ROTULO_STATUS_COBRANCA: Record<StatusCobranca, string> = {
  pendente: "A cobrar",
  cobrada: "Cobrada",
  recebida: "Recebida",
};

export function statusCobrancaValido(valor: string): valor is StatusCobranca {
  return (STATUS_COBRANCA as readonly string[]).includes(valor);
}

/** Data em que o ente pagou o fornecedor: Date do banco, ISO vinda da tela, ou vazia. */
type DataDoPagamento = Date | string | null | undefined;

// ---------------------------------------------------- pagamento do ente (RNA)

/**
 * Situação da cobrança como o gestor enxerga (2026-10-21, honorários do
 * Projeto RNA): a comissão só vence depois que o ente liquidou E pagou o
 * fornecedor. O status gravado (`statusCobranca`) continua sendo
 * pendente → cobrada → recebida; a situação acrescenta a distinção entre
 * "a cobrar" (ente já pagou) e "aguardando pagamento do ente" (ainda não
 * há data de pagamento) dentro do "pendente".
 */
export const SITUACOES_COBRANCA = ["aguardando_pagamento_ente", "a_cobrar", "cobrada", "recebida"] as const;
export type SituacaoCobranca = (typeof SITUACOES_COBRANCA)[number];

export const ROTULO_SITUACAO_COBRANCA: Record<SituacaoCobranca, string> = {
  aguardando_pagamento_ente: "Aguardando pagamento do ente",
  a_cobrar: "A cobrar",
  cobrada: "Cobrada",
  recebida: "Recebida",
};

/**
 * Cobrada e recebida já passaram da porta (inclusive as lançadas antes desta
 * regra, sem data): o status gravado vale. Qualquer outro status é "pendente"
 * e só vira "a cobrar" com a data de pagamento do ente preenchida.
 */
export function situacaoDaLiquidacao(l: {
  statusCobranca: string;
  dataPagamentoEnte?: DataDoPagamento;
}): SituacaoCobranca {
  if (l.statusCobranca === "recebida") return "recebida";
  if (l.statusCobranca === "cobrada") return "cobrada";
  return cobrancaLiberada({ dataPagamentoEnte: l.dataPagamentoEnte }) ? "a_cobrar" : "aguardando_pagamento_ente";
}

/** Quantas liquidações há em cada situação (para selos e filtros). */
export function contarPorSituacao(
  liquidacoes: { statusCobranca: string; dataPagamentoEnte?: DataDoPagamento }[],
): Record<SituacaoCobranca, number> {
  const contagem: Record<SituacaoCobranca, number> = {
    aguardando_pagamento_ente: 0,
    a_cobrar: 0,
    cobrada: 0,
    recebida: 0,
  };
  for (const l of liquidacoes) contagem[situacaoDaLiquidacao(l)] += 1;
  return contagem;
}

export const MENSAGEM_COBRANCA_SEM_PAGAMENTO_ENTE =
  "A comissão só pode ser cobrada depois que o ente pagar o fornecedor. Informe a data do pagamento do ente nesta liquidação antes de marcar como cobrada ou recebida.";

/**
 * Regra da mudança de cobrança: sair de "pendente" (para cobrada ou recebida)
 * exige a data de pagamento do ente. Devolve a mensagem de recusa ou null.
 * Quem já está cobrada/recebida (inclusive sem data, por ser anterior a esta
 * regra) continua podendo ser ajustado — nada que já existia foi relaxado.
 */
export function motivoParaRecusarCobranca(
  atual: { statusCobranca: string; dataPagamentoEnte?: DataDoPagamento },
  novoStatus: StatusCobranca,
): string | null {
  const jaPassouDePendente = atual.statusCobranca === "cobrada" || atual.statusCobranca === "recebida";
  if (jaPassouDePendente || novoStatus === "pendente") return null;
  return cobrancaLiberada({ dataPagamentoEnte: atual.dataPagamentoEnte }) ? null : MENSAGEM_COBRANCA_SEM_PAGAMENTO_ENTE;
}

/**
 * Filtros de banco (Prisma) para contar liquidações "a cobrar" só entre as
 * liberadas, e à parte as que aguardam o pagamento do ente. É o mesmo critério
 * de `situacaoDaLiquidacao`, para o painel e as telas de recebíveis não
 * divergirem.
 */
export const ONDE_LIQUIDACAO_A_COBRAR = {
  statusCobranca: "pendente",
  dataPagamentoEnte: { not: null },
} as const;

export const ONDE_LIQUIDACAO_AGUARDANDO_PAGAMENTO_ENTE = {
  statusCobranca: "pendente",
  dataPagamentoEnte: null,
} as const;

const PADRAO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Dia de hoje em Brasília (AAAA-MM-DD), para não recusar "hoje" por causa do fuso do servidor. */
function hojeEmBrasilia(agora: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

export type DataInterpretada = { ok: true; data: Date } | { ok: false; erro: string };

/**
 * Dia só-data (AAAA-MM-DD, como o campo de data do navegador envia) à
 * meia-noite UTC. Nada de `new Date(texto)`: ele aceita "2026-02-30" (vira
 * 02/03), "10/05/2026" e horas com fuso, e o dia gravado mudaria. Devolve null
 * para formato diferente, data inexistente (30/02) e ano anterior a 2000.
 */
export function lerDiaAAAAMMDD(bruto: string): Date | null {
  const partes = PADRAO_DIA.exec(bruto.trim());
  if (!partes) return null;

  const [, ano, mes, dia] = partes;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  const existe =
    data.getUTCFullYear() === Number(ano) && data.getUTCMonth() === Number(mes) - 1 && data.getUTCDate() === Number(dia);
  return existe && Number(ano) >= 2000 ? data : null;
}

/**
 * Lê a "data da liquidação" do formulário (mesmo tratamento da data de
 * pagamento do ente: dia só-data, meia-noite UTC, sem aceitar data inexistente).
 */
export function interpretarDataLiquidacao(bruto: string): DataInterpretada {
  const data = lerDiaAAAAMMDD(bruto);
  return data ? { ok: true, data } : { ok: false, erro: "Data da liquidação inválida." };
}

/**
 * Lê a "data em que o ente pagou o fornecedor" digitada no formulário
 * (AAAA-MM-DD, do campo de data). Data só-dia vai para o banco à meia-noite
 * UTC — o mesmo tratamento de `dataLiquidacao` — para que o dia exibido não
 * mude com o fuso. Recusa data inexistente (30/02), absurda e futura (o ente
 * ainda não pagou).
 */
export function interpretarDataPagamentoEnte(bruto: string, agora: Date = new Date()): DataInterpretada {
  const texto = bruto.trim();
  if (!PADRAO_DIA.test(texto)) return { ok: false, erro: "Informe a data em que o ente pagou o fornecedor." };

  const data = lerDiaAAAAMMDD(texto);
  if (!data) return { ok: false, erro: "Data do pagamento do ente inválida." };
  if (texto > hojeEmBrasilia(agora)) {
    return { ok: false, erro: "A data do pagamento do ente não pode ser futura." };
  }
  return { ok: true, data };
}

// ------------------------------------------------------------------ resumo

export interface LiquidacaoParaResumo {
  valorLiquidado: number;
  statusCobranca: string;
  /**
   * Data em que o ente pagou o fornecedor. Omitir (undefined) = quem chama não
   * trabalha com essa regra e o resumo sai como antes; null = ainda não pagou.
   */
  dataPagamentoEnte?: DataDoPagamento;
}

export interface ResumoComissao {
  devida: number;
  recebida: number;
  faltaReceber: number;
  /**
   * Só quando alguma liquidação informou `dataPagamentoEnte` (mesmo null):
   * comissão "a cobrar" = pendente com o ente já tendo pago o fornecedor.
   */
  aCobrar?: number;
  /** Comissão pendente que ainda aguarda o pagamento do ente (não é "a cobrar"). */
  aguardandoPagamentoEnte?: number;
}

/** Soma de comissões sem o ruído de ponto flutuante (0,1 + 0,2 → 0,3). */
function emReais(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Comissão devida = soma do liquidado × percentual (de qualquer tipo —
 * original, aditivo ou renovação, todos com o mesmo percentual).
 * Recebida = só o que já foi marcado como "recebida".
 *
 * Quando as liquidações trazem `dataPagamentoEnte`, o resumo separa também
 * o que está "a cobrar" (ente já pagou o fornecedor) do que está "aguardando
 * pagamento do ente". "Falta receber" continua sendo devida − recebida: os
 * dois valores novos são partes dela.
 */
export function resumirComissao(liquidacoes: LiquidacaoParaResumo[], percentual: number): ResumoComissao {
  const devida = liquidacoes.reduce((soma, l) => soma + l.valorLiquidado * percentual, 0);
  const recebida = liquidacoes
    .filter((l) => l.statusCobranca === "recebida")
    .reduce((soma, l) => soma + l.valorLiquidado * percentual, 0);
  const resumo: ResumoComissao = { devida, recebida, faltaReceber: devida - recebida };

  if (liquidacoes.some((l) => l.dataPagamentoEnte !== undefined)) {
    const somaDaSituacao = (situacao: SituacaoCobranca) =>
      emReais(
        liquidacoes
          .filter((l) => situacaoDaLiquidacao(l) === situacao)
          .reduce((soma, l) => soma + l.valorLiquidado * percentual, 0),
      );
    resumo.aCobrar = somaDaSituacao("a_cobrar");
    resumo.aguardandoPagamentoEnte = somaDaSituacao("aguardando_pagamento_ente");
  }
  return resumo;
}
