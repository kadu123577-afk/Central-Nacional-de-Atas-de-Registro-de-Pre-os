/**
 * Regras puras do financeiro da SCP (2026-10-26, Projeto RNA etapa 7): sem
 * banco, sem rede, sem relógio (quem precisa de "agora" recebe por parâmetro).
 *
 * A operação comercial é organizada em Sociedade em Conta de Participação:
 * uma sócia ostensiva e sócios participantes, que partilham o resultado
 * apurado segundo percentuais de participação. A RECEITA da SCP é a comissão
 * efetivamente recebida (Liquidacao com statusCobranca "recebida"; ver
 * src/lib/recebiveis.ts e src/lib/comissao.ts); as DESPESAS são lançadas à mão.
 *
 * REGRA DE OURO: este arquivo (e os testes) não traz nenhum dado real da SCP:
 * nem nomes de sócios, nem percentuais de partilha, nem valores. Tudo é
 * cadastrado pelo administrador autorizado, pela tela, direto no banco.
 *
 * Convenções:
 * - Dinheiro é SEMPRE inteiro em centavos dentro das contas. O Decimal do
 *   banco entra por reaisParaCentavos e sai por centavosParaDecimal; nenhuma
 *   soma de reais em ponto flutuante.
 * - Percentual é FRAÇÃO (0.6 = 60%), a mesma do banco (Decimal) e de
 *   OportunidadeVenda.percentualComissao.
 * - Datas "só-dia" (vigência, despesa, período) ficam à meia-noite UTC.
 *   "Hoje" e o dia de um recebimento (que é um instante, não um dia) são
 *   o dia civil de Brasília (America/Sao_Paulo).
 *
 * Funções de LEITURA de texto digitado (interpretar*, ler*, periodo*) devolvem
 * resultado com erro ou nulo, nunca lançam. Funções de CONTA (apurar*,
 * receitaDeLiquidacao, reaisParaCentavos) lançam erro em entrada impossível
 * (NaN, negativo onde não cabe, participações que não fecham 100%): uma
 * partilha errada não pode sair em silêncio. Quem chama valida antes
 * (validarParticipacoes, validarParticipacoesDoPeriodo) e mostra a mensagem.
 */

import { lerDiaAAAAMMDD } from "./recebiveis";

export type ResultadoRegra = { ok: true } | { ok: false; erro: string };

// ───────────────────────────── vocabulário ─────────────────────────────

/** Texto fixo, não enum do Prisma (igual a categorias e estágios). */
export const TIPOS_SOCIO = ["ostensivo", "participante"] as const;
export type TipoSocio = (typeof TIPOS_SOCIO)[number];

export const ROTULO_TIPO_SOCIO: Record<TipoSocio, string> = {
  ostensivo: "Sócio ostensivo",
  participante: "Sócio participante",
};

export function tipoSocioValido(valor: string): valor is TipoSocio {
  return (TIPOS_SOCIO as readonly string[]).includes(valor);
}

// ───────────────────────────── dinheiro ─────────────────────────────

/** O que o banco devolve de uma coluna Decimal (Decimal do Prisma, texto ou número). */
export type ValorDecimal = number | string | { toString(): string };

/** Maior valor que cabe em Decimal(14,2), em centavos. */
export const LIMITE_CENTAVOS = 99_999_999_999_999;

function lerNumero(valor: ValorDecimal): number {
  if (typeof valor === "number") return valor;
  const texto = String(valor.toString()).trim();
  return texto === "" ? Number.NaN : Number(texto);
}

/**
 * Reais (como vêm do Decimal(14,2)) → centavos inteiros. Lança erro para
 * valor que não é número finito. O banco guarda no máximo 2 casas, então
 * Math.round(valor * 100) não perde nada.
 */
export function reaisParaCentavos(valor: ValorDecimal): number {
  const numero = lerNumero(valor);
  const centavos = Math.round(numero * 100);
  if (!Number.isFinite(numero) || !Number.isSafeInteger(centavos)) {
    throw new RangeError("Valor em reais inválido: não é um número finito.");
  }
  // Math.round(-0.4) é -0: nunca devolver zero negativo.
  return centavos === 0 ? 0 : centavos;
}

/** Centavos inteiros → texto "1234.56", que o Prisma aceita em coluna Decimal. */
export function centavosParaDecimal(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new RangeError("Centavos inválidos: precisa ser um número inteiro.");
  }
  const sinal = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${sinal}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Centavos → "R$ 1.234,56" (pt-BR, espaço comum, sinal na frente: "-R$ 100,01").
 * Feito com aritmética inteira, sem Intl, para o texto ser exato e estável.
 * Devolve "—" se não for inteiro seguro.
 */
export function formatarReais(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) return "—";
  const sinal = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const reais = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sinal}R$ ${reais},${String(abs % 100).padStart(2, "0")}`;
}

export type ResultadoCentavos = { ok: true; centavos: number } | { ok: false; erro: string };

/**
 * Lê o valor digitado em reais e devolve centavos inteiros, sem passar por
 * ponto flutuante. Aceita "1234", "1234,5", "1.234,56", "1234.56" e "R$ 1.234,56".
 * Ponto seguido de exatamente 3 dígitos e sem vírgula é milhar ("1.234" = 1234;
 * o primeiro grupo não começa por zero, então "0.500" é recusado);
 * ponto seguido de 1 ou 2 dígitos é decimal ("12.5" = 12,50). Recusa vazio,
 * negativo, mais de 2 casas e o que não cabe em Decimal(14,2). Zero é aceito
 * aqui; quem exige valor positivo (despesa) confere depois.
 */
export function interpretarReais(bruto: string): ResultadoCentavos {
  if (typeof bruto !== "string") return { ok: false, erro: "Informe o valor." };
  const texto = bruto.trim().replace(/^R\$\s*/i, "");
  if (texto === "") return { ok: false, erro: "Informe o valor." };

  let normalizado: string;
  if (texto.includes(",")) {
    // O primeiro grupo de milhar não começa por zero: "0.500,00" não é milhar, é erro de digitação.
    if (!/^([1-9]\d{0,2}(\.\d{3})+|\d+),\d{1,2}$/.test(texto)) return { ok: false, erro: ERRO_FORMATO_REAIS };
    normalizado = texto.replace(/\./g, "").replace(",", ".");
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(texto)) {
    normalizado = texto.replace(/\./g, "");
  } else if (/^\d+(\.\d{1,2})?$/.test(texto)) {
    normalizado = texto;
  } else {
    return { ok: false, erro: ERRO_FORMATO_REAIS };
  }

  const [inteiro, decimais = ""] = normalizado.split(".");
  // 12 dígitos de reais é o que Decimal(14,2) comporta.
  if (inteiro.replace(/^0+(?=\d)/, "").length > 12) return { ok: false, erro: ERRO_VALOR_GRANDE };
  const centavos = Number(inteiro) * 100 + Number(decimais.padEnd(2, "0"));
  if (centavos > LIMITE_CENTAVOS) return { ok: false, erro: ERRO_VALOR_GRANDE };
  return { ok: true, centavos };
}

const ERRO_FORMATO_REAIS = "Valor inválido. Use números, com vírgula nos centavos (ex.: 1.234,56).";
const ERRO_VALOR_GRANDE = "Valor grande demais.";

// ───────────────────────────── datas e períodos ─────────────────────────────

const DIA_MS = 86_400_000;

/** Meia-noite UTC do dia UTC de `data`, em milissegundos; NaN se a data for inválida. */
function diaMs(data: Date): number {
  const ms = data instanceof Date ? data.getTime() : Number.NaN;
  return Number.isNaN(ms) ? Number.NaN : Math.floor(ms / DIA_MS) * DIA_MS;
}

/** "AAAA-MM-DD" → "dd/mm/aaaa" de um dia só-data (UTC). */
function textoDoDia(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

const FORMATADOR_DIA_SAO_PAULO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Dia civil de Brasília de um instante (ex.: recebimento gravado com hora),
 * como dia só-data à meia-noite UTC. 22h30 de 31/10 em Brasília é 01h30 UTC de
 * 01/11, mas o recebimento é de 31/10. Nulo se o instante for inválido.
 */
export function diaEmSaoPaulo(instante: Date): Date | null {
  if (!(instante instanceof Date) || Number.isNaN(instante.getTime())) return null;
  const partes = FORMATADOR_DIA_SAO_PAULO.formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return new Date(Date.UTC(valor("year"), valor("month") - 1, valor("day")));
}

/** "Hoje" em Brasília como dia só-data (meia-noite UTC). `agora` vem de fora para o teste. */
export function hojeEmSaoPaulo(agora: Date): Date {
  const dia = diaEmSaoPaulo(agora);
  if (!dia) throw new RangeError("Instante inválido.");
  return dia;
}

/**
 * Intervalo de dias só-data, com as duas pontas INCLUÍDAS. `fimExclusivo` é o
 * dia seguinte ao fim, pronto para filtrar no banco: { gte: inicio, lt: fimExclusivo }.
 */
export interface PeriodoDias {
  inicio: Date;
  fim: Date;
  fimExclusivo: Date;
}

/** Monta o período a partir de duas datas (a hora é descartada). Nulo se inválido ou fim antes do início. */
export function periodoDeDias(inicio: Date, fim: Date): PeriodoDias | null {
  const ini = diaMs(inicio);
  const f = diaMs(fim);
  if (Number.isNaN(ini) || Number.isNaN(f) || f < ini) return null;
  return { inicio: new Date(ini), fim: new Date(f), fimExclusivo: new Date(f + DIA_MS) };
}

/** Período do mês (mes de 1 a 12, ano de 2000 a 2100). Nulo para o resto. */
export function periodoMensal(ano: number, mes: number): PeriodoDias | null {
  if (!Number.isInteger(ano) || !Number.isInteger(mes)) return null;
  if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12) return null;
  return periodoDeDias(new Date(Date.UTC(ano, mes - 1, 1)), new Date(Date.UTC(ano, mes, 0)));
}

/** Lê "AAAA-MM" (do parâmetro da URL ou do campo de mês) e devolve o período do mês. Nulo se ilegível. */
export function periodoMensalDeTexto(bruto: string): PeriodoDias | null {
  if (typeof bruto !== "string") return null;
  const partes = /^(\d{4})-(\d{2})$/.exec(bruto.trim());
  return partes ? periodoMensal(Number(partes[1]), Number(partes[2])) : null;
}

/** Lê duas datas "AAAA-MM-DD" (campos de data) e devolve o período. Nulo se alguma for inválida ou fim < início. */
export function periodoDeTextos(inicio: string, fim: string): PeriodoDias | null {
  if (typeof inicio !== "string" || typeof fim !== "string") return null;
  const ini = lerDiaAAAAMMDD(inicio);
  const f = lerDiaAAAAMMDD(fim);
  return ini && f ? periodoDeDias(ini, f) : null;
}

/** O dia (só-data, UTC) de `data` cai dentro do período (pontas incluídas)? */
export function dataNoPeriodo(data: Date, periodo: PeriodoDias): boolean {
  const dia = diaMs(data);
  return !Number.isNaN(dia) && dia >= periodo.inicio.getTime() && dia <= periodo.fim.getTime();
}

// ───────────────────────────── participações ─────────────────────────────

export interface ParticipacaoPercentual {
  socioId: string;
  /** Fração: 0.6 = 60%. */
  percentual: number;
}

export interface ParticipacaoVigencia extends ParticipacaoPercentual {
  /** Dia só-data (UTC) em que a participação começa (incluído). */
  vigenteDesde: Date;
  /** Dia só-data (UTC) em que termina (incluído). Nulo = em vigor. */
  vigenteAte: Date | null;
}

/** As somas dos percentuais fecham em 100% com esta tolerância (cobre o erro de ponto flutuante). */
export const TOLERANCIA_SOMA_PERCENTUAIS = 1e-9;

/** 0.99999999 → "99,999999%" (até 6 casas, sem zeros sobrando; mostra o que a soma realmente é). */
function percentualPorExtenso(fracao: number): string {
  return `${String(Number((fracao * 100).toFixed(6))).replace(".", ",")}%`;
}

/**
 * Valida o conjunto de participações vigentes numa data: ao menos um sócio,
 * cada percentual maior que 0 e no máximo 100%, nenhum sócio repetido, e soma
 * exatamente 100% (tolerância de 1e-9).
 */
export function validarParticipacoes(participacoesVigentes: readonly ParticipacaoPercentual[]): ResultadoRegra {
  if (!Array.isArray(participacoesVigentes) || participacoesVigentes.length === 0) {
    return { ok: false, erro: "Cadastre ao menos um sócio com participação vigente." };
  }

  const vistos = new Set<string>();
  let soma = 0;
  for (const p of participacoesVigentes) {
    if (!p || typeof p.socioId !== "string" || p.socioId.trim() === "") {
      return { ok: false, erro: "Há uma participação sem sócio identificado." };
    }
    if (typeof p.percentual !== "number" || !Number.isFinite(p.percentual) || p.percentual <= 0 || p.percentual > 1) {
      return { ok: false, erro: "Cada percentual de participação deve ser maior que 0% e no máximo 100%." };
    }
    if (vistos.has(p.socioId)) {
      return { ok: false, erro: "O mesmo sócio aparece mais de uma vez nas participações vigentes." };
    }
    vistos.add(p.socioId);
    soma += p.percentual;
  }

  if (Math.abs(soma - 1) > TOLERANCIA_SOMA_PERCENTUAIS) {
    return {
      ok: false,
      erro: `A soma das participações vigentes deve ser exatamente 100%, mas está em ${percentualPorExtenso(soma)}.`,
    };
  }
  return { ok: true };
}

/**
 * As participações vigentes numa data: vigenteDesde <= data e (vigenteAte
 * nulo ou >= data). Compara por dia (a hora de `data` não conta) e devolve os
 * mesmos objetos recebidos. Data inválida, ou participação com data inválida,
 * não entra.
 */
export function participacoesVigentesEm<T extends Pick<ParticipacaoVigencia, "vigenteDesde" | "vigenteAte">>(
  data: Date,
  participacoes: readonly T[],
): T[] {
  const dia = diaMs(data);
  if (Number.isNaN(dia)) return [];
  return participacoes.filter((p) => {
    const desde = diaMs(p.vigenteDesde);
    const ate = p.vigenteAte == null ? Number.POSITIVE_INFINITY : diaMs(p.vigenteAte);
    // NaN em qualquer ponta torna a comparação falsa: a linha não vigora.
    return desde <= dia && dia <= ate;
  });
}

/**
 * Cada sócio só pode ter uma participação por dia: recusa vigências do mesmo
 * sócio que se sobrepõem (as pontas contam; encerrar em 31/12 e abrir em 01/01
 * é correto), vigência com data inválida e vigência que termina antes de
 * começar. Sócios diferentes podem coincidir no tempo, é o normal.
 */
export function validarSemSobreposicao(participacoes: readonly ParticipacaoVigencia[]): ResultadoRegra {
  const porSocio = new Map<string, { desde: number; ate: number }[]>();

  for (const p of participacoes) {
    const desde = diaMs(p.vigenteDesde);
    const ate = p.vigenteAte == null ? Number.POSITIVE_INFINITY : diaMs(p.vigenteAte);
    if (Number.isNaN(desde) || Number.isNaN(ate)) {
      return { ok: false, erro: "Há uma participação com data de vigência inválida." };
    }
    if (ate < desde) {
      return { ok: false, erro: "A vigência de uma participação termina antes de começar." };
    }
    const lista = porSocio.get(p.socioId) ?? [];
    lista.push({ desde, ate });
    porSocio.set(p.socioId, lista);
  }

  for (const lista of porSocio.values()) {
    lista.sort((a, b) => a.desde - b.desde);
    // Ordenado pelo início, basta olhar vizinhas: se alguma sobrepõe outra, sobrepõe a próxima.
    for (let i = 1; i < lista.length; i++) {
      if (lista[i].desde <= lista[i - 1].ate) {
        return { ok: false, erro: "Um mesmo sócio tem participações com datas de vigência que se sobrepõem." };
      }
    }
  }
  return { ok: true };
}

/** Trecho do período em que o conjunto de participações vigentes não muda. */
export interface FaixaDeVigencia<T> {
  inicio: Date;
  fim: Date;
  participacoes: T[];
}

/**
 * Divide o período nos trechos em que as participações vigentes são sempre as
 * mesmas: um corte em cada início de vigência e no dia seguinte a cada fim de
 * vigência que caem dentro do período.
 */
export function faixasDoPeriodo<T extends Pick<ParticipacaoVigencia, "vigenteDesde" | "vigenteAte">>(
  periodo: PeriodoDias,
  participacoes: readonly T[],
): FaixaDeVigencia<T>[] {
  const inicio = periodo.inicio.getTime();
  const fim = periodo.fim.getTime();

  const cortes = new Set<number>([inicio]);
  for (const p of participacoes) {
    const desde = diaMs(p.vigenteDesde);
    if (desde > inicio && desde <= fim) cortes.add(desde);
    if (p.vigenteAte != null) {
      const seguinte = diaMs(p.vigenteAte) + DIA_MS;
      if (seguinte > inicio && seguinte <= fim) cortes.add(seguinte);
    }
  }

  const ordenados = Array.from(cortes).sort((a, b) => a - b);
  return ordenados.map((corte, i) => {
    const ultimoDia = i + 1 < ordenados.length ? ordenados[i + 1] - DIA_MS : fim;
    return {
      inicio: new Date(corte),
      fim: new Date(ultimoDia),
      participacoes: participacoesVigentesEm(new Date(corte), participacoes),
    };
  });
}

/**
 * Confere o período inteiro, dia a dia (por trechos): sem sobreposição por sócio
 * e, em TODOS os trechos, participações vigentes que somam 100%. É o que a
 * apuração por faixas exige; a tela pode chamar antes para explicar o problema.
 */
export function validarParticipacoesDoPeriodo(
  periodo: PeriodoDias,
  participacoes: readonly ParticipacaoVigencia[],
): ResultadoRegra {
  const semSobreposicao = validarSemSobreposicao(participacoes);
  if (!semSobreposicao.ok) return semSobreposicao;

  for (const faixa of faixasDoPeriodo(periodo, participacoes)) {
    const trecho = `de ${textoDoDia(faixa.inicio.getTime())} a ${textoDoDia(faixa.fim.getTime())}`;
    if (faixa.participacoes.length === 0) {
      return { ok: false, erro: `Não há participações vigentes ${trecho}.` };
    }
    const validacao = validarParticipacoes(faixa.participacoes);
    if (!validacao.ok) return { ok: false, erro: `Participações ${trecho}: ${validacao.erro}` };
  }
  return { ok: true };
}

// ───────────────────────────── apuração e partilha ─────────────────────────────

export interface ParteDoSocio {
  socioId: string;
  /** Pode ser negativo (prejuízo). */
  centavos: number;
}

export interface ApuracaoDoPeriodo {
  /** Receitas - despesas, em centavos. Negativo é prejuízo. */
  resultadoCentavos: number;
  /** Na ordem das participações recebidas. A soma é exatamente `resultadoCentavos`. */
  partilha: ParteDoSocio[];
}

function centavosNaoNegativos(valor: unknown, nome: string): number {
  if (typeof valor !== "number" || !Number.isSafeInteger(valor) || valor < 0) {
    throw new RangeError(`${nome} precisa ser um número inteiro de centavos, zero ou maior.`);
  }
  return valor;
}

/** "lucro" | "prejuizo" | "zerado": para o relatório sinalizar o prejuízo. */
export function situacaoDoResultado(resultadoCentavos: number): "lucro" | "prejuizo" | "zerado" {
  return resultadoCentavos > 0 ? "lucro" : resultadoCentavos < 0 ? "prejuizo" : "zerado";
}

/** Pesos inteiros: 1e9 deixa o percentual com resolução muito maior que a do banco (4 casas). */
const ESCALA_DO_PESO = 1_000_000_000;

/**
 * Divide `total` (centavos inteiros, >= 0) entre as participações pelo método
 * do MAIOR RESTO, em aritmética inteira exata (BigInt): cada sócio recebe a
 * parte inteira da sua cota e os centavos que sobram vão, um a um, a quem tem
 * o maior resto (empate: maior percentual, depois a ordem recebida). A soma é
 * sempre exatamente `total`. Os pesos são normalizados pela soma, então até um
 * conjunto que fecha 100% só dentro da tolerância não desfaz a conta.
 */
function ratear(total: number, participacoes: readonly ParticipacaoPercentual[]): number[] {
  const pesos = participacoes.map((p) => BigInt(Math.round(p.percentual * ESCALA_DO_PESO)));
  const somaPesos = pesos.reduce((soma, peso) => soma + peso, BigInt(0));
  if (somaPesos <= BigInt(0)) throw new RangeError("Participações sem peso: nada a partilhar.");

  const bruto = BigInt(total);
  const partes = pesos.map((peso) => (bruto * peso) / somaPesos);
  const restos = pesos.map((peso) => (bruto * peso) % somaPesos);

  const distribuido = partes.reduce((soma, parte) => soma + parte, BigInt(0));
  // Cada resto é menor que a soma dos pesos, então faltam menos centavos que sócios.
  const faltam = Number(bruto - distribuido);

  const ordem = participacoes
    .map((_, i) => i)
    .sort((a, b) => {
      if (restos[a] !== restos[b]) return restos[a] > restos[b] ? -1 : 1;
      if (pesos[a] !== pesos[b]) return pesos[a] > pesos[b] ? -1 : 1;
      return a - b;
    });
  for (let k = 0; k < faltam; k++) partes[ordem[k]] += BigInt(1);

  return partes.map((parte) => Number(parte));
}

/** Partilha de um resultado (positivo, negativo ou zero) entre as participações; sem zero negativo. */
function partilharResultado(
  resultadoCentavos: number,
  participacoes: readonly ParticipacaoPercentual[],
): ParteDoSocio[] {
  const partes = ratear(Math.abs(resultadoCentavos), participacoes);
  return participacoes.map((p, i) => ({
    socioId: p.socioId,
    // O prejuízo se reparte pelos mesmos percentuais do lucro.
    centavos: resultadoCentavos < 0 && partes[i] !== 0 ? -partes[i] : partes[i],
  }));
}

/**
 * Apura um período com UM conjunto de participações: resultado = receitas -
 * despesas (pode ser negativo; o prejuízo também se reparte pelos mesmos
 * percentuais) e partilha pelo método do maior resto, de modo que a SOMA da
 * partilha seja exatamente o resultado, em centavos. Lança erro se receitas ou
 * despesas não forem inteiros >= 0 ou se as participações não passarem em
 * validarParticipacoes.
 *
 * LIMITAÇÃO: usa um único conjunto de percentuais para o período todo. Se a
 * participação muda no meio do período, use apurarPorFaixas, que aplica a
 * vigente de cada dia a cada lançamento.
 */
export function apurarPeriodo(entrada: {
  receitasCentavos: number;
  despesasCentavos: number;
  participacoes: readonly ParticipacaoPercentual[];
}): ApuracaoDoPeriodo {
  const receitas = centavosNaoNegativos(entrada.receitasCentavos, "A receita");
  const despesas = centavosNaoNegativos(entrada.despesasCentavos, "A despesa");
  const validacao = validarParticipacoes(entrada.participacoes);
  if (!validacao.ok) throw new RangeError(validacao.erro);

  const resultadoCentavos = receitas - despesas;
  return { resultadoCentavos, partilha: partilharResultado(resultadoCentavos, entrada.participacoes) };
}

/** Um lançamento com data: receita recebida ou despesa, em centavos (>= 0). */
export interface Lancamento {
  /** Dia só-data (UTC). A hora, se houver, é descartada. */
  data: Date;
  centavos: number;
}

export interface FaixaApurada extends ApuracaoDoPeriodo {
  inicio: Date;
  fim: Date;
  receitasCentavos: number;
  despesasCentavos: number;
}

export interface ApuracaoPorFaixas extends ApuracaoDoPeriodo {
  receitasCentavos: number;
  despesasCentavos: number;
  /** Cada trecho do período em que as participações vigentes são as mesmas. */
  faixas: FaixaApurada[];
}

/**
 * Apura o período por FAIXAS DE VIGÊNCIA: cada receita e cada despesa vai para
 * o trecho em que a sua data cai e é partilhada pelos percentuais vigentes
 * naquele trecho; o total de cada sócio é a soma das suas partes nos trechos.
 * Cada trecho fecha em centavos (maior resto), então o total também fecha.
 * Lançamentos fora do período são ignorados (quem chama pode passar uma lista
 * maior). Lança erro se algum lançamento tiver data inválida ou centavos que
 * não sejam inteiros >= 0, ou se as participações não fecharem 100% em todo o
 * período (veja validarParticipacoesDoPeriodo).
 */
export function apurarPorFaixas(entrada: {
  periodo: PeriodoDias;
  receitas: readonly Lancamento[];
  despesas: readonly Lancamento[];
  participacoes: readonly ParticipacaoVigencia[];
}): ApuracaoPorFaixas {
  const periodo = periodoDeDias(entrada.periodo.inicio, entrada.periodo.fim);
  if (!periodo) throw new RangeError("Período inválido.");

  const validacao = validarParticipacoesDoPeriodo(periodo, entrada.participacoes);
  if (!validacao.ok) throw new RangeError(validacao.erro);

  const faixas = faixasDoPeriodo(periodo, entrada.participacoes);
  const receitasPorFaixa = faixas.map(() => 0);
  const despesasPorFaixa = faixas.map(() => 0);

  const distribuir = (lancamentos: readonly Lancamento[], destino: number[], nome: string) => {
    for (const l of lancamentos) {
      const centavos = centavosNaoNegativos(l?.centavos, nome);
      const dia = diaMs(l.data);
      if (Number.isNaN(dia)) throw new RangeError(`${nome}: data inválida.`);
      if (dia < periodo.inicio.getTime() || dia > periodo.fim.getTime()) continue;
      const i = faixas.findIndex((f) => dia >= f.inicio.getTime() && dia <= f.fim.getTime());
      destino[i] += centavos;
      if (!Number.isSafeInteger(destino[i])) throw new RangeError(`${nome}: soma grande demais.`);
    }
  };
  distribuir(entrada.receitas, receitasPorFaixa, "A receita");
  distribuir(entrada.despesas, despesasPorFaixa, "A despesa");

  const totais = new Map<string, number>();
  const apuradas: FaixaApurada[] = faixas.map((faixa, i) => {
    const apuracao = apurarPeriodo({
      receitasCentavos: receitasPorFaixa[i],
      despesasCentavos: despesasPorFaixa[i],
      participacoes: faixa.participacoes,
    });
    for (const parte of apuracao.partilha) {
      totais.set(parte.socioId, (totais.get(parte.socioId) ?? 0) + parte.centavos);
    }
    return {
      inicio: faixa.inicio,
      fim: faixa.fim,
      receitasCentavos: receitasPorFaixa[i],
      despesasCentavos: despesasPorFaixa[i],
      ...apuracao,
    };
  });

  const receitasCentavos = receitasPorFaixa.reduce((soma, v) => soma + v, 0);
  const despesasCentavos = despesasPorFaixa.reduce((soma, v) => soma + v, 0);
  return {
    receitasCentavos,
    despesasCentavos,
    resultadoCentavos: receitasCentavos - despesasCentavos,
    partilha: Array.from(totais, ([socioId, centavos]) => ({ socioId, centavos: centavos === 0 ? 0 : centavos })),
    faixas: apuradas,
  };
}

// ───────────────────────────── receita (comissão recebida) ─────────────────────────────

const PPM = 1_000_000;

/**
 * Comissão de UMA liquidação, em centavos: valor liquidado x percentual da
 * comissão (fração), com arredondamento comum (meio centavo sobe) feito UMA vez,
 * no fim, sobre o produto exato (nunca sobre somas já arredondadas). Percentual
 * ausente (oportunidade sem percentual definido) dá 0: não há comissão a
 * calcular. O percentual é lido com 6 casas, mais que as 4 do banco.
 * Lança erro para valor que não seja número finito >= 0 e para percentual
 * fora de 0 a 1 (5 em vez de 0.05 é erro de digitação, não comissão de 500%).
 */
export function receitaDeLiquidacao(l: {
  valorLiquidado: ValorDecimal;
  percentualComissao?: ValorDecimal | null;
}): number {
  const centavos = reaisParaCentavos(l.valorLiquidado);
  if (centavos < 0) throw new RangeError("Valor liquidado negativo.");
  if (l.percentualComissao == null) return 0;

  const percentual = lerNumero(l.percentualComissao);
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 1) {
    throw new RangeError("Percentual de comissão inválido: use fração de 0 a 1 (0.05 = 5%).");
  }
  const ppm = Math.round(percentual * PPM);
  // BigInt porque centavos x ppm pode passar de 2^53 em valores muito altos.
  const arredondado = (BigInt(centavos) * BigInt(ppm) + BigInt(PPM / 2)) / BigInt(PPM);
  return Number(arredondado);
}

export interface LiquidacaoParaReceita {
  valorLiquidado: ValorDecimal;
  /** Da oportunidade de venda (OportunidadeVenda.percentualComissao). */
  percentualComissao?: ValorDecimal | null;
  statusCobranca: string;
  /** Instante em que a comissão foi recebida (Liquidacao.dataRecebimento). */
  dataRecebimento?: Date | null;
}

export interface ReceitaRecebida {
  /** Uma por liquidação recebida no período, com o dia (Brasília) do recebimento. */
  lancamentos: Lancamento[];
  /** Soma das comissões recebidas no período, em centavos. */
  centavos: number;
  /** Recebidas sem data de recebimento: não dá para saber o período, ficam de fora. */
  semDataRecebimento: number;
  /** Recebidas no período cuja oportunidade não tem percentual: entram com 0. */
  semPercentual: number;
}

/**
 * Receita da SCP no período: a comissão efetivamente RECEBIDA (statusCobranca
 * "recebida") cujo recebimento cai no período, pelo dia civil de Brasília.
 * Cobrada e pendente não entram. Cada liquidação é arredondada em centavos
 * separadamente (é uma nota de comissão por liquidação) e só então somada.
 * Devolve também os avisos (sem data, sem percentual) para a tela mostrar.
 */
export function receitaRecebidaNoPeriodo(
  liquidacoes: readonly LiquidacaoParaReceita[],
  periodo: PeriodoDias,
): ReceitaRecebida {
  const lancamentos: Lancamento[] = [];
  let semDataRecebimento = 0;
  let semPercentual = 0;

  for (const l of liquidacoes) {
    if (l.statusCobranca !== "recebida") continue;
    const dia = l.dataRecebimento ? diaEmSaoPaulo(l.dataRecebimento) : null;
    if (!dia) {
      semDataRecebimento += 1;
      continue;
    }
    if (!dataNoPeriodo(dia, periodo)) continue;
    if (l.percentualComissao == null) semPercentual += 1;
    lancamentos.push({ data: dia, centavos: receitaDeLiquidacao(l) });
  }

  const centavos = lancamentos.reduce((soma, l) => soma + l.centavos, 0);
  if (!Number.isSafeInteger(centavos)) throw new RangeError("Receita grande demais.");
  return { lancamentos, centavos, semDataRecebimento, semPercentual };
}

/** Só o total (centavos) da receitaRecebidaNoPeriodo. */
export function somarReceitaRecebida(liquidacoes: readonly LiquidacaoParaReceita[], periodo: PeriodoDias): number {
  return receitaRecebidaNoPeriodo(liquidacoes, periodo).centavos;
}

// ───────────────────────────── percentual digitado ─────────────────────────────

export type ResultadoFracao = { ok: true; fracao: number } | { ok: false; erro: string };

/**
 * Lê a participação digitada ("60", "33,33", "33.33" ou "60%", no máximo 2
 * casas) e devolve a fração (0.6, 0.3333). Recusa vazio, 0%, mais de 100% e
 * mais casas do que o banco guarda (Decimal(7,4)), em vez de arredondar.
 */
export function interpretarPercentualParticipacao(bruto: string): ResultadoFracao {
  const erro = {
    ok: false as const,
    erro: "Informe a participação em %, entre 0,01 e 100, com até 2 casas (ex.: 33,33).",
  };
  if (typeof bruto !== "string") return erro;
  const texto = bruto.trim().replace(/%$/, "").trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(texto)) return erro;

  const [inteiro, decimais = ""] = texto.split(".");
  const centesimos = Number(inteiro) * 100 + Number(decimais.padEnd(2, "0"));
  if (centesimos <= 0 || centesimos > 10_000) return erro;
  return { ok: true, fracao: centesimos / 10_000 };
}

/** Fração → "0.6000", para gravar em Decimal(7,4). */
export function fracaoParaDecimal(fracao: number): string {
  if (!Number.isFinite(fracao)) throw new RangeError("Fração inválida.");
  return fracao.toFixed(4);
}
