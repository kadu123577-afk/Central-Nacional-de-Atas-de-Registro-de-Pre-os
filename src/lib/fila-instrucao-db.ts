import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizarMapa, resumirInstrucao } from "@/lib/instrucao-adesao";

/**
 * Fila da instrução da adesão (atividades 11 e 12 do workflow, 14/11/2026): os municípios em
 * negociação que ainda não têm a declaração de conformidade do jurídico. Quem instrui (Dr. Rui,
 * o consultor) vê o quanto falta de cada um; o jurídico vê os que já estão com todos os itens
 * obrigatórios feitos e esperam a declaração. Depois da declaração o município sai desta fila e
 * entra na de registro (ONDE_PRONTA_PARA_REGISTRAR, src/lib/registrar-adesao-db.ts).
 */
export interface ItemDaFilaDeInstrucao {
  id: string;
  municipio: string;
  uf: string | null;
  ataNumero: string;
  consultor: string;
  prazoEm: Date | null;
  obrigatoriosFeitos: number;
  obrigatoriosTotal: number;
  /** Todos os itens obrigatórios feitos: pronto para o jurídico declarar. */
  prontoParaDeclarar: boolean;
}

export interface FilaDaInstrucao {
  /** Total de municípios em negociação sem declaração (pode ser maior que a lista devolvida). */
  total: number;
  prontosParaDeclarar: number;
  /** Os prontos primeiro; dentro de cada grupo, o prazo mais curto antes. */
  itens: ItemDaFilaDeInstrucao[];
}

export const ONDE_EM_INSTRUCAO = {
  expiradaEm: null,
  estagio: "em_negociacao",
  OR: [{ instrucao: { is: null } }, { instrucao: { is: { declaracaoEm: null } } }],
} satisfies Prisma.OportunidadeVendaWhereInput;

export async function carregarFilaDaInstrucao(limite = 300): Promise<FilaDaInstrucao> {
  const [total, linhas] = await Promise.all([
    prisma.oportunidadeVenda.count({ where: ONDE_EM_INSTRUCAO }),
    prisma.oportunidadeVenda.findMany({
      where: ONDE_EM_INSTRUCAO,
      orderBy: [{ prazoEm: { sort: "asc", nulls: "last" } }, { criadoEm: "asc" }],
      take: limite,
      select: {
        id: true,
        prazoEm: true,
        entidadeAlvo: { select: { nome: true, municipio: true, uf: true } },
        ata: { select: { numero: true } },
        vendedor: { select: { nome: true } },
        instrucao: { select: { itens: true } },
      },
    }),
  ]);

  const itens = linhas.map((l): ItemDaFilaDeInstrucao => {
    const resumo = resumirInstrucao(normalizarMapa(l.instrucao?.itens ?? {}));
    return {
      id: l.id,
      municipio: l.entidadeAlvo.municipio ?? l.entidadeAlvo.nome,
      uf: l.entidadeAlvo.uf,
      ataNumero: l.ata.numero,
      consultor: l.vendedor.nome,
      prazoEm: l.prazoEm,
      obrigatoriosFeitos: resumo.obrigatoriosFeitos,
      obrigatoriosTotal: resumo.obrigatoriosTotal,
      prontoParaDeclarar: resumo.completo,
    };
  });
  // Estável: os prontos sobem, o resto mantém a ordem do prazo.
  itens.sort((a, b) => Number(b.prontoParaDeclarar) - Number(a.prontoParaDeclarar));

  return { total, prontosParaDeclarar: itens.filter((i) => i.prontoParaDeclarar).length, itens };
}
