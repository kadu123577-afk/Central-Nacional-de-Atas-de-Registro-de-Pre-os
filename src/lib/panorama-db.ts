import { prisma } from "@/lib/prisma";
import { CONSUMO_ANUAL_ATIPICO, pontuarPar, type AtaParaMatch, type ConsumoParaMatch, type NivelDoPar } from "@/lib/panorama";
import { reservaDaAta } from "@/lib/reserva-ata";

/**
 * Panorama de vendas: o match entre cada município e as atas do catálogo (liberadas, com contrato e
 * vigentes), com a nota e os motivos de cada par. As regras da nota estão em src/lib/panorama.ts;
 * aqui só se lê o banco e se monta a lista.
 */
export type SituacaoDoPar = "livre" | "em_negociacao" | "aderiu";

export interface LinhaDoPanorama {
  municipioId: string;
  municipio: string;
  uf: string | null;
  ataId: string;
  ataNumero: string;
  ataObjeto: string;
  categoria: string;
  pontos: number;
  nivel: NivelDoPar;
  motivos: string[];
  avisos: string[];
  consumoAnual: number;
  consumoAnualEstimado: boolean;
  diasParaVencer: number | null;
  situacao: SituacaoDoPar;
  /** Outro consultor negocia nesta ata e a mantém reservada até esta data. */
  ataReservadaAte: Date | null;
}

export interface Panorama {
  linhas: LinhaDoPanorama[];
  /** Pares que passam pelo filtro (a lista pode estar cortada no limite). */
  totalPares: number;
  totalMunicipios: number;
  totalAtas: number;
  porNivel: Record<NivelDoPar, number>;
  /** Municípios da base que ainda não têm nenhum consumo salvo: o robô ainda não chegou neles. */
  municipiosSemConsumo: number;
}

export interface FiltrosDoPanorama {
  uf?: string;
  categoria?: string;
  ataId?: string;
  /** Inclui os pares que já estão em negociação ou já aderiram. */
  incluirEmAndamento?: boolean;
  limite?: number;
}

const LIMITE_PADRAO = 200;

export async function carregarPanorama(filtros: FiltrosDoPanorama = {}, hoje: Date = new Date()): Promise<Panorama> {
  const atasBrutas = await prisma.ata.findMany({
    where: {
      status: "APROVADA",
      contrato: { isNot: null },
      dataVigenciaFim: { gte: hoje },
      categoria: filtros.categoria ? filtros.categoria : { not: null },
      ...(filtros.ataId ? { id: filtros.ataId } : {}),
    },
    select: { id: true, numero: true, objeto: true, categoria: true, orgaoGerenciador: { select: { esfera: true } } },
    orderBy: { numero: "asc" },
  });
  const atas: (AtaParaMatch & { categoria: string })[] = atasBrutas.flatMap((a) =>
    a.categoria ? [{ id: a.id, numero: a.numero, objeto: a.objeto, categoria: a.categoria, esferaGerenciador: a.orgaoGerenciador.esfera }] : [],
  );

  const vazio: Panorama = {
    linhas: [],
    totalPares: 0,
    totalMunicipios: 0,
    totalAtas: atas.length,
    porNivel: { muito_provavel: 0, provavel: 0, possivel: 0 },
    municipiosSemConsumo: 0,
  };

  const [semConsumo] = await Promise.all([
    prisma.entidadeAlvo.count({
      where: { tipo: "municipal", ativo: true, ...(filtros.uf ? { uf: filtros.uf } : {}), historicoConsumo: { none: {} } },
    }),
  ]);
  vazio.municipiosSemConsumo = semConsumo;
  if (atas.length === 0) return vazio;

  const categorias = [...new Set(atas.map((a) => a.categoria))];
  const [consumos, oportunidades] = await Promise.all([
    prisma.historicoConsumoCategoria.findMany({
      where: {
        categoria: { in: categorias },
        entidadeAlvo: { tipo: "municipal", ativo: true, ...(filtros.uf ? { uf: filtros.uf } : {}) },
      },
      select: {
        categoria: true,
        valorUltimaContratacao: true,
        quantidadeContratosNaJanela: true,
        ultimaContratacao: true,
        valorTotalNaJanela: true,
        janelaMeses: true,
        vigenciaFimMaisRecente: true,
        contratosPorAdesao: true,
        fornecedoresDistintos: true,
        entidadeAlvo: { select: { id: true, nome: true, municipio: true, uf: true } },
      },
    }),
    prisma.oportunidadeVenda.findMany({
      where: { ataId: { in: atas.map((a) => a.id) }, expiradaEm: null },
      select: { ataId: true, entidadeAlvoId: true, estagio: true, vendedorId: true, prazoEm: true, expiradaEm: true },
    }),
  ]);

  const oportunidadePorPar = new Map(oportunidades.map((o) => [`${o.ataId}|${o.entidadeAlvoId}`, o]));
  const reservaPorAta = new Map(
    atas.map((a) => [a.id, reservaDaAta(oportunidades.filter((o) => o.ataId === a.id), "", hoje)?.ate ?? null] as const),
  );
  const atasPorCategoria = new Map<string, typeof atas>();
  for (const a of atas) atasPorCategoria.set(a.categoria, [...(atasPorCategoria.get(a.categoria) ?? []), a]);

  const linhas: LinhaDoPanorama[] = [];
  for (const c of consumos) {
    const consumo: ConsumoParaMatch = {
      categoria: c.categoria,
      valorUltimaContratacao: Number(c.valorUltimaContratacao),
      quantidadeContratos: c.quantidadeContratosNaJanela,
      ultimaContratacao: c.ultimaContratacao,
      valorTotalNaJanela: c.valorTotalNaJanela === null ? null : Number(c.valorTotalNaJanela),
      janelaMeses: c.janelaMeses,
      vigenciaFimMaisRecente: c.vigenciaFimMaisRecente,
      contratosPorAdesao: c.contratosPorAdesao,
      fornecedoresDistintos: c.fornecedoresDistintos,
    };
    for (const ata of atasPorCategoria.get(c.categoria) ?? []) {
      const par = pontuarPar(consumo, ata, hoje);
      if (!par) continue;
      const op = oportunidadePorPar.get(`${ata.id}|${c.entidadeAlvo.id}`);
      const situacao: SituacaoDoPar = !op ? "livre" : op.estagio === "aderiu" ? "aderiu" : "em_negociacao";
      if (situacao !== "livre" && !filtros.incluirEmAndamento) continue;
      linhas.push({
        municipioId: c.entidadeAlvo.id,
        municipio: c.entidadeAlvo.municipio ?? c.entidadeAlvo.nome,
        uf: c.entidadeAlvo.uf,
        ataId: ata.id,
        ataNumero: ata.numero,
        ataObjeto: ata.objeto,
        categoria: c.categoria,
        pontos: par.pontos,
        nivel: par.nivel,
        motivos: par.motivos,
        avisos: par.avisos,
        consumoAnual: par.consumoAnual,
        consumoAnualEstimado: par.consumoAnualEstimado,
        diasParaVencer: par.diasParaVencer,
        situacao,
        ataReservadaAte: situacao === "livre" ? (reservaPorAta.get(ata.id) ?? null) : null,
      });
    }
  }

  // Mesma nota: primeiro quem tem o contrato vencendo mais perto (a hora de oferecer é agora), depois o
  // consumo maior (limitado, para uma obra gigante não passar na frente de tudo).
  const ordemDeVencimento = (l: LinhaDoPanorama) => (l.diasParaVencer !== null && l.diasParaVencer >= 0 ? l.diasParaVencer : Number.MAX_SAFE_INTEGER);
  linhas.sort(
    (a, b) =>
      b.pontos - a.pontos ||
      ordemDeVencimento(a) - ordemDeVencimento(b) ||
      Math.min(b.consumoAnual, CONSUMO_ANUAL_ATIPICO) - Math.min(a.consumoAnual, CONSUMO_ANUAL_ATIPICO) ||
      a.municipio.localeCompare(b.municipio, "pt-BR"),
  );
  const porNivel: Record<NivelDoPar, number> = { muito_provavel: 0, provavel: 0, possivel: 0 };
  for (const l of linhas) porNivel[l.nivel] += 1;

  return {
    linhas: linhas.slice(0, filtros.limite ?? LIMITE_PADRAO),
    totalPares: linhas.length,
    totalMunicipios: new Set(linhas.map((l) => l.municipioId)).size,
    totalAtas: atas.length,
    porNivel,
    municipiosSemConsumo: semConsumo,
  };
}
