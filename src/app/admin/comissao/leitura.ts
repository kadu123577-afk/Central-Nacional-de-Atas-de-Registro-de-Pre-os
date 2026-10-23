import { COMISSAO_MAXIMA_PERCENTUAL, COMISSAO_MINIMA_PERCENTUAL } from "@/lib/comissao";

/**
 * Leitura e normalização do que o administrador digita na tela de faixas de
 * comissão (2026-10-23, Projeto RNA etapa 6). Funções puras, sem banco e sem
 * relógio. Ficam fora de actions.ts porque um arquivo "use server" só pode
 * exportar funções assíncronas. A regra de negócio das faixas (limites do
 * percentual, casas decimais, escolha da faixa) é de src/lib/comissao-sugerida.ts;
 * aqui só se converte texto em número.
 */

/** Tamanho máximo da descrição de uma faixa (cabe numa célula de tabela). */
export const LIMITE_DESCRICAO_FAIXA = 160;

/** O id vem de campo oculto, ou seja, do navegador: só passa o que tem forma de cuid. */
export function idComFormaDeCuid(id: string): boolean {
  return /^c[a-z0-9]{15,40}$/.test(id);
}

/**
 * Descrição em uma linha só: troca quebras e espaços repetidos por um espaço,
 * tira caracteres de controle e apara as pontas.
 */
export function normalizarDescricao(bruto: string): string {
  return bruto.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * Lê o valor digitado em reais e devolve texto com ponto decimal e duas casas
 * ("100000.00"), pronto para gravar em Decimal(16,2) sem passar por número de
 * ponto flutuante. Aceita "100000", "100.000", "100.000,50", "100000,5",
 * "100000.50" e "R$ 100.000,00". Com vírgula, a vírgula é o decimal e o ponto
 * é milhar. Sem vírgula, "1.500" é milhar (1500) e "1.5" ou "1.50" é decimal.
 * Devolve nulo para texto vazio, ilegível, negativo ou com mais de duas casas
 * decimais, em vez de arredondar em silêncio. Os limites de negócio (máximo da
 * coluna) ficam com validarFaixa.
 */
export function interpretarValorDigitado(bruto: string): string | null {
  const texto = bruto.trim().replace(/^R\$\s*/i, "").replace(/\s+/g, "");
  if (texto === "" || texto.length > 24) return null;

  let inteiro: string;
  let centavos = "";
  const milhar = /^\d{1,3}(\.\d{3})+$/;

  if (texto.includes(",")) {
    const partes = texto.split(",");
    if (partes.length !== 2 || !/^\d{1,2}$/.test(partes[1])) return null;
    if (/^\d+$/.test(partes[0])) inteiro = partes[0];
    else if (milhar.test(partes[0])) inteiro = partes[0].replace(/\./g, "");
    else return null;
    centavos = partes[1];
  } else if (texto.includes(".")) {
    if (milhar.test(texto)) {
      inteiro = texto.replace(/\./g, "");
    } else {
      const decimal = /^(\d+)\.(\d{1,2})$/.exec(texto);
      if (!decimal) return null;
      inteiro = decimal[1];
      centavos = decimal[2];
    }
  } else if (/^\d+$/.test(texto)) {
    inteiro = texto;
  } else {
    return null;
  }

  inteiro = inteiro.replace(/^0+(?=\d)/, "");
  return `${inteiro}.${centavos.padEnd(2, "0")}`;
}

/** Fração → texto para gravar em Decimal(5,4): 0.0525 → "0.0525". */
export function fracaoParaDecimal(fracao: number): string {
  return fracao.toFixed(4);
}

/**
 * true quando o percentual (fração) fica fora do intervalo que o contrato de
 * intermediação aceita (src/lib/comissao.ts: de 3% a 15%). Uma faixa assim
 * ainda pode ser cadastrada, mas a sugestão dela não passaria na gravação do
 * contrato; a tela avisa o administrador.
 */
export function percentualForaDoContrato(fracao: number): boolean {
  if (!Number.isFinite(fracao)) return true;
  const pontos = Math.round(fracao * 10_000) / 100;
  return pontos < COMISSAO_MINIMA_PERCENTUAL || pontos > COMISSAO_MAXIMA_PERCENTUAL;
}
