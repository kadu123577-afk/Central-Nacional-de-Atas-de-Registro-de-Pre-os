/**
 * Indicadores semanais da operação comercial (Projeto RNA, etapa 6,
 * 2026-10-23) — funções puras, sem banco nem rede. Aqui ficam a definição de
 * "semana" (segunda a domingo, no horário de Brasília), a variação contra a
 * semana anterior e a montagem do resumo por consultor e no total. As
 * consultas ficam em src/lib/indicadores-db.ts.
 *
 * Nenhuma meta numérica: a única referência é a semana anterior.
 */
import { lerDiaAAAAMMDD } from "./recebiveis";

const FUSO = "America/Sao_Paulo";
const DIA_MS = 24 * 60 * 60 * 1000;
/** Brasília está a 3 horas de Londres desde que o horário de verão acabou (2019); o cálculo abaixo se corrige sozinho para datas antigas. */
const PALPITE_DESLOCAMENTO_MS = 3 * 60 * 60 * 1000;

const FORMATO_CIVIL = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Relógio de parede de Brasília num instante, escrito como se fosse UTC (para fazer contas de calendário). */
function civilComoUtc(instante: number): number {
  const partes = FORMATO_CIVIL.formatToParts(new Date(instante));
  const n = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? "0");
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") % 24, n("minute"), n("second"));
}

/** Instante em que o dia (dado à meia-noite UTC) começa em Brasília. */
function meiaNoiteBrasilia(diaUtcMs: number): Date {
  let instante = diaUtcMs + PALPITE_DESLOCAMENTO_MS;
  for (let i = 0; i < 2; i += 1) instante += diaUtcMs - civilComoUtc(instante);
  return new Date(instante);
}

function diaIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Uma semana de segunda a domingo em Brasília.
 *
 * Duas réguas, porque o banco guarda dois tipos de data: `inicio`/`fim` são
 * instantes (use em campos com hora: criadoEm, atualizadoEm, dataRecebimento)
 * e `diaInicio`/`diaFim` são a meia-noite UTC dos mesmos dias (use em campos
 * só-data, como Liquidacao.dataLiquidacao, gravados à meia-noite UTC). Usar a
 * régua errada joga a segunda-feira na semana anterior. `fim` e `diaFim` são
 * exclusivos (a segunda-feira seguinte).
 */
export interface Semana {
  inicio: Date;
  fim: Date;
  diaInicio: Date;
  diaFim: Date;
  /** AAAA-MM-DD da segunda-feira. */
  segunda: string;
  /** AAAA-MM-DD do domingo. */
  domingo: string;
}

function semanaComSegunda(segundaMs: number): Semana {
  const proximaMs = segundaMs + 7 * DIA_MS;
  return {
    inicio: meiaNoiteBrasilia(segundaMs),
    fim: meiaNoiteBrasilia(proximaMs),
    diaInicio: new Date(segundaMs),
    diaFim: new Date(proximaMs),
    segunda: diaIso(segundaMs),
    domingo: diaIso(proximaMs - DIA_MS),
  };
}

/** A semana (segunda a domingo, horário de Brasília) que contém o instante. */
export function semanaDe(data: Date): Semana {
  const instante = data.getTime();
  if (!Number.isFinite(instante)) throw new RangeError("Data inválida para calcular a semana.");
  const civil = new Date(civilComoUtc(instante));
  const desdeSegunda = (civil.getUTCDay() + 6) % 7;
  return semanaComSegunda(
    Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate() - desdeSegunda),
  );
}

export function semanaAnterior(semana: Semana): Semana {
  return semanaComSegunda(semana.diaInicio.getTime() - 7 * DIA_MS);
}

export function semanaSeguinte(semana: Semana): Semana {
  return semanaComSegunda(semana.diaInicio.getTime() + 7 * DIA_MS);
}

/** Dia de hoje em Brasília (AAAA-MM-DD). */
export function hojeEmBrasilia(agora: Date): string {
  return diaIso(civilComoUtc(agora.getTime()));
}

/** "19/10 a 25/10/2026" (com os dois anos quando a semana atravessa o réveillon). */
export function rotuloSemana(semana: Semana): string {
  const [a1, m1, d1] = semana.segunda.split("-");
  const [a2, m2, d2] = semana.domingo.split("-");
  return a1 === a2 ? `${d1}/${m1} a ${d2}/${m2}/${a2}` : `${d1}/${m1}/${a1} a ${d2}/${m2}/${a2}`;
}

export interface SemanaEscolhida {
  semana: Semana;
  /** Presente quando o valor de ?semana= foi recusado; a semana devolvida é a atual. */
  erro?: string;
}

/**
 * Lê ?semana=AAAA-MM-DD (qualquer dia da semana desejada). Sem valor, vale a
 * semana atual. Formato errado, data que não existe, ano antes de 2000 ou
 * semana que ainda não começou voltam para a semana atual, com a mensagem.
 */
export function escolherSemana(valor: string | string[] | undefined, agora: Date): SemanaEscolhida {
  const atual = semanaDe(agora);
  const texto = (Array.isArray(valor) ? valor[0] : valor)?.trim();
  if (!texto) return { semana: atual };

  const dia = lerDiaAAAAMMDD(texto);
  if (!dia) return { semana: atual, erro: "A data informada não é válida. Mostrando a semana atual." };

  // Meio-dia UTC é 9h em Brasília: o mesmo dia do calendário, sem risco de virar o dia.
  const escolhida = semanaDe(new Date(dia.getTime() + 12 * 60 * 60 * 1000));
  if (escolhida.inicio.getTime() > agora.getTime()) {
    return { semana: atual, erro: "Essa semana ainda não começou. Mostrando a semana atual." };
  }
  return { semana: escolhida };
}

/**
 * "Negociações ativas" é uma foto do estágio, e o sistema não guarda histórico
 * de estágio: só a semana em andamento tem foto exata; nas passadas o número
 * é um mínimo (ver indicadores-db.ts).
 */
export function fotoExata(semana: Semana, agora: Date): boolean {
  return semana.inicio.getTime() <= agora.getTime() && agora.getTime() < semana.fim.getTime();
}

// ------------------------------------------------------------------ variação

export interface Variacao {
  /** atual − anterior (em reais, arredondado ao centavo). */
  diferenca: number;
  /** Percentual sobre a semana anterior, com 1 casa; null quando a anterior é zero e a atual não (não há base para dividir). */
  percentual: number | null;
}

/** Soma de valores em reais sem o ruído de ponto flutuante (0,1 + 0,2 → 0,3). */
export function emReais(valor: number): number {
  const arredondado = Math.round(valor * 100) / 100;
  return arredondado === 0 ? 0 : arredondado;
}

export function calcularVariacao(atual: number, anterior: number): Variacao {
  const diferenca = emReais(atual - anterior);
  if (anterior === 0) return { diferenca, percentual: atual === 0 ? 0 : null };
  const percentual = Math.round((diferenca / Math.abs(anterior)) * 1000) / 10;
  return { diferenca, percentual: percentual === 0 ? 0 : percentual };
}

/**
 * "+3 (+25%)", "-2 (-10%)", "+3 (anterior era zero)", "sem variação". Quando a
 * diferença existe mas o percentual arredonda para zero (ex.: +R$ 1 sobre
 * R$ 100 mil), escreve "menos de 0,1%" em vez de um "-0%" com sinal trocado.
 */
export function textoVariacao(variacao: Variacao, formatar: (n: number) => string = formatarInteiro): string {
  if (variacao.diferenca === 0) return "sem variação";
  const sinal = variacao.diferenca > 0 ? "+" : "-";
  const base = `${sinal}${formatar(Math.abs(variacao.diferenca))}`;
  if (variacao.percentual === null) return `${base} (anterior era zero)`;
  if (variacao.percentual === 0) return `${base} (menos de 0,1%)`;
  const sinalPct = variacao.percentual > 0 ? "+" : "-";
  const pct = Math.abs(variacao.percentual).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${base} (${sinalPct}${pct}%)`;
}

/**
 * Quão confiável é a variação entre as duas semanas de um indicador:
 * - "exata": os dois números são exatos;
 * - "teto": o da semana anterior é só um mínimo (≥) e o atual é exato, então
 *   a variação verdadeira é igual ou MENOR que a calculada;
 * - "inexata": os dois são mínimos (semana passada escolhida), e subtrair um
 *   do outro não diz nada confiável.
 * Hoje só "municípios em negociação" tem número mínimo (não há histórico de estágio).
 */
export type QualidadeComparacao = "exata" | "teto" | "inexata";

export function qualidadeDaComparacaoDeNegociacoes(fotoExataNaSemanaEscolhida: boolean): QualidadeComparacao {
  return fotoExataNaSemanaEscolhida ? "teto" : "inexata";
}

/** Texto da variação conforme a qualidade da comparação ("no máximo +2 (+66,7%)", "não comparável"). */
export function textoVariacaoComQualidade(
  variacao: Variacao,
  qualidade: QualidadeComparacao,
  formatar: (n: number) => string = formatarInteiro,
): string {
  if (qualidade === "inexata") return "não comparável";
  const texto = textoVariacao(variacao, formatar);
  if (qualidade === "teto") return variacao.diferenca === 0 ? "no máximo 0" : `no máximo ${texto}`;
  return texto;
}

export function formatarInteiro(n: number): string {
  return n.toLocaleString("pt-BR");
}

// ----------------------------------------------------------------- resumo

export const CHAVES_INDICADOR = [
  "contatos",
  "negociacoesAtivas",
  "avancaram",
  "adesoes",
  "valorAderido",
  "comissaoLiquidada",
  "comissaoRecebida",
] as const;
export type ChaveIndicador = (typeof CHAVES_INDICADOR)[number];

const CHAVES_EM_REAIS: ReadonlySet<ChaveIndicador> = new Set(["valorAderido", "comissaoLiquidada", "comissaoRecebida"]);

export function indicadorEmReais(chave: ChaveIndicador): boolean {
  return CHAVES_EM_REAIS.has(chave);
}

/** Os números de uma semana para um consultor (ou para o total). */
export type Indicadores = Record<ChaveIndicador, number>;

/** Valor de cada indicador por id de consultor; quem não aparece vale zero. */
export type MapaPorConsultor = ReadonlyMap<string, number>;
export type DadosDaSemana = Record<ChaveIndicador, MapaPorConsultor>;

export function dadosVazios(): DadosDaSemana {
  return {
    contatos: new Map(),
    negociacoesAtivas: new Map(),
    avancaram: new Map(),
    adesoes: new Map(),
    valorAderido: new Map(),
    comissaoLiquidada: new Map(),
    comissaoRecebida: new Map(),
  };
}

export interface ConsultorParaResumo {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface LinhaIndicadores {
  /** null na linha de total. */
  consultorId: string | null;
  nome: string;
  ativo: boolean;
  atual: Indicadores;
  anterior: Indicadores;
  variacao: Record<ChaveIndicador, Variacao>;
}

export interface ResumoSemanal {
  semana: Semana;
  anterior: Semana;
  /** Soma dos consultores listados na entrada (nunca de quem não foi pedido). */
  total: LinhaIndicadores;
  /** Consultores ativos, ou com algum número numa das duas semanas; por nome. */
  consultores: LinhaIndicadores[];
  /** Liquidações da semana escolhida cuja negociação não tem percentual de comissão (entram com comissão zero). */
  liquidacoesSemPercentual: number;
}

export interface EntradaResumo {
  semana: Semana;
  anterior: Semana;
  consultores: ConsultorParaResumo[];
  dadosAtual: DadosDaSemana;
  dadosAnterior: DadosDaSemana;
  liquidacoesSemPercentual?: number;
}

function valorNormalizado(chave: ChaveIndicador, valor: number): number {
  return CHAVES_EM_REAIS.has(chave) ? emReais(valor) : valor;
}

function indicadoresDe(dados: DadosDaSemana, consultorId: string): Indicadores {
  const indicadores = {} as Indicadores;
  for (const chave of CHAVES_INDICADOR) indicadores[chave] = valorNormalizado(chave, dados[chave].get(consultorId) ?? 0);
  return indicadores;
}

function somarIndicadores(lista: Indicadores[]): Indicadores {
  const soma = {} as Indicadores;
  for (const chave of CHAVES_INDICADOR) {
    soma[chave] = valorNormalizado(
      chave,
      lista.reduce((acumulado, i) => acumulado + i[chave], 0),
    );
  }
  return soma;
}

function variacoesDe(atual: Indicadores, anterior: Indicadores): Record<ChaveIndicador, Variacao> {
  const variacoes = {} as Record<ChaveIndicador, Variacao>;
  for (const chave of CHAVES_INDICADOR) variacoes[chave] = calcularVariacao(atual[chave], anterior[chave]);
  return variacoes;
}

function temNumero(i: Indicadores): boolean {
  return CHAVES_INDICADOR.some((chave) => i[chave] !== 0);
}

export function montarResumo(entrada: EntradaResumo): ResumoSemanal {
  const todas = entrada.consultores.map((c) => {
    const atual = indicadoresDe(entrada.dadosAtual, c.id);
    const anterior = indicadoresDe(entrada.dadosAnterior, c.id);
    const linha: LinhaIndicadores = {
      consultorId: c.id,
      nome: c.nome,
      ativo: c.ativo,
      atual,
      anterior,
      variacao: variacoesDe(atual, anterior),
    };
    return linha;
  });

  const atualTotal = somarIndicadores(todas.map((l) => l.atual));
  const anteriorTotal = somarIndicadores(todas.map((l) => l.anterior));

  const visiveis = todas
    .filter((l) => l.ativo || temNumero(l.atual) || temNumero(l.anterior))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || (a.consultorId ?? "").localeCompare(b.consultorId ?? ""));

  return {
    semana: entrada.semana,
    anterior: entrada.anterior,
    total: {
      consultorId: null,
      nome: "Total",
      ativo: true,
      atual: atualTotal,
      anterior: anteriorTotal,
      variacao: variacoesDe(atualTotal, anteriorTotal),
    },
    consultores: visiveis,
    liquidacoesSemPercentual: entrada.liquidacoesSemPercentual ?? 0,
  };
}

// ------------------------------------------- contagens que a camada de banco usa

function somarNoMapa(mapa: Map<string, number>, id: string, valor: number): void {
  mapa.set(id, (mapa.get(id) ?? 0) + valor);
}

function dentro(data: Date | null, inicio: Date, fim: Date): boolean {
  return data !== null && data.getTime() >= inicio.getTime() && data.getTime() < fim.getTime();
}

export interface InteracaoParaContar {
  ataId: string | null;
  /** Município do contato a que o registro se refere. */
  entidadeAlvoId: string;
  criadoEm: Date;
}

export interface DonoDaNegociacao {
  ataId: string;
  entidadeAlvoId: string;
  vendedorId: string;
}

/**
 * Registros de contato da semana por consultor. O histórico de contato
 * (InteracaoPontoFocal) não guarda quem registrou: a autoria vem do dono da
 * negociação daquela ata e daquele município (é único por par). Registro sem
 * ata ou sem negociação conhecida não é de ninguém e fica de fora.
 */
export function contarContatos(
  interacoes: InteracaoParaContar[],
  donos: DonoDaNegociacao[],
  semana: Semana,
): Map<string, number> {
  const donoPorPar = new Map(donos.map((d) => [`${d.ataId}|${d.entidadeAlvoId}`, d.vendedorId]));
  const contagem = new Map<string, number>();
  for (const i of interacoes) {
    if (i.ataId === null || !dentro(i.criadoEm, semana.inicio, semana.fim)) continue;
    const dono = donoPorPar.get(`${i.ataId}|${i.entidadeAlvoId}`);
    if (dono !== undefined) somarNoMapa(contagem, dono, 1);
  }
  return contagem;
}

export interface MovimentoParaResumir {
  vendedorId: string;
  estagio: string;
  quantidade: number;
  valorAderido: number | null;
}

/**
 * Negociações com a última alteração dentro da semana. "Avançaram" são as que
 * hoje estão em negociação ou aderidas; "adesões" são as aderidas (e o valor
 * aderido é a soma delas). Sem histórico de estágio, qualquer alteração
 * recente conta.
 */
export function resumirMovimentos(movimentos: MovimentoParaResumir[]): {
  avancaram: Map<string, number>;
  adesoes: Map<string, number>;
  valorAderido: Map<string, number>;
} {
  const avancaram = new Map<string, number>();
  const adesoes = new Map<string, number>();
  const valorAderido = new Map<string, number>();
  for (const m of movimentos) {
    if (m.estagio !== "em_negociacao" && m.estagio !== "aderiu") continue;
    somarNoMapa(avancaram, m.vendedorId, m.quantidade);
    if (m.estagio === "aderiu") {
      somarNoMapa(adesoes, m.vendedorId, m.quantidade);
      somarNoMapa(valorAderido, m.vendedorId, m.valorAderido ?? 0);
    }
  }
  return { avancaram, adesoes, valorAderido };
}

export interface LiquidacaoParaSomar {
  vendedorId: string;
  valorLiquidado: number;
  /** Fração (0.075 = 7,5%) da negociação; null = não informado. */
  percentualComissao: number | null;
  /** Só-data, gravada à meia-noite UTC. */
  dataLiquidacao: Date;
  statusCobranca: string;
  /** Instante em que a cobrança foi marcada como recebida. */
  dataRecebimento: Date | null;
}

/**
 * Comissão da semana por consultor: valor liquidado × percentual da
 * negociação. "Liquidada" usa a data da liquidação (campo só-data, comparado
 * com os dias da semana em UTC); "recebida" usa a data de recebimento (um
 * instante) das cobranças já marcadas como recebidas. As duas datas são
 * independentes: uma liquidação de uma semana pode ser recebida em outra.
 */
export function somarComissoes(
  liquidacoes: LiquidacaoParaSomar[],
  semana: Semana,
): { liquidada: Map<string, number>; recebida: Map<string, number>; semPercentual: number } {
  const liquidada = new Map<string, number>();
  const recebida = new Map<string, number>();
  let semPercentual = 0;
  for (const l of liquidacoes) {
    const naSemanaDaLiquidacao = dentro(l.dataLiquidacao, semana.diaInicio, semana.diaFim);
    const naSemanaDoRecebimento = l.statusCobranca === "recebida" && dentro(l.dataRecebimento, semana.inicio, semana.fim);
    if (!naSemanaDaLiquidacao && !naSemanaDoRecebimento) continue;
    if (l.percentualComissao === null) {
      semPercentual += 1;
      continue;
    }
    const comissao = l.valorLiquidado * l.percentualComissao;
    if (naSemanaDaLiquidacao) somarNoMapa(liquidada, l.vendedorId, comissao);
    if (naSemanaDoRecebimento) somarNoMapa(recebida, l.vendedorId, comissao);
  }
  return { liquidada, recebida, semPercentual };
}
