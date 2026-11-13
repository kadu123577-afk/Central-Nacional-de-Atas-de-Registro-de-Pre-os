import { prisma } from "@/lib/prisma";
import type { Feriados } from "@/lib/dias-uteis";
import {
  etapaDaNegociacao,
  posicaoDaAdesaoRegistrada,
  vencimentoDaEtapaDaAdesao,
  type NumeroEtapaAdesao,
} from "@/lib/ciclo-adesao";
import { carregarFeriadosExtras } from "@/lib/feriados-db";
import { carregarFilaDaInstrucao } from "@/lib/fila-instrucao-db";
import { ONDE_PRONTA_PARA_REGISTRAR } from "@/lib/registrar-adesao-db";

/**
 * Quadro do ciclo da adesão, atividades 8 a 17 (2026-11-14): uma linha por município que espera
 * alguma etapa, com desde quando e o vencimento em dias úteis. Cada etapa vem de uma consulta
 * própria (nunca se carrega a base inteira): a lista de municípios "a contatar" é enorme e só
 * entra recortada, com o total real em `totais`.
 */
export interface LinhaDoQuadroDaAdesao {
  /** Chave da linha (id do pedido, na etapa 9; id da oportunidade nas demais). */
  chave: string;
  oportunidadeId: string | null;
  municipio: string;
  uf: string | null;
  ataNumero: string;
  consultor: string;
  etapa: NumeroEtapaAdesao;
  /** Desde quando espera (null = não dá para dizer, ou pós-venda). */
  desde: Date | null;
  /** Vencimento em dia útil (null = sem prazo). */
  vencimento: Date | null;
}

export interface QuadroDaAdesao {
  linhas: LinhaDoQuadroDaAdesao[];
  /** Quantos municípios há em cada etapa (a lista pode estar recortada). */
  totais: Record<number, number>;
  feriados: Feriados;
}

/** Teto de municípios "a contatar" lidos: o resto só conta no total. */
const LIMITE_A_CONTATAR = 100;
const LIMITE_POR_ETAPA = 500;

interface DadosDeMunicipio {
  entidadeAlvo: { nome: string; municipio: string | null; uf: string | null };
  ata: { numero: string };
  vendedor: { nome: string };
}

const nomeDoMunicipio = (m: DadosDeMunicipio) => m.entidadeAlvo.municipio ?? m.entidadeAlvo.nome;

export async function carregarQuadroDaAdesao(): Promise<QuadroDaAdesao> {
  const feriados = await carregarFeriadosExtras();

  const [pedidos, totalAContatar, aContatar, fila, prontas, registradas] = await Promise.all([
    prisma.pedidoNegociacao.findMany({
      where: { status: "pendente" },
      orderBy: { criadoEm: "asc" },
      take: LIMITE_POR_ETAPA,
      select: {
        id: true,
        criadoEm: true,
        ata: { select: { numero: true } },
        vendedor: { select: { nome: true } },
        entidadeAlvo: { select: { nome: true, municipio: true, uf: true } },
      },
    }),
    prisma.oportunidadeVenda.count({ where: { expiradaEm: null, estagio: "a_contatar" } }),
    prisma.oportunidadeVenda.findMany({
      where: { expiradaEm: null, estagio: "a_contatar" },
      orderBy: [{ prazoEm: { sort: "asc", nulls: "last" } }, { criadoEm: "asc" }],
      take: LIMITE_A_CONTATAR,
      select: {
        id: true,
        prazoEm: true,
        ata: { select: { numero: true } },
        vendedor: { select: { nome: true } },
        entidadeAlvo: { select: { nome: true, municipio: true, uf: true } },
      },
    }),
    carregarFilaDaInstrucao(LIMITE_POR_ETAPA),
    prisma.oportunidadeVenda.findMany({
      where: ONDE_PRONTA_PARA_REGISTRAR,
      orderBy: { atualizadoEm: "asc" },
      take: LIMITE_POR_ETAPA,
      select: {
        id: true,
        ata: { select: { numero: true } },
        vendedor: { select: { nome: true } },
        entidadeAlvo: { select: { nome: true, municipio: true, uf: true } },
        instrucao: { select: { declaracaoEm: true } },
      },
    }),
    prisma.oportunidadeVenda.findMany({
      where: { estagio: "aderiu" },
      orderBy: { atualizadoEm: "asc" },
      take: LIMITE_POR_ETAPA,
      select: {
        id: true,
        atualizadoEm: true,
        ata: { select: { numero: true } },
        vendedor: { select: { nome: true } },
        entidadeAlvo: { select: { nome: true, municipio: true, uf: true } },
        itensAderidos: { select: { criadoEm: true }, orderBy: { criadoEm: "asc" }, take: 1 },
        liquidacoes: { select: { dataLiquidacao: true, statusCobranca: true } },
        vinculosContrato: { where: { status: "confirmado" }, select: { decididoEm: true, criadoEm: true }, take: 1 },
      },
    }),
  ]);

  const linhas: LinhaDoQuadroDaAdesao[] = [];
  const totais: Record<number, number> = {};
  const contar = (etapa: number, n = 1) => {
    totais[etapa] = (totais[etapa] ?? 0) + n;
  };

  // 9: pedido do município esperando a liberação (a etapa 8, o pedido, já foi feita).
  for (const p of pedidos) {
    linhas.push({
      chave: p.id,
      oportunidadeId: null,
      municipio: nomeDoMunicipio(p),
      uf: p.entidadeAlvo.uf,
      ataNumero: p.ata.numero,
      consultor: p.vendedor.nome,
      etapa: 9,
      desde: p.criadoEm,
      vencimento: vencimentoDaEtapaDaAdesao(9, p.criadoEm, feriados),
    });
    contar(9);
  }

  // 10: a contatar (só os mais urgentes entram na lista; o total é o real).
  for (const o of aContatar) {
    linhas.push({
      chave: o.id,
      oportunidadeId: o.id,
      municipio: nomeDoMunicipio(o),
      uf: o.entidadeAlvo.uf,
      ataNumero: o.ata.numero,
      consultor: o.vendedor.nome,
      etapa: 10,
      desde: null,
      vencimento: o.prazoEm,
    });
  }
  contar(10, totalAContatar);

  // 10 a 12: em negociação, ainda sem a declaração: negociando, instruindo ou esperando o jurídico.
  for (const i of fila.itens) {
    const etapa = etapaDaNegociacao({
      instrucaoIniciada: i.obrigatoriosFeitos > 0,
      instrucaoCompleta: i.prontoParaDeclarar,
      declaradaEm: null,
    });
    const desde = etapa === 11 ? i.instrucaoCriadaEm : etapa === 12 ? i.instrucaoAtualizadaEm : null;
    linhas.push({
      chave: i.id,
      oportunidadeId: i.id,
      municipio: i.municipio,
      uf: i.uf,
      ataNumero: i.ataNumero,
      consultor: i.consultor,
      etapa: etapa as NumeroEtapaAdesao,
      desde,
      vencimento: etapa === 10 ? i.prazoEm : desde ? vencimentoDaEtapaDaAdesao(etapa, desde, feriados) : null,
    });
    contar(etapa);
  }

  // 13: declarada, esperando o registro do estagiário.
  for (const o of prontas) {
    const declaradaEm = o.instrucao?.declaracaoEm ?? null;
    linhas.push({
      chave: o.id,
      oportunidadeId: o.id,
      municipio: nomeDoMunicipio(o),
      uf: o.entidadeAlvo.uf,
      ataNumero: o.ata.numero,
      consultor: o.vendedor.nome,
      etapa: 13,
      desde: declaradaEm,
      vencimento: declaradaEm ? vencimentoDaEtapaDaAdesao(13, declaradaEm, feriados) : null,
    });
    contar(13);
  }

  // 14 a 17: adesão registrada, do contrato ao pós-venda.
  for (const o of registradas) {
    const vinculo = o.vinculosContrato[0];
    const posicao = posicaoDaAdesaoRegistrada({
      registradaEm: o.itensAderidos[0]?.criadoEm ?? o.atualizadoEm,
      contratoConfirmadoEm: vinculo ? (vinculo.decididoEm ?? vinculo.criadoEm) : null,
      liquidacoes: o.liquidacoes,
    });
    linhas.push({
      chave: o.id,
      oportunidadeId: o.id,
      municipio: nomeDoMunicipio(o),
      uf: o.entidadeAlvo.uf,
      ataNumero: o.ata.numero,
      consultor: o.vendedor.nome,
      etapa: posicao.etapa,
      desde: posicao.desde,
      vencimento: posicao.desde ? vencimentoDaEtapaDaAdesao(posicao.etapa, posicao.desde, feriados) : null,
    });
    contar(posicao.etapa);
  }

  return { linhas, totais, feriados };
}
