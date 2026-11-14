import { prisma } from "@/lib/prisma";
import { posicaoDaAdesaoRegistrada } from "@/lib/ciclo-adesao";
import {
  margemDoItem,
  situacaoParaOConsultor,
  sinaisDePosVenda,
  type EtapaPosicao,
  type SinalPosVenda,
} from "@/lib/pos-venda";

/**
 * Pós-venda do consultor (atividade 17, 14/11/2026): as adesões já registradas pela equipe nos
 * municípios do próprio consultor, com onde cada uma está no ciclo e o que pede ação (vigência da ata
 * e do contrato, contato atrasado, aditivo, novo pedido). Só do consultor logado: a consulta já filtra
 * pelo id da sessão, nunca por um id vindo da tela.
 */
export interface LinhaPosVenda {
  oportunidadeId: string;
  ataId: string;
  ataNumero: string;
  ataObjeto: string;
  fornecedor: string;
  municipio: string;
  uf: string | null;
  valorAderido: number | null;
  etapa: EtapaPosicao;
  situacao: string;
  sinais: SinalPosVenda[];
  /** Algum sinal pede ação agora. */
  urgente: boolean;
}

export async function carregarPosVenda(vendedorId: string, agora: Date = new Date()): Promise<LinhaPosVenda[]> {
  const oportunidades = await prisma.oportunidadeVenda.findMany({
    where: { vendedorId, estagio: "aderiu", expiradaEm: null },
    orderBy: { atualizadoEm: "desc" },
    select: {
      id: true,
      ataId: true,
      atualizadoEm: true,
      proximoContatoEm: true,
      valorAderido: true,
      ata: {
        select: {
          numero: true,
          objeto: true,
          dataVigenciaFim: true,
          fornecedor: { select: { razaoSocial: true } },
          itens: { select: { id: true, quantidadeRegistrada: true, saldo: { select: { quantidadeConsumida: true } } } },
        },
      },
      entidadeAlvo: { select: { nome: true, municipio: true, uf: true } },
      itensAderidos: { select: { itemId: true, quantidade: true, criadoEm: true } },
      liquidacoes: { select: { dataLiquidacao: true, statusCobranca: true } },
      vinculosContrato: {
        where: { status: "confirmado" },
        take: 1,
        select: {
          decididoEm: true,
          criadoEm: true,
          contrato: { select: { vigenciaFim: true, termos: { select: { tipo: true, novaVigenciaFim: true } } } },
        },
      },
    },
  });

  const linhas = oportunidades.map((o): LinhaPosVenda => {
    const vinculo = o.vinculosContrato[0];
    const registradaEm = o.itensAderidos.reduce<Date | null>(
      (menor, i) => (menor === null || i.criadoEm < menor ? i.criadoEm : menor),
      null,
    );
    const posicao = posicaoDaAdesaoRegistrada({
      registradaEm: registradaEm ?? o.atualizadoEm,
      contratoConfirmadoEm: vinculo ? (vinculo.decididoEm ?? vinculo.criadoEm) : null,
      liquidacoes: o.liquidacoes,
    });

    // Vigência do contrato do município: a maior, contando as prorrogações que o PNCP mostrou.
    const contrato = vinculo?.contrato ?? null;
    const fins = [contrato?.vigenciaFim ?? null, ...(contrato?.termos.map((t) => t.novaVigenciaFim) ?? [])].filter(
      (d): d is Date => d !== null,
    );
    const contratoVigenciaFim = fins.length > 0 ? new Date(Math.max(...fins.map((d) => d.getTime()))) : null;
    const aditivos = contrato?.termos.filter((t) => t.tipo.startsWith("aditivo")).length ?? 0;

    // O que ainda cabe: por item, o menor entre o que falta dos 50% do município e o que sobra do dobro da ata.
    const jaDoMunicipio = new Map(o.itensAderidos.map((i) => [i.itemId, i.quantidade]));
    const itensComMargem = o.ata.itens.filter(
      (item) => margemDoItem(item.quantidadeRegistrada, item.saldo?.quantidadeConsumida ?? 0, jaDoMunicipio.get(item.id) ?? 0) > 0,
    ).length;

    const sinais = sinaisDePosVenda({
      agora,
      etapa: posicao.etapa,
      ataVigenciaFim: o.ata.dataVigenciaFim,
      contratoVigenciaFim,
      aditivos,
      itensComMargem,
      proximoContatoEm: o.proximoContatoEm,
    });

    return {
      oportunidadeId: o.id,
      ataId: o.ataId,
      ataNumero: o.ata.numero,
      ataObjeto: o.ata.objeto,
      fornecedor: o.ata.fornecedor.razaoSocial,
      municipio: o.entidadeAlvo.municipio ?? o.entidadeAlvo.nome,
      uf: o.entidadeAlvo.uf,
      valorAderido: o.valorAderido ? Number(o.valorAderido) : null,
      etapa: posicao.etapa,
      situacao: situacaoParaOConsultor(posicao.etapa),
      sinais,
      urgente: sinais.some((s) => s.urgente),
    };
  });

  // Quem pede ação primeiro; dentro de cada grupo, por município.
  return linhas.sort((a, b) => Number(b.urgente) - Number(a.urgente) || a.municipio.localeCompare(b.municipio, "pt-BR"));
}
