import { percentualForaDoContrato } from "../../../comissao/leitura";
import {
  faixasValidas,
  formatarPercentual,
  formatarPercentualCampo,
  formatarValorFaixa,
  sugerirPercentual,
  valorTotalDaAta,
  type FaixaComissaoView,
} from "@/lib/comissao-sugerida";

/**
 * O que a tela do contrato de intermediação mostra sobre a comissão sugerida
 * (Projeto RNA, etapa 6, 2026-10-23). Montado no servidor, só com texto e
 * booleanos, para o componente de tela não precisar de regra nenhuma. A
 * sugestão NÃO grava nada: só oferece um valor para o administrador copiar
 * para o campo; a regra de gravação do contrato (src/lib/comissao.ts, de 3% a
 * 15%) continua sendo a única que vale.
 */
export type SugestaoContrato =
  /** Não foi possível consultar as faixas (a tela do contrato segue funcionando). */
  | { tipo: "indisponivel" }
  /** A ata não tem itens: não existe valor total para comparar com as faixas. */
  | { tipo: "sem-itens" }
  /** Nenhuma faixa ativa e utilizável configurada. */
  | { tipo: "sem-faixas"; valorTotalTexto: string }
  /** Há faixas, mas a primeira começa acima do valor total desta ata. */
  | { tipo: "abaixo-da-primeira"; valorTotalTexto: string; primeiraFaixaTexto: string }
  | {
      tipo: "sugestao";
      valorTotalTexto: string;
      /** "5,25%". */
      percentualTexto: string;
      /** "5,25", como o campo do contrato espera. */
      percentualCampo: string;
      /** "R$ 100.000,00", valor inicial da faixa escolhida. */
      faixaTexto: string;
      /** A sugestão não passaria na gravação do contrato (fora de 3% a 15%). */
      foraDoIntervalo: boolean;
    };

export function montarSugestaoContrato(entrada: {
  itens: readonly { quantidadeRegistrada: number; valorUnitario: number }[];
  /** Só as faixas ativas; as inválidas são ignoradas pela regra. */
  faixas: readonly FaixaComissaoView[];
  /** A consulta das faixas falhou. */
  falhou?: boolean;
}): SugestaoContrato {
  if (entrada.falhou) return { tipo: "indisponivel" };
  if (entrada.itens.length === 0) return { tipo: "sem-itens" };

  const valorTotal = valorTotalDaAta(entrada.itens);
  const valorTotalTexto = formatarValorFaixa(valorTotal);
  const validas = faixasValidas(entrada.faixas);
  if (validas.length === 0) return { tipo: "sem-faixas", valorTotalTexto };

  const sugestao = sugerirPercentual(valorTotal, validas);
  if (sugestao.percentual === null || sugestao.faixa === null) {
    return {
      tipo: "abaixo-da-primeira",
      valorTotalTexto,
      primeiraFaixaTexto: formatarValorFaixa(validas[0].valorMinimo),
    };
  }
  return {
    tipo: "sugestao",
    valorTotalTexto,
    percentualTexto: formatarPercentual(sugestao.percentual),
    percentualCampo: formatarPercentualCampo(sugestao.percentual),
    faixaTexto: formatarValorFaixa(sugestao.faixa.valorMinimo),
    // A mesma conta da tela de faixas (um só lugar decide o que o contrato aceita).
    foraDoIntervalo: percentualForaDoContrato(sugestao.percentual),
  };
}
