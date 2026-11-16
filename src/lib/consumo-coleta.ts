import { classificarObjeto } from "@/lib/classificador-objeto";

/**
 * Consumo detalhado de cada município (16/11/2026): é o que o robô do raio-X entrega e o panorama de
 * vendas usa. Parte dos contratos que a coleta em lote já baixou do PNCP (dados-coletados/pncp e
 * pncp-orgaos, todos os órgãos do município: prefeitura, fundos de saúde e educação, câmara,
 * autarquias) e resume, por categoria, quanto o município gastou, quantas vezes, com quantos
 * fornecedores, quando o consumo precisa ser renovado e se já compra por adesão a ata.
 * Regras puras; a leitura dos arquivos e a gravação ficam em prisma/consolidar-consumo-coleta.ts.
 */

export interface ContratoColetado {
  /** Número de controle do PNCP: serve para não contar duas vezes o mesmo contrato. */
  id: string;
  objeto: string;
  valorGlobal: number;
  dataAssinatura: Date;
  vigenciaFim: Date | null;
  fornecedor: string | null;
  orgao: string | null;
  /** O contrato nasceu de uma adesão a ata de registro de preços (carona). */
  frutoAdesao: boolean;
}

function dia(valor: unknown): Date | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(valor)) return null;
  const d = new Date(`${valor.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function numeroPositivo(valor: unknown): number | null {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Lê um contrato no formato da API do PNCP. Devolve null para o que não é despesa do município ou não
 * dá para usar: contrato de receita (o órgão recebe, não compra), sem objeto, sem valor ou sem data de
 * assinatura.
 */
export function lerContratoColetado(dado: unknown): ContratoColetado | null {
  if (typeof dado !== "object" || dado === null) return null;
  const c = dado as Record<string, unknown>;
  if (c.receita === true) return null;

  const objeto = typeof c.objetoContrato === "string" ? c.objetoContrato.trim() : "";
  const valorGlobal = numeroPositivo(c.valorGlobal) ?? numeroPositivo(c.valorInicial);
  const dataAssinatura = dia(c.dataAssinatura);
  const id = typeof c.numeroControlePNCP === "string" ? c.numeroControlePNCP : "";
  if (!objeto || valorGlobal === null || !dataAssinatura || !id) return null;

  const orgao = (c.orgaoEntidade as { cnpj?: unknown } | undefined)?.cnpj;
  const fornecedor = typeof c.niFornecedor === "string" && c.niFornecedor ? c.niFornecedor : null;
  return {
    id,
    objeto,
    valorGlobal,
    dataAssinatura,
    vigenciaFim: dia(c.dataVigenciaFim),
    fornecedor,
    orgao: typeof orgao === "string" ? orgao : null,
    frutoAdesao: c.frutoAdesao === true,
  };
}

export interface ResumoDetalhadoDeConsumo {
  categoria: string;
  valorTotalNaJanela: number;
  janelaMeses: number;
  quantidadeContratos: number;
  primeiraContratacao: Date;
  ultimaContratacao: Date;
  valorUltimaContratacao: number;
  objetoUltimaContratacao: string;
  vigenciaFimMaisRecente: Date | null;
  fornecedoresDistintos: number;
  orgaosDistintos: number;
  contratosPorAdesao: number;
}

/** Janela padrão do consumo: os últimos 36 meses. */
export const JANELA_MESES_PADRAO = 36;

function mesesAtras(hoje: Date, meses: number): Date {
  const d = new Date(hoje.getTime());
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d;
}

/**
 * Resume o consumo por categoria nos últimos `janelaMeses` meses (contando de `hoje`). Cada contrato
 * entra uma vez só (pelo número de controle), mesmo que apareça nas duas fontes da coleta. Objeto que
 * não cai em nenhuma categoria conhecida fica de fora. Ordem: das categorias que mais gastaram.
 */
export function resumirConsumo(
  contratos: readonly ContratoColetado[],
  hoje: Date,
  janelaMeses: number = JANELA_MESES_PADRAO,
): ResumoDetalhadoDeConsumo[] {
  const corte = mesesAtras(hoje, janelaMeses);
  const vistos = new Set<string>();
  const porCategoria = new Map<string, ContratoColetado[]>();

  for (const c of contratos) {
    if (vistos.has(c.id)) continue;
    vistos.add(c.id);
    if (c.dataAssinatura < corte || c.dataAssinatura > hoje) continue;
    const categoria = classificarObjeto(c.objeto);
    if (!categoria) continue;
    const lista = porCategoria.get(categoria) ?? [];
    lista.push(c);
    porCategoria.set(categoria, lista);
  }

  const resumos: ResumoDetalhadoDeConsumo[] = [];
  for (const [categoria, lista] of porCategoria) {
    const porData = [...lista].sort((a, b) => a.dataAssinatura.getTime() - b.dataAssinatura.getTime());
    const ultimo = porData[porData.length - 1];
    const vigencias = lista.map((c) => c.vigenciaFim).filter((d): d is Date => d !== null);
    resumos.push({
      categoria,
      valorTotalNaJanela: Math.round(lista.reduce((soma, c) => soma + c.valorGlobal, 0) * 100) / 100,
      janelaMeses,
      quantidadeContratos: lista.length,
      primeiraContratacao: porData[0].dataAssinatura,
      ultimaContratacao: ultimo.dataAssinatura,
      valorUltimaContratacao: ultimo.valorGlobal,
      objetoUltimaContratacao: ultimo.objeto.slice(0, 500),
      vigenciaFimMaisRecente: vigencias.length > 0 ? new Date(Math.max(...vigencias.map((d) => d.getTime()))) : null,
      fornecedoresDistintos: new Set(lista.map((c) => c.fornecedor).filter(Boolean)).size,
      orgaosDistintos: new Set(lista.map((c) => c.orgao).filter(Boolean)).size,
      contratosPorAdesao: lista.filter((c) => c.frutoAdesao).length,
    });
  }
  return resumos.sort((a, b) => b.valorTotalNaJanela - a.valorTotalNaJanela);
}
