/**
 * Comissão SUGERIDA por faixa de valor da ata (2026-10-23, Projeto RNA
 * etapa 6). Regras puras — sem banco, sem rede, sem relógio.
 *
 * A comissão é paga pelo fornecedor, sobre o que o ente liquidou e pagou
 * (src/lib/comissao.ts, src/lib/recebiveis.ts). Ao montar o contrato de
 * intermediação de uma ata, a plataforma pode SUGERIR o percentual conforme o
 * valor total dela. Os números (a partir de que valor, quanto por cento) são
 * do dono do produto e ficam na tabela faixas_comissao, configurados pelo
 * administrador: NENHUM percentual padrão existe neste arquivo. Sem faixa
 * aplicável, a sugestão é "nenhuma" e a tela diz por quê. O percentual que
 * vale é sempre o pactuado no contrato; a sugestão só preenche o campo.
 *
 * Convenção: percentual é FRAÇÃO (0.0525 = 5,25%), a mesma do banco
 * (Decimal(5,4)) e de OportunidadeVenda.percentualComissao.
 */

/** Visão simples de uma faixa (o que a regra precisa; a tela traz o resto). */
export type FaixaComissaoView = {
  /** Valor total da ata, em reais, a partir do qual a faixa vale. */
  valorMinimo: number;
  /** Fração: 0.0525 = 5,25%. */
  percentual: number;
};

/** Menor percentual aceito (0,01%): abaixo disso a faixa não faz sentido. */
export const PERCENTUAL_SUGERIDO_MINIMO = 0.0001;
/** Maior percentual aceito (30%): teto de sanidade contra erro de digitação. */
export const PERCENTUAL_SUGERIDO_MAXIMO = 0.3;
/** Maior valor que cabe na coluna Decimal(16,2). */
export const VALOR_MINIMO_FAIXA_MAXIMO = 99_999_999_999_999.99;

export type SugestaoComissao = {
  /** Fração sugerida; nulo quando nenhuma faixa se aplica. */
  percentual: number | null;
  /** Faixa escolhida; nula quando nenhuma se aplica. */
  faixa: FaixaComissaoView | null;
  /** Frase curta, em português, explicando a sugestão (ou a falta dela). */
  motivo: string;
};

export type ResultadoFaixa = { ok: true } | { ok: false; erro: string };

// ───────────────────────── Formatação (pt-BR) ─────────────────────────

/** Fração → "5,25%" (até 2 casas, sem zeros sobrando: 0.05 → "5%", 0.075 → "7,5%"). */
export function formatarPercentual(fracao: number): string {
  if (!Number.isFinite(fracao)) return "—";
  // Arredonda em centésimos de ponto percentual antes de formatar, para não
  // exibir lixo de ponto flutuante (0.0525 * 100 = 5.2500000000000001).
  const pontos = Math.round(fracao * 10_000) / 100;
  return `${pontos.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

/** Fração → "5,25" (sem o %), para preencher o campo de digitação do admin. */
export function formatarPercentualCampo(fracao: number): string {
  return formatarPercentual(fracao).replace("%", "");
}

/** Reais → "R$ 1.000.000,00" com espaço comum (o nbsp do Intl atrapalha comparação). */
export function formatarValorFaixa(valor: number): string {
  if (!Number.isFinite(valor)) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
}

/**
 * Lê o percentual digitado ("5,25", "5.25" ou "5,25%", no máximo 2 casas) e
 * devolve a fração (0.0525). Texto vazio, ilegível ou com mais casas do que o
 * banco guarda volta nulo, em vez de arredondar em silêncio; o limite de
 * negócio fica com validarFaixa.
 */
export function interpretarPercentualDigitado(bruto: string): number | null {
  const texto = bruto.trim().replace(/%$/, "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) return null;
  const pontos = Number(texto);
  if (!Number.isFinite(pontos)) return null;
  return Math.round(pontos * 100) / 10_000;
}

// ───────────────────────── Validação ─────────────────────────

/**
 * true quando o número tem no máximo `casas` casas decimais, tolerando o erro
 * do ponto flutuante. A tolerância cresce com a grandeza (valores de centenas
 * de milhões já têm erro de ponto flutuante maior que 1e-6 depois de x100) e
 * fica bem abaixo de meio centavo, para 10,005 continuar recusado.
 */
function temNoMaximoCasas(numero: number, casas: number): boolean {
  const escalado = numero * 10 ** casas;
  const tolerancia = Math.min(0.1, Math.max(1e-6, Math.abs(escalado) * 1e-14));
  return Math.abs(escalado - Math.round(escalado)) <= tolerancia;
}

/** Faixa utilizável no cálculo: números finitos, valor >= 0 e percentual dentro do teto. */
function faixaUtilizavel(f: FaixaComissaoView | null | undefined): f is FaixaComissaoView {
  if (!f || typeof f.valorMinimo !== "number" || typeof f.percentual !== "number") return false;
  return (
    Number.isFinite(f.valorMinimo) &&
    f.valorMinimo >= 0 &&
    Number.isFinite(f.percentual) &&
    f.percentual > 0 &&
    f.percentual <= PERCENTUAL_SUGERIDO_MAXIMO
  );
}

/**
 * Valida uma faixa antes de gravar: percentual entre 0,01% e 30% (fração
 * 0,0001 a 0,3, no máximo 2 casas em %), valor mínimo de 0 em diante (no
 * máximo centavos e dentro do que a coluna comporta).
 */
export function validarFaixa(faixa: { valorMinimo: number; percentual: number }): ResultadoFaixa {
  const { valorMinimo, percentual } = faixa;
  if (typeof valorMinimo !== "number" || !Number.isFinite(valorMinimo)) {
    return { ok: false, erro: "Informe o valor a partir do qual a faixa vale." };
  }
  if (valorMinimo < 0) {
    return { ok: false, erro: "O valor da faixa não pode ser negativo." };
  }
  if (valorMinimo > VALOR_MINIMO_FAIXA_MAXIMO) {
    return { ok: false, erro: "O valor da faixa é grande demais." };
  }
  if (!temNoMaximoCasas(valorMinimo, 2)) {
    return { ok: false, erro: "O valor da faixa aceita no máximo centavos (2 casas decimais)." };
  }
  if (typeof percentual !== "number" || !Number.isFinite(percentual)) {
    return { ok: false, erro: "Informe o percentual da faixa." };
  }
  if (percentual < PERCENTUAL_SUGERIDO_MINIMO || percentual > PERCENTUAL_SUGERIDO_MAXIMO) {
    return {
      ok: false,
      erro: `O percentual da faixa deve ficar entre ${formatarPercentual(PERCENTUAL_SUGERIDO_MINIMO)} e ${formatarPercentual(PERCENTUAL_SUGERIDO_MAXIMO)}.`,
    };
  }
  if (!temNoMaximoCasas(percentual, 4)) {
    return { ok: false, erro: "O percentual da faixa aceita no máximo 2 casas decimais (ex.: 5,25%)." };
  }
  return { ok: true };
}

// ───────────────────────── Escolha da faixa ─────────────────────────

/** Faixas utilizáveis (inválidas saem), em ordem crescente de valor mínimo. */
export function faixasValidas(faixas: readonly FaixaComissaoView[]): FaixaComissaoView[] {
  return faixas.filter(faixaUtilizavel).sort((a, b) => a.valorMinimo - b.valorMinimo);
}

/**
 * Sugere o percentual para uma ata: vale a faixa de MAIOR valorMinimo que seja
 * menor ou igual ao valor total da ata. Faixas inválidas são ignoradas (não
 * derrubam o cálculo). Se duas faixas tiverem o mesmo valorMinimo (o banco não
 * permite), vale a primeira da lista. Não altera a lista recebida.
 */
export function sugerirPercentual(valorTotalAta: number, faixas: readonly FaixaComissaoView[]): SugestaoComissao {
  const validas = faixasValidas(faixas ?? []);
  if (validas.length === 0) {
    return { percentual: null, faixa: null, motivo: "Nenhuma faixa configurada" };
  }
  if (typeof valorTotalAta !== "number" || !Number.isFinite(valorTotalAta) || valorTotalAta < 0) {
    return { percentual: null, faixa: null, motivo: "Valor total da ata inválido" };
  }
  let escolhida: FaixaComissaoView | null = null;
  for (const f of validas) {
    // Fica com a de maior valorMinimo que cabe; o `>` estrito (e o sort estável)
    // faz a primeira da lista vencer um eventual empate de valorMinimo.
    if (f.valorMinimo <= valorTotalAta && (escolhida === null || f.valorMinimo > escolhida.valorMinimo)) {
      escolhida = f;
    }
  }
  if (!escolhida) {
    return { percentual: null, faixa: null, motivo: "Valor abaixo da primeira faixa" };
  }
  return {
    percentual: escolhida.percentual,
    faixa: escolhida,
    motivo: `Faixa a partir de ${formatarValorFaixa(escolhida.valorMinimo)}: ${formatarPercentual(escolhida.percentual)}`,
  };
}

// ───────────────────────── Valor total da ata ─────────────────────────

/**
 * Soma quantidade registrada × valor unitário de todos os itens, contando em
 * centavos inteiros para não acumular erro de ponto flutuante. Item com
 * quantidade ou valor inválido (NaN, infinito, negativo) conta zero.
 */
export function valorTotalDaAta(itens: readonly { quantidadeRegistrada: number; valorUnitario: number }[]): number {
  let centavos = 0;
  for (const item of itens ?? []) {
    const qtd = item?.quantidadeRegistrada;
    const unit = item?.valorUnitario;
    if (typeof qtd !== "number" || typeof unit !== "number") continue;
    if (!Number.isFinite(qtd) || !Number.isFinite(unit) || qtd < 0 || unit < 0) continue;
    centavos += Math.round(Math.round(unit * 100) * qtd);
  }
  return centavos / 100;
}
