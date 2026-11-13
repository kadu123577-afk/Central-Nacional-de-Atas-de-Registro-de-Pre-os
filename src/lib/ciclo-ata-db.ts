import { prisma } from "@/lib/prisma";
import { situacaoDoCiclo, type DadosDoCiclo, type SituacaoDoCiclo } from "@/lib/ciclo-ata";

/** O CNPJ provisório que a importação do PNCP grava até a equipe confirmar a empresa. */
const CNPJ_FORNECEDOR_A_CONFIRMAR = "00000000000000";

/** Teto de atas lidas no quadro do ciclo (as mais antigas primeiro: são as que mais esperam). */
const LIMITE_DO_QUADRO = 500;

export interface AtaNoCiclo {
  id: string;
  numero: string;
  objeto: string;
  fornecedor: string;
  origem: string;
  dados: DadosDoCiclo;
  situacao: SituacaoDoCiclo;
}

const SELECT_CICLO = {
  id: true,
  numero: true,
  objeto: true,
  status: true,
  origem: true,
  categoria: true,
  createdAt: true,
  updatedAt: true,
  fornecedor: { select: { razaoSocial: true, cnpj: true } },
  contrato: { select: { criadoEm: true } },
  conformidade: { select: { atualizadoEm: true } },
  _count: { select: { itens: true } },
} as const;

type AtaLida = {
  id: string;
  numero: string;
  objeto: string;
  status: "PENDENTE" | "APROVADA" | "REJEITADA";
  origem: string;
  categoria: string | null;
  createdAt: Date;
  updatedAt: Date;
  fornecedor: { razaoSocial: string; cnpj: string };
  contrato: { criadoEm: Date } | null;
  conformidade: { atualizadoEm: Date } | null;
  _count: { itens: number };
};

function montar(ata: AtaLida): AtaNoCiclo {
  const dados: DadosDoCiclo = {
    status: ata.status,
    criadaEm: ata.createdAt,
    atualizadaEm: ata.updatedAt,
    fornecedorAConfirmar: ata.fornecedor.cnpj === CNPJ_FORNECEDOR_A_CONFIRMAR,
    totalItens: ata._count.itens,
    contratoEm: ata.contrato?.criadoEm ?? null,
    conformidadeEm: ata.conformidade?.atualizadoEm ?? null,
    categoria: ata.categoria,
  };
  return {
    id: ata.id,
    numero: ata.numero,
    objeto: ata.objeto,
    fornecedor: ata.fornecedor.razaoSocial,
    origem: ata.origem,
    dados,
    situacao: situacaoDoCiclo(dados),
  };
}

/** As atas que ainda esperam alguma etapa (pendentes e aprovadas não liberadas), da mais antiga à mais nova. */
export async function carregarAtasEmAndamento(): Promise<AtaNoCiclo[]> {
  const atas = await prisma.ata.findMany({
    where: { status: { in: ["PENDENTE", "APROVADA"] } },
    orderBy: { createdAt: "asc" },
    take: LIMITE_DO_QUADRO,
    select: SELECT_CICLO,
  });
  return atas.map(montar).filter((a) => !a.situacao.concluida);
}

export async function carregarAtaNoCiclo(ataId: string): Promise<AtaNoCiclo | null> {
  const ata = await prisma.ata.findUnique({ where: { id: ataId }, select: SELECT_CICLO });
  return ata ? montar(ata) : null;
}

export interface EventoDoHistorico {
  em: Date;
  texto: string;
}

const dinheiro = (v: unknown) => `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

/**
 * Histórico da ata, montado do que o banco registra: cadastro, contrato, conformidade, decisão,
 * adesões registradas e as ações que a trilha de auditoria guardou com esta ata como alvo.
 * É um retrato do que existe, não um registro de tudo: nem toda ação grava a ata como alvo.
 */
export async function carregarHistoriaDaAta(ataId: string): Promise<EventoDoHistorico[]> {
  const ata = await prisma.ata.findUnique({
    where: { id: ataId },
    select: {
      origem: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      contrato: { select: { criadoEm: true, percentualComissao: true } },
      conformidade: { select: { criadoEm: true, atualizadoEm: true, responsavelId: true } },
      oportunidades: {
        where: { estagio: "aderiu" },
        select: { atualizadoEm: true, valorAderido: true, entidadeAlvo: { select: { municipio: true, nome: true } } },
      },
    },
  });
  if (!ata) return [];

  const auditoria = await prisma.logAuditoria.findMany({
    where: { alvo: ataId },
    orderBy: { criadoEm: "desc" },
    take: 30,
    select: { criadoEm: true, ator: true, acao: true, detalhe: true },
  });
  const idsDeAdmin = [
    ...new Set(
      [ata.conformidade?.responsavelId, ...auditoria.map((a) => (a.ator.startsWith("admin:") ? a.ator.slice(6) : null))].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  ];
  const admins = idsDeAdmin.length
    ? await prisma.admin.findMany({ where: { id: { in: idsDeAdmin } }, select: { id: true, nome: true } })
    : [];
  const nomeDe = new Map(admins.map((a) => [a.id, a.nome]));

  const eventos: EventoDoHistorico[] = [
    { em: ata.createdAt, texto: `Ata cadastrada (${ORIGEM_POR_EXTENSO[ata.origem] ?? "origem não informada"}).` },
  ];
  if (ata.contrato) {
    eventos.push({
      em: ata.contrato.criadoEm,
      texto: `Contrato de intermediação cadastrado (comissão de ${(Number(ata.contrato.percentualComissao) * 100).toLocaleString("pt-BR")}%).`,
    });
  }
  if (ata.conformidade) {
    const quem = ata.conformidade.responsavelId ? nomeDe.get(ata.conformidade.responsavelId) : null;
    eventos.push({ em: ata.conformidade.criadoEm, texto: `Conformidade da ata iniciada${quem ? ` por ${quem}` : ""}.` });
    if (ata.conformidade.atualizadoEm.getTime() - ata.conformidade.criadoEm.getTime() > 1000) {
      eventos.push({ em: ata.conformidade.atualizadoEm, texto: `Conformidade da ata atualizada${quem ? ` por ${quem}` : ""}.` });
    }
  }
  if (ata.status !== "PENDENTE") {
    eventos.push({
      em: ata.updatedAt,
      texto: `Ata ${ata.status === "APROVADA" ? "aprovada" : "rejeitada"} (data da última atualização da ata).`,
    });
  }
  for (const o of ata.oportunidades) {
    eventos.push({
      em: o.atualizadoEm,
      texto: `${o.entidadeAlvo.municipio ?? o.entidadeAlvo.nome} aderiu${o.valorAderido != null ? ` (${dinheiro(o.valorAderido)})` : ""}.`,
    });
  }
  for (const a of auditoria) {
    const quem = a.ator.startsWith("admin:") ? (nomeDe.get(a.ator.slice(6)) ?? "equipe") : a.ator;
    eventos.push({ em: a.criadoEm, texto: `${rotuloDaAcao(a.acao)}${a.detalhe ? `: ${a.detalhe}` : ""} (${quem}).` });
  }
  return eventos.sort((x, y) => y.em.getTime() - x.em.getTime());
}

const ORIGEM_POR_EXTENSO: Record<string, string> = {
  MANUAL: "cadastro manual",
  PNCP: "importada do PNCP",
  COMPRAS_GOV: "importada do Compras.gov.br",
};

function rotuloDaAcao(acao: string): string {
  const rotulos: Record<string, string> = {
    "admin.importarItens": "Itens importados por planilha",
    "admin.registrarAdesao": "Adesão registrada",
    "admin.desfazerRegistroAdesao": "Registro de adesão desfeito",
  };
  return rotulos[acao] ?? acao;
}
