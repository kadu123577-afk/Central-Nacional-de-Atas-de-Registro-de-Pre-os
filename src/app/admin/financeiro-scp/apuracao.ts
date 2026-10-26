import type { NumeroDaFaixa } from "@/components/ui/faixa-numeros";
import { contagem } from "@/lib/acompanhamento-view";
import {
  apurarPorFaixas,
  faixasDoPeriodo,
  formatarReais,
  situacaoDoResultado,
  validarParticipacoesDoPeriodo,
  type ApuracaoPorFaixas,
  type ParticipacaoVigencia,
} from "@/lib/financeiro-scp";
import type { FinanceiroDoPeriodo } from "@/lib/financeiro-scp-db";
import { percentualDeFracao } from "@/lib/formato";
import { diaTexto } from "./leitura";

/**
 * Do que o banco devolveu para a partilha que a tela mostra (2026-10-26,
 * Projeto RNA etapa 7). Função pura, sem banco: a tela principal e o
 * demonstrativo impresso chamam a mesma, para os dois mostrarem os mesmos números.
 *
 * Usa apurarPorFaixas (src/lib/financeiro-scp.ts): se a participação de algum
 * sócio muda no meio do mês, cada trecho é partilhado pelos percentuais
 * vigentes nele (com um só conjunto de percentuais, dá o mesmo resultado de
 * apurarPeriodo). Nenhuma partilha sai sem as participações fecharem 100% em
 * todos os dias do período e sem a receita estar completa.
 */

export interface LinhaPartilha {
  socioId: string;
  nome: string;
  /** "60%" ou, se mudou no período, "60% (01/10/2026 a 14/10/2026) · 50% (15/10/2026 a 31/10/2026)". */
  participacao: string;
  /** A parte do sócio no resultado, em centavos (negativa se houve prejuízo). */
  centavos: number;
}

export type PartilhaDoPeriodo =
  /** Nenhum sócio ou nenhuma participação cadastrada. */
  | { situacao: "sem_cadastro" }
  /** Há cadastro, mas a partilha não pode ser calculada; `erro` explica o motivo. */
  | { situacao: "bloqueada"; erro: string }
  | {
      situacao: "ok";
      apuracao: ApuracaoPorFaixas;
      linhas: LinhaPartilha[];
      /** As participações mudaram durante o período (há mais de um trecho). */
      variaNoPeriodo: boolean;
    };

const DIA_MS = 86_400_000;

function chaveDoPercentual(fracao: number): number {
  return Math.round(fracao * 10_000);
}

/** Texto da participação de um sócio ao longo dos trechos do período. */
function textoDaParticipacao(
  socioId: string,
  trechos: readonly { inicio: Date; fim: Date; participacoes: readonly ParticipacaoVigencia[] }[],
): string {
  const segmentos: { percentual: number; inicio: Date; fim: Date }[] = [];
  for (const trecho of trechos) {
    const p = trecho.participacoes.find((x) => x.socioId === socioId);
    if (!p) continue;
    const ultimo = segmentos[segmentos.length - 1];
    // Trechos vizinhos com o mesmo percentual viram um só (o corte foi por causa de outro sócio).
    if (
      ultimo &&
      chaveDoPercentual(ultimo.percentual) === chaveDoPercentual(p.percentual) &&
      ultimo.fim.getTime() + DIA_MS === trecho.inicio.getTime()
    ) {
      ultimo.fim = trecho.fim;
    } else {
      segmentos.push({ percentual: p.percentual, inicio: trecho.inicio, fim: trecho.fim });
    }
  }

  const noPeriodoInteiro =
    segmentos.length === 1 && segmentos[0].inicio.getTime() === trechos[0].inicio.getTime() && segmentos[0].fim.getTime() === trechos[trechos.length - 1].fim.getTime();
  if (noPeriodoInteiro) return percentualDeFracao(segmentos[0].percentual);
  return segmentos
    .map((s) => `${percentualDeFracao(s.percentual)} (${diaTexto(s.inicio)} a ${diaTexto(s.fim)})`)
    .join(" · ");
}

export function calcularPartilha(financeiro: FinanceiroDoPeriodo): PartilhaDoPeriodo {
  const { periodo, socios, receita, despesas } = financeiro;
  const participacoes: ParticipacaoVigencia[] = socios.flatMap((s) =>
    s.participacoes.map((p) => ({
      socioId: p.socioId,
      percentual: p.percentual,
      vigenteDesde: p.vigenteDesde,
      vigenteAte: p.vigenteAte,
    })),
  );
  if (socios.length === 0 || participacoes.length === 0) return { situacao: "sem_cadastro" };

  if (receita.truncada || receita.invalidas > 0) {
    const motivo = receita.truncada
      ? "há comissões recebidas demais no período para somar com segurança"
      : `${receita.invalidas} ${receita.invalidas === 1 ? "comissão recebida tem" : "comissões recebidas têm"} valor ou percentual inválido`;
    return {
      situacao: "bloqueada",
      erro: `A receita do período está incompleta (${motivo}). A partilha só é calculada com a receita completa.`,
    };
  }

  const validacao = validarParticipacoesDoPeriodo(periodo, participacoes);
  if (!validacao.ok) return { situacao: "bloqueada", erro: validacao.erro };

  let apuracao: ApuracaoPorFaixas;
  try {
    apuracao = apurarPorFaixas({
      periodo,
      receitas: receita.lancamentos,
      despesas: despesas.porDia,
      participacoes,
    });
  } catch (erro) {
    if (!(erro instanceof RangeError)) throw erro;
    return { situacao: "bloqueada", erro: erro.message };
  }

  const trechos = faixasDoPeriodo(periodo, participacoes);
  const ordem = new Map(socios.map((s, i) => [s.id, i]));
  const nomes = new Map(socios.map((s) => [s.id, s.nome]));
  const linhas: LinhaPartilha[] = apuracao.partilha
    .map((parte) => ({
      socioId: parte.socioId,
      nome: nomes.get(parte.socioId) ?? "Sócio removido",
      participacao: textoDaParticipacao(parte.socioId, trechos),
      centavos: parte.centavos,
    }))
    .sort((a, b) => (ordem.get(a.socioId) ?? 0) - (ordem.get(b.socioId) ?? 0));

  return { situacao: "ok", apuracao, linhas, variaNoPeriodo: apuracao.faixas.length > 1 };
}

/**
 * Os três números do topo (receita recebida, despesas e resultado), prontos para
 * a FaixaNumeros. O resultado sai verde se positivo e em atenção se prejuízo.
 * A conta é feita em centavos inteiros (nunca soma de reais em ponto flutuante).
 */
export function numerosDoPeriodo(financeiro: FinanceiroDoPeriodo): NumeroDaFaixa[] {
  const { receita, despesas } = financeiro;
  const resultado = receita.centavos - despesas.centavos;
  const situacao = situacaoDoResultado(resultado);

  return [
    {
      valor: formatarReais(receita.centavos),
      rotulo: "Receita recebida",
      nota: `${contagem(receita.quantidade, "comissão recebida", "comissões recebidas")} no período`,
    },
    {
      valor: formatarReais(despesas.centavos),
      rotulo: "Despesas",
      nota: contagem(despesas.quantidade, "lançamento", "lançamentos"),
    },
    {
      valor: formatarReais(resultado),
      rotulo: "Resultado",
      nota: situacao === "prejuizo" ? "Prejuízo no período" : situacao === "lucro" ? "Receita menos despesas" : "Sem sobra no período",
      tom: situacao === "lucro" ? "marca" : situacao === "prejuizo" ? "atencao" : undefined,
    },
  ];
}
