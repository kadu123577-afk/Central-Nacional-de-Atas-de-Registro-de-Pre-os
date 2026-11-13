import { prisma } from "@/lib/prisma";
import { nomeDaCaptacao } from "@/lib/captacao";

/**
 * O que a ata cadastrada no sistema entrega à Captação: a empresa, o órgão e os dados da ata
 * como foram digitados no cadastro (que valem mais que a cópia do radar).
 */
export interface AtaCadastradaParaCaptacao {
  ataId: string;
  adminId: string;
  /** Cartão de onde o cadastro partiu ("Fechou: cadastrar a ata"); vazio = cadastro direto. */
  captacaoId?: string | null;
  fornecedorCnpj: string;
  fornecedorNome: string;
  orgaoNome: string;
  uf: string;
  municipioNome: string;
  numeroAta: string;
  objeto: string;
  categoria: string;
  vigenciaFim: Date;
}

/**
 * Liga a ata recém-cadastrada a um cartão da Captação e o fecha. Se o cadastro partiu de um
 * cartão que ainda está aberto, é esse cartão que fecha (e passa a mostrar a ata); caso
 * contrário (cadastro direto, ou cartão que já tinha ata), nasce um cartão novo, já fechado,
 * para a ata aparecer na produção do captador. Devolve o id do cartão.
 */
export async function vincularAtaACaptacao(a: AtaCadastradaParaCaptacao): Promise<string> {
  const dados = {
    fornecedorCnpj: a.fornecedorCnpj,
    fornecedorNome: a.fornecedorNome,
    orgaoNome: a.orgaoNome,
    uf: a.uf,
    municipioNome: a.municipioNome,
    numeroAta: a.numeroAta,
    objeto: a.objeto,
    categoria: a.categoria,
    vigenciaFim: a.vigenciaFim,
  };

  if (a.captacaoId) {
    const atual = await prisma.captacao.findUnique({
      where: { id: a.captacaoId },
      select: { id: true, ataId: true, responsavelId: true },
    });
    if (atual && !atual.ataId) {
      await prisma.captacao.update({
        where: { id: atual.id },
        data: {
          ...dados,
          ataId: a.ataId,
          estagio: "fechada",
          motivoPerda: null,
          proximoContatoEm: null,
          responsavelId: atual.responsavelId ?? a.adminId,
        },
      });
      return atual.id;
    }
  }

  const criado = await prisma.captacao.create({
    data: {
      ...dados,
      nome: nomeDaCaptacao({
        categoria: a.categoria,
        objeto: a.objeto,
        orgaoNome: a.orgaoNome,
        uf: a.uf,
        vigenciaFim: a.vigenciaFim,
      }),
      origem: "indicacao",
      estagio: "fechada",
      ataId: a.ataId,
      responsavelId: a.adminId,
      criadoPorId: a.adminId,
    },
    select: { id: true },
  });
  return criado.id;
}
