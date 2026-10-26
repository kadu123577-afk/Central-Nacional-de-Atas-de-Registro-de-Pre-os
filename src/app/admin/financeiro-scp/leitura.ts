import {
  hojeEmSaoPaulo,
  interpretarReais,
  periodoMensal,
  periodoMensalDeTexto,
  type PeriodoDias,
} from "@/lib/financeiro-scp";
import { lerDiaAAAAMMDD } from "@/lib/recebiveis";

/**
 * Leitura e normalização do que o administrador digita (e do ?mes= da URL) no
 * financeiro da SCP (2026-10-26, Projeto RNA etapa 7). Funções puras, sem banco
 * e sem relógio (o "agora" vem de fora). Ficam fora de actions.ts porque um
 * arquivo "use server" só pode exportar funções assíncronas. As regras de
 * negócio (dinheiro em centavos, percentuais, períodos) são de
 * src/lib/financeiro-scp.ts; aqui só se converte texto em valores.
 */

/**
 * Eventos da trilha de auditoria do financeiro (os de acesso, "financeiro.acesso_negado"
 * e "financeiro.visualizou", são de src/lib/acesso-financeiro.ts). O detalhe leva datas,
 * valores e percentuais, mas nunca o texto livre (descrição, nome): quem precisa dele
 * abre o registro pelo alvo.
 */
export const AUDITORIA = {
  socioCriado: "financeiro.socio_criado",
  socioAtivado: "financeiro.socio_ativado",
  socioDesativado: "financeiro.socio_desativado",
  socioRemovido: "financeiro.socio_removido",
  participacaoAlterada: "financeiro.participacao_alterada",
  despesaCriada: "financeiro.despesa_criada",
  despesaAlterada: "financeiro.despesa_alterada",
  despesaRemovida: "financeiro.despesa_removida",
} as const;

export const LIMITE_NOME_SOCIO = 120;
export const LIMITE_DESCRICAO_DESPESA = 200;
export const LIMITE_CATEGORIA_DESPESA = 60;

/** Despesa de R$ 100 bilhões ou mais é erro de digitação (o banco aceitaria até ~R$ 1 trilhão). */
export const LIMITE_VALOR_DESPESA_CENTAVOS = 100_000_000_000 * 100;

/** O id vem de campo oculto, ou seja, do navegador: só passa o que tem forma de cuid. */
export function idComFormaDeCuid(id: string): boolean {
  return /^c[a-z0-9]{15,40}$/.test(id);
}

/** Texto bruto de um campo, sem apará-lo. Arquivo anexado a campo de texto não é texto. */
export function campoBruto(formData: FormData, nome: string): string {
  const valor = formData.get(nome);
  return typeof valor === "string" ? valor : "";
}

/**
 * Texto em uma linha só: troca quebras e espaços repetidos por um espaço, tira
 * caracteres de controle e apara as pontas.
 */
export function normalizarTexto(bruto: string): string {
  return bruto.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
}

// ───────────────────────────── datas na tela ─────────────────────────────

/** Dia só-data (UTC) → "dd/mm/aaaa". */
export function diaTexto(dia: Date): string {
  const iso = dia.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Dia só-data (UTC) → "AAAA-MM-DD", o formato do campo de data. */
export function diaCampo(dia: Date): string {
  return dia.toISOString().slice(0, 10);
}

/** Centavos → "1234,56", sem separador de milhar, para repor num campo de valor. */
export function centavosParaCampo(centavos: number): string {
  const abs = Math.abs(centavos);
  return `${centavos < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** Fração → "60" ou "33,33", para repor num campo de percentual (em %). */
export function fracaoParaCampo(fracao: number): string {
  return String(Number((fracao * 100).toFixed(2))).replace(".", ",");
}

// ───────────────────────────── mês da tela ─────────────────────────────

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** O mês escolhido: o período, o texto "AAAA-MM" e, quando a URL trouxe lixo, a explicação. */
export interface MesEscolhido {
  periodo: PeriodoDias;
  /** "AAAA-MM", o valor do campo e do ?mes=. */
  texto: string;
  erro?: string;
}

/** "AAAA-MM" de um período mensal. */
export function textoDoMes(periodo: PeriodoDias): string {
  return periodo.inicio.toISOString().slice(0, 7);
}

/** "outubro de 2026". */
export function rotuloDoMes(periodo: PeriodoDias): string {
  return `${MESES[periodo.inicio.getUTCMonth()]} de ${periodo.inicio.getUTCFullYear()}`;
}

/** O mês `delta` meses depois (negativo = antes); nulo fora de 2000 a 2100. */
export function mesVizinho(periodo: PeriodoDias, delta: number): PeriodoDias | null {
  const indice = periodo.inicio.getUTCFullYear() * 12 + periodo.inicio.getUTCMonth() + delta;
  return periodoMensal(Math.floor(indice / 12), (indice % 12) + 1);
}

/**
 * Lê o ?mes=AAAA-MM da URL. Ausente = mês atual (de Brasília). Ilegível ou
 * impossível (13, 1999...) cai no mês atual, com um aviso, em vez de dar erro.
 * Se vier repetido (?mes=a&mes=b), vale o primeiro.
 */
export function escolherMes(bruto: string | string[] | undefined, agora: Date): MesEscolhido {
  const hoje = hojeEmSaoPaulo(agora);
  // Hoje sempre cai entre 2000 e 2100 para o relógio de verdade; o `!` só evita um desvio impossível.
  const atual = periodoMensal(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1)!;

  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  if (valor === undefined || valor.trim() === "") return { periodo: atual, texto: textoDoMes(atual) };

  const periodo = periodoMensalDeTexto(valor);
  if (!periodo) {
    return { periodo: atual, texto: textoDoMes(atual), erro: "Mês inválido no endereço da página. Mostrando o mês atual." };
  }
  return { periodo, texto: textoDoMes(periodo) };
}

// ───────────────────────────── despesa digitada ─────────────────────────────

export interface DespesaLida {
  data: Date;
  descricao: string;
  categoria: string | null;
  centavos: number;
  pagaPorSocioId: string | null;
}

export type ResultadoDespesa = { ok: true; despesa: DespesaLida } | { ok: false; erro: string };

/**
 * Valida a despesa digitada, só pelo texto (sem banco): data real (de 2000 a
 * 2100), descrição de 1 a 200 caracteres, categoria opcional de até 60, valor
 * em reais maior que zero e menor que R$ 100 bilhões (centavos exatos, sem
 * ponto flutuante) e quem pagou, opcional, com forma de id. Quem chama confere
 * depois se o sócio existe.
 */
export function lerDespesa(campos: {
  data: string;
  descricao: string;
  categoria: string;
  valor: string;
  pagaPorSocioId: string;
}): ResultadoDespesa {
  const data = lerDiaAAAAMMDD(campos.data);
  if (!data || data.getUTCFullYear() > 2100) {
    return { ok: false, erro: "Informe uma data válida para a despesa." };
  }

  const descricao = normalizarTexto(campos.descricao);
  if (descricao === "") return { ok: false, erro: "Descreva a despesa em poucas palavras." };
  if (descricao.length > LIMITE_DESCRICAO_DESPESA) {
    return {
      ok: false,
      erro: `A descrição tem ${descricao.length} caracteres; o limite é ${LIMITE_DESCRICAO_DESPESA}. Resuma o texto.`,
    };
  }

  const categoria = normalizarTexto(campos.categoria);
  if (categoria.length > LIMITE_CATEGORIA_DESPESA) {
    return {
      ok: false,
      erro: `A categoria tem ${categoria.length} caracteres; o limite é ${LIMITE_CATEGORIA_DESPESA}.`,
    };
  }

  const valor = interpretarReais(campos.valor);
  if (!valor.ok) return { ok: false, erro: valor.erro };
  if (valor.centavos <= 0) return { ok: false, erro: "O valor da despesa precisa ser maior que zero." };
  if (valor.centavos >= LIMITE_VALOR_DESPESA_CENTAVOS) {
    return { ok: false, erro: "Valor grande demais para uma despesa. Confira os zeros." };
  }

  const pagaPor = campos.pagaPorSocioId.trim();
  if (pagaPor !== "" && !idComFormaDeCuid(pagaPor)) {
    return { ok: false, erro: "Sócio inválido. Atualize a página e tente de novo." };
  }

  return {
    ok: true,
    despesa: {
      data,
      descricao,
      categoria: categoria === "" ? null : categoria,
      centavos: valor.centavos,
      pagaPorSocioId: pagaPor === "" ? null : pagaPor,
    },
  };
}
