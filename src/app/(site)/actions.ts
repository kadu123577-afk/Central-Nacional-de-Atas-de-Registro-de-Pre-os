"use server";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { orgaoIdLogado } from "@/lib/auth";
import { ataDisponivelParaPedido } from "@/lib/catalogo-publico";
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

/**
 * Pedido de adesão a uma ata, feito por órgão LOGADO (2026-10-20). O órgão não
 * vê os itens da ata (isso permitiria achá-la no PNCP e contratar direto, sem a
 * plataforma): ele diz o que precisa, em texto livre, e a equipe, que vê tudo,
 * confere itens e saldo e monta o pedido. O pedido cai na mesma fila de
 * /admin/demandas, com o tipo "pedido_adesao" e o vínculo com a ata.
 *
 * Nome do órgão e UF vêm da conta (não do formulário), então ninguém pede em
 * nome de outro órgão.
 */
export async function pedirAdesaoNaAta(
  ataId: string,
  _estadoAnterior: EstadoDemanda,
  formData: FormData,
): Promise<EstadoDemanda> {
  const orgaoId = await orgaoIdLogado();
  if (!orgaoId) {
    return { erro: "Entre com o acesso do seu órgão para pedir a adesão." };
  }
  const orgao = await prisma.orgao.findUnique({
    where: { id: orgaoId },
    select: { nome: true, uf: true, ativo: true },
  });
  if (!orgao?.ativo) {
    return { erro: "Esta conta de órgão está desativada. Fale com a equipe da Central." };
  }
  if (!(await ataDisponivelParaPedido(ataId))) {
    return { erro: "Esta ata não está mais disponível para adesão." };
  }

  const dados = { ...lerDemanda(formData, 1500), orgao: orgao.nome, uf: orgao.uf };
  const erros = validarDemanda(dados);
  if (Object.keys(erros).length > 0) {
    return { erros, valores: dados };
  }

  const limite = await checarLimiteCadastro();
  if (limite) {
    return { erro: limite, valores: dados };
  }

  const repetido = await prisma.demandaSemAta.findFirst({
    where: {
      orgaoId,
      ataId,
      objeto: dados.objeto,
      criadoEm: { gte: new Date(Date.now() - 10 * 60 * 1000) },
    },
    select: { id: true },
  });
  if (repetido) {
    return { ok: true };
  }

  const ip = await ipDaRequisicao();
  const ipHash = createHash("sha256")
    .update(`${ip}|${process.env.SESSION_SECRET ?? ""}`)
    .digest("hex")
    .slice(0, 24);

  const pedido = await prisma.demandaSemAta.create({
    data: {
      tipo: "pedido_adesao",
      ataId,
      orgaoId,
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

  await registrarAuditoria({ ator: `orgao:${orgaoId}`, acao: "orgao.pedido_adesao", alvo: pedido.id });
  return { ok: true };
}
