"use server";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { checarLimiteCadastro, ipDaRequisicao } from "@/lib/limite-tentativas";
import { lerDemanda, validarDemanda, type DadosDemanda, type ErrosDemanda } from "@/lib/demandas";

export interface EstadoDemanda {
  ok?: boolean;
  erro?: string;
  erros?: ErrosDemanda;
  /** Valores digitados, devolvidos em caso de erro (o React limpa o formulário depois da ação). */
  valores?: DadosDemanda;
}

/**
 * Formulário "Não achei a ata" (vitrine pública). Sem login, então tem
 * quatro freios: campo-isca invisível (robôs preenchem, pessoas não), limite
 * por IP, validação de tamanho e formato, e bloqueio de duplicata (mesmo
 * contato e objeto em 10 minutos).
 */
export async function registrarDemanda(
  _estadoAnterior: EstadoDemanda,
  formData: FormData,
): Promise<EstadoDemanda> {
  // Campo-isca: se veio preenchido, finge sucesso e não grava nada.
  if (String(formData.get("website") ?? "").trim() !== "") {
    return { ok: true };
  }

  const dados = lerDemanda(formData);
  const erros = validarDemanda(dados);
  if (Object.keys(erros).length > 0) {
    return { erros, valores: dados };
  }

  const limite = await checarLimiteCadastro();
  if (limite) {
    return { erro: limite, valores: dados };
  }

  const repetida = await prisma.demandaSemAta.findFirst({
    where: {
      contato: dados.contato,
      objeto: dados.objeto,
      criadoEm: { gte: new Date(Date.now() - 10 * 60 * 1000) },
    },
    select: { id: true },
  });
  if (repetida) {
    return { ok: true };
  }

  const ip = await ipDaRequisicao();
  const ipHash = createHash("sha256")
    .update(`${ip}|${process.env.SESSION_SECRET ?? ""}`)
    .digest("hex")
    .slice(0, 24);

  const demanda = await prisma.demandaSemAta.create({
    data: {
      objeto: dados.objeto,
      quantidade: dados.quantidade || null,
      uf: dados.uf || null,
      prazo: dados.prazo || null,
      orgao: dados.orgao,
      nome: dados.nome,
      cargo: dados.cargo || null,
      contato: dados.contato,
      observacoes: dados.observacoes || null,
      ipHash,
    },
    select: { id: true },
  });

  await registrarAuditoria({ ator: "anonimo", acao: "site.demanda_sem_ata", alvo: demanda.id });
  return { ok: true };
}
