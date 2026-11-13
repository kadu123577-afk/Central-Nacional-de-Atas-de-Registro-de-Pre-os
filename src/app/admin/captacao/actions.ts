"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { registrarAuditoria } from "@/lib/auditoria";
import { prisma } from "@/lib/prisma";
import {
  dadosDaCaptacaoDoRadar,
  estagioCaptacaoValido,
  LIMITE_CONTATOS_POR_EMPRESA,
  lerContatoEmpresa,
  lerInteracao,
  lerNovaCaptacao,
  motivoPerdaValido,
  podeMoverEstagioCaptacao,
  textoCurto,
  type CamposNovaCaptacao,
} from "@/lib/captacao";
import { cnpjValido, normalizarCnpj } from "@/lib/radar-atas";
import { dataParaCampo, LIMITE_OBSERVACOES, lerDataSoDia, normalizarObservacao } from "@/lib/radar-atas-view";

/**
 * Ações da Captação de atas (2026-11-14): o Kanban do captador. Toda ação confere a sessão e a
 * permissão "atas.captar" ANTES de ler o formulário. A troca de estágio é atômica (o `where`
 * leva o estágio que a tela mostrava). A trilha de auditoria guarda quem fez o quê e em qual
 * cartão, nunca o texto das anotações nem o contato de ninguém (LGPD).
 */

const CAMINHO = "/admin/captacao";

export interface EstadoCaptacao {
  erro?: string;
  ok?: boolean;
  aviso?: string;
  /** O que foi digitado, para repor o formulário depois de um erro (o React zera o formulário). */
  valores?: Record<string, string>;
}

async function exigirCaptador(): Promise<string> {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "atas.captar");
  return adminId;
}

function texto(formData: FormData, nome: string): string {
  const v = formData.get(nome);
  // Arquivo num campo de texto (requisição montada à mão) não é texto.
  return typeof v === "string" ? v : "";
}

function idValido(id: string): boolean {
  return /^c[a-z0-9]{15,40}$/.test(id);
}

function valoresDe(formData: FormData, campos: readonly string[]): Record<string, string> {
  return Object.fromEntries(campos.map((c) => [c, texto(formData, c)]));
}

function atualizarTelas(id?: string) {
  revalidatePath(CAMINHO);
  if (id) revalidatePath(`${CAMINHO}/${id}`);
}

// ───────────────────────────── Entrada no Kanban ─────────────────────────────

/** "Captar" no Radar: copia a ata para um cartão "Identificada", com quem clicou como responsável. */
export async function captarAtaDoRadar(formData: FormData): Promise<void> {
  const adminId = await exigirCaptador();
  const radarId = texto(formData, "radarId").trim();
  if (!idValido(radarId)) redirect("/admin/radar-atas");

  const radar = await prisma.radarAta.findUnique({
    where: { id: radarId },
    select: {
      numeroControlePncpAta: true,
      orgaoNome: true,
      uf: true,
      municipioNome: true,
      objeto: true,
      categoria: true,
      vigenciaFim: true,
      fornecedorCnpj: true,
      fornecedorNome: true,
    },
  });
  if (!radar) redirect("/admin/radar-atas");

  // Um cartão por ata do PNCP: se já existe, leva até ele.
  const existente = await prisma.captacao.findUnique({
    where: { numeroControlePncpAta: radar.numeroControlePncpAta },
    select: { id: true },
  });
  if (existente) redirect(`${CAMINHO}/${existente.id}`);

  const dados = dadosDaCaptacaoDoRadar(radar);
  let id: string;
  try {
    const criado = await prisma.captacao.create({
      data: { ...dados, estagio: "identificada", responsavelId: adminId, criadoPorId: adminId },
      select: { id: true },
    });
    id = criado.id;
  } catch {
    // Dois cliques ao mesmo tempo: o outro venceu, mostra o cartão dele.
    const corrida = await prisma.captacao.findUnique({
      where: { numeroControlePncpAta: radar.numeroControlePncpAta },
      select: { id: true },
    });
    if (!corrida) redirect("/admin/radar-atas");
    id = corrida.id;
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "captacao.captarDoRadar",
    alvo: id,
    detalhe: `ata do PNCP ${radar.numeroControlePncpAta}`,
  });
  atualizarTelas();
  redirect(`${CAMINHO}/${id}`);
}

const CAMPOS_NOVA = [
  "fornecedorNome",
  "fornecedorCnpj",
  "orgaoNome",
  "uf",
  "municipioNome",
  "objeto",
  "categoria",
  "numeroAta",
  "vigenciaFim",
  "proximoContatoEm",
  "observacoes",
  "contatoNome",
  "contatoCargo",
  "contatoTelefone",
  "contatoEmail",
  "contatoComoObteve",
] as const;

/** Cadastro manual: o captador soube da ata por um contato próprio, fora do PNCP e do radar. */
export async function criarCaptacaoManual(_anterior: EstadoCaptacao, formData: FormData): Promise<EstadoCaptacao> {
  const adminId = await exigirCaptador();
  const valores: Record<string, string> = {
    ...valoresDe(formData, CAMPOS_NOVA),
    contatoWhatsapp: texto(formData, "contatoWhatsapp"),
  };

  const campos: CamposNovaCaptacao = {
    fornecedorNome: valores.fornecedorNome,
    fornecedorCnpj: valores.fornecedorCnpj,
    orgaoNome: valores.orgaoNome,
    uf: valores.uf,
    municipioNome: valores.municipioNome,
    objeto: valores.objeto,
    categoria: valores.categoria,
    numeroAta: valores.numeroAta,
    vigenciaFim: valores.vigenciaFim,
    proximoContatoEm: valores.proximoContatoEm,
    observacoes: valores.observacoes,
    contatoNome: valores.contatoNome,
    contatoCargo: valores.contatoCargo,
    contatoTelefone: valores.contatoTelefone,
    contatoWhatsapp: valores.contatoWhatsapp === "on",
    contatoEmail: valores.contatoEmail,
    contatoComoObteve: valores.contatoComoObteve,
  };
  const lido = lerNovaCaptacao(campos);
  if (!lido.ok) return { erro: lido.erro, valores };

  if (lido.contato) {
    const ja = await prisma.contatoEmpresa.count({ where: { cnpj: lido.dados.fornecedorCnpj! } });
    if (ja >= LIMITE_CONTATOS_POR_EMPRESA) {
      return { erro: `Esta empresa já tem ${LIMITE_CONTATOS_POR_EMPRESA} contatos. Apague algum antes de somar outro.`, valores };
    }
  }

  const criado = await prisma.captacao.create({
    data: {
      ...lido.dados,
      estagio: "identificada",
      proximoContatoEm: lido.proximoContatoEm,
      observacoes: lido.observacoes,
      responsavelId: adminId,
      criadoPorId: adminId,
    },
    select: { id: true },
  });
  if (lido.contato) {
    await prisma.contatoEmpresa.create({
      data: { ...lido.contato, cnpj: lido.dados.fornecedorCnpj!, criadoPorId: adminId },
    });
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "captacao.criarManual",
    alvo: criado.id,
    detalhe: `CNPJ ${lido.dados.fornecedorCnpj}${lido.contato ? "; com contato da empresa" : ""}`,
  });
  atualizarTelas();
  redirect(`${CAMINHO}/${criado.id}`);
}

// ───────────────────────────── Andamento do cartão ─────────────────────────────

/** Move o cartão de estágio (um passo por vez; "Não deu" pede o motivo; "Fechada" só pelo cadastro da ata). */
export async function moverEstagioCaptacao(_anterior: EstadoCaptacao, formData: FormData): Promise<EstadoCaptacao> {
  const adminId = await exigirCaptador();

  const id = texto(formData, "id").trim();
  if (!idValido(id)) return { erro: "Cartão inválido. Atualize a página e tente de novo." };
  const destino = texto(formData, "estagio").trim();
  if (!estagioCaptacaoValido(destino)) return { erro: "Escolha um estágio válido." };

  const motivo = texto(formData, "motivoPerda").trim();
  if (destino === "perdida" && !motivoPerdaValido(motivo)) {
    return { erro: "Diga por que não deu (recusou, sem retorno...)." };
  }

  const atual = await prisma.captacao.findUnique({ where: { id }, select: { estagio: true, nome: true } });
  if (!atual) return { erro: "Este cartão não existe mais. Atualize a página." };

  const regra = podeMoverEstagioCaptacao(atual.estagio, destino);
  if (!regra.ok) return { erro: regra.erro ?? "Essa mudança de estágio não é permitida." };
  if (atual.estagio === destino) return { ok: true, aviso: "O cartão já estava neste estágio." };

  const { count } = await prisma.captacao.updateMany({
    where: { id, estagio: atual.estagio },
    data: { estagio: destino, motivoPerda: destino === "perdida" ? motivo : null },
  });
  if (count === 0) {
    atualizarTelas(id);
    return { erro: "O estágio deste cartão mudou enquanto você olhava a tela. Veja o estágio atual e tente de novo." };
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "captacao.moverEstagio",
    alvo: id,
    detalhe: `${atual.estagio} → ${destino}`,
  });
  atualizarTelas(id);
  return { ok: true };
}

const CAMPOS_DADOS = ["nome", "responsavelId", "proximoContatoEm", "observacoes"] as const;

/** Nome do cartão, responsável, próximo contato e anotações (data vazia apaga; anotações vazias apagam). */
export async function atualizarCaptacao(_anterior: EstadoCaptacao, formData: FormData): Promise<EstadoCaptacao> {
  const adminId = await exigirCaptador();
  const valores = valoresDe(formData, CAMPOS_DADOS);

  const id = texto(formData, "id").trim();
  if (!idValido(id)) return { erro: "Cartão inválido. Atualize a página e tente de novo.", valores };

  const nome = textoCurto(valores.nome);
  if (!nome) return { erro: "O cartão precisa de um nome.", valores };
  if (nome.length > 140) return { erro: "O nome passa de 140 caracteres.", valores };

  const proximo = lerDataSoDia(valores.proximoContatoEm);
  if (!proximo.ok) return { erro: "Data do próximo contato inválida. Escolha uma data real.", valores };

  const observacoes = normalizarObservacao(valores.observacoes);
  if (observacoes.length > LIMITE_OBSERVACOES) {
    return {
      erro: `As anotações têm ${observacoes.length} caracteres; o limite é ${LIMITE_OBSERVACOES}. Resuma o texto.`,
      valores,
    };
  }

  // O responsável tem de ser alguém da captação com a conta ativa (ou ninguém).
  const responsavelId = valores.responsavelId.trim();
  if (responsavelId) {
    const quem = idValido(responsavelId)
      ? await prisma.admin.findFirst({
          where: { id: responsavelId, ativo: true, permissoes: { has: "atas.captar" } },
          select: { id: true },
        })
      : null;
    if (!quem) return { erro: "Escolha um responsável da lista.", valores };
  }

  const atual = await prisma.captacao.findUnique({
    where: { id },
    select: { nome: true, responsavelId: true, proximoContatoEm: true, observacoes: true },
  });
  if (!atual) return { erro: "Este cartão não existe mais. Atualize a página.", valores };

  const mudou: string[] = [];
  const data: Record<string, unknown> = {};
  if (atual.nome !== nome) {
    data.nome = nome;
    mudou.push("nome");
  }
  if ((atual.responsavelId ?? "") !== responsavelId) {
    data.responsavelId = responsavelId || null;
    mudou.push("responsável");
  }
  if (dataParaCampo(atual.proximoContatoEm) !== dataParaCampo(proximo.data)) {
    data.proximoContatoEm = proximo.data;
    mudou.push("próximo contato");
  }
  if ((atual.observacoes ?? "") !== observacoes) {
    data.observacoes = observacoes || null;
    mudou.push("anotações");
  }
  if (mudou.length === 0) return { ok: true, aviso: "Nada mudou." };

  const { count } = await prisma.captacao.updateMany({ where: { id }, data });
  if (count === 0) return { erro: "Este cartão não existe mais. Atualize a página.", valores };

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "captacao.atualizar",
    alvo: id,
    detalhe: mudou.join("; "),
  });
  atualizarTelas(id);
  return { ok: true };
}

/** Razão social e CNPJ da empresa dona da ata (o radar nem sempre identifica o fornecedor). */
export async function definirEmpresaCaptacao(_anterior: EstadoCaptacao, formData: FormData): Promise<EstadoCaptacao> {
  const adminId = await exigirCaptador();
  const valores = valoresDe(formData, ["fornecedorNome", "fornecedorCnpj"] as const);

  const id = texto(formData, "id").trim();
  if (!idValido(id)) return { erro: "Cartão inválido. Atualize a página e tente de novo.", valores };

  const nome = textoCurto(valores.fornecedorNome);
  if (!nome) return { erro: "Informe a razão social da empresa.", valores };
  if (nome.length > 150) return { erro: "A razão social passa de 150 caracteres.", valores };
  if (!cnpjValido(valores.fornecedorCnpj)) {
    return { erro: "CNPJ inválido. Confira os 14 dígitos (CPF não vale: a captação é de empresa).", valores };
  }
  const cnpj = normalizarCnpj(valores.fornecedorCnpj)!;

  const { count } = await prisma.captacao.updateMany({ where: { id }, data: { fornecedorNome: nome, fornecedorCnpj: cnpj } });
  if (count === 0) return { erro: "Este cartão não existe mais. Atualize a página.", valores };

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "captacao.definirEmpresa",
    alvo: id,
    detalhe: `CNPJ ${cnpj}`,
  });
  atualizarTelas(id);
  return { ok: true };
}

/** Registra um contato com a empresa. Se o cartão estava em "Identificada", passa para "Em contato". */
export async function registrarInteracaoCaptacao(_anterior: EstadoCaptacao, formData: FormData): Promise<EstadoCaptacao> {
  const adminId = await exigirCaptador();
  const valores = valoresDe(formData, ["canal", "resumo", "quando", "proximoContatoEm"] as const);

  const id = texto(formData, "id").trim();
  if (!idValido(id)) return { erro: "Cartão inválido. Atualize a página e tente de novo.", valores };

  const lido = lerInteracao({ canal: valores.canal, resumo: valores.resumo, quando: valores.quando }, new Date());
  if (!lido.ok) return { erro: lido.erro, valores };
  const proximo = lerDataSoDia(valores.proximoContatoEm);
  if (!proximo.ok) return { erro: "Data do próximo contato inválida. Escolha uma data real.", valores };

  const cartao = await prisma.captacao.findUnique({ where: { id }, select: { estagio: true, responsavelId: true } });
  if (!cartao) return { erro: "Este cartão não existe mais. Atualize a página.", valores };

  await prisma.interacaoCaptacao.create({
    data: { captacaoId: id, autorId: adminId, canal: lido.canal, resumo: lido.resumo, quando: lido.quando },
  });

  // Primeiro contato: o cartão sai de "Identificada" (só se ainda estiver lá) e ganha dono.
  if (cartao.estagio === "identificada") {
    await prisma.captacao.updateMany({ where: { id, estagio: "identificada" }, data: { estagio: "em_contato" } });
  }
  if (!cartao.responsavelId) {
    await prisma.captacao.updateMany({ where: { id, responsavelId: null }, data: { responsavelId: adminId } });
  }
  if (valores.proximoContatoEm.trim()) {
    await prisma.captacao.updateMany({ where: { id }, data: { proximoContatoEm: proximo.data } });
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "captacao.registrarContato",
    alvo: id,
    detalhe: `canal ${lido.canal}`,
  });
  atualizarTelas(id);
  return { ok: true };
}

// ───────────────────────────── Contatos da empresa (LGPD) ─────────────────────────────

/**
 * Cria ou corrige um contato da empresa do cartão. O contato fica ligado ao CNPJ (vale para
 * todas as atas da empresa). A trilha guarda só o CNPJ e o id do contato.
 */
export async function salvarContatoDaEmpresa(_anterior: EstadoCaptacao, formData: FormData): Promise<EstadoCaptacao> {
  const adminId = await exigirCaptador();
  const valores = valoresDe(formData, ["nome", "cargo", "telefone", "email", "comoObteve"] as const);

  const captacaoId = texto(formData, "captacaoId").trim();
  if (!idValido(captacaoId)) return { erro: "Cartão inválido. Atualize a página e tente de novo.", valores };
  const contatoId = texto(formData, "contatoId").trim();
  if (contatoId && !idValido(contatoId)) return { erro: "Contato inválido. Atualize a página.", valores };

  const cartao = await prisma.captacao.findUnique({ where: { id: captacaoId }, select: { fornecedorCnpj: true } });
  if (!cartao) return { erro: "Este cartão não existe mais. Atualize a página.", valores };
  if (!cartao.fornecedorCnpj) {
    return { erro: "Identifique a empresa (razão social e CNPJ) antes de guardar o contato dela.", valores };
  }

  const lido = lerContatoEmpresa({
    nome: valores.nome,
    cargo: valores.cargo,
    telefone: valores.telefone,
    whatsapp: texto(formData, "whatsapp") === "on",
    email: valores.email,
    comoObteve: valores.comoObteve,
  });
  if (!lido.ok) return { erro: lido.erro, valores };

  if (contatoId) {
    // Só mexe em contato da empresa deste cartão.
    const { count } = await prisma.contatoEmpresa.updateMany({
      where: { id: contatoId, cnpj: cartao.fornecedorCnpj },
      data: lido.contato,
    });
    if (count === 0) return { erro: "Este contato não existe mais. Atualize a página.", valores };
  } else {
    const ja = await prisma.contatoEmpresa.count({ where: { cnpj: cartao.fornecedorCnpj } });
    if (ja >= LIMITE_CONTATOS_POR_EMPRESA) {
      return { erro: `Esta empresa já tem ${LIMITE_CONTATOS_POR_EMPRESA} contatos. Apague algum antes de somar outro.`, valores };
    }
    await prisma.contatoEmpresa.create({
      data: { ...lido.contato, cnpj: cartao.fornecedorCnpj, criadoPorId: adminId },
    });
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: contatoId ? "captacao.contato.corrigir" : "captacao.contato.criar",
    alvo: contatoId || captacaoId,
    detalhe: `CNPJ ${cartao.fornecedorCnpj}`,
  });
  atualizarTelas(captacaoId);
  return { ok: true };
}

/** Apaga o contato por completo (definitivo): a pessoa pode pedir para sair. */
export async function excluirContatoDaEmpresa(formData: FormData): Promise<void> {
  const adminId = await exigirCaptador();
  const captacaoId = texto(formData, "captacaoId").trim();
  const contatoId = texto(formData, "contatoId").trim();
  if (!idValido(captacaoId) || !idValido(contatoId)) return;

  const cartao = await prisma.captacao.findUnique({ where: { id: captacaoId }, select: { fornecedorCnpj: true } });
  if (!cartao?.fornecedorCnpj) return;

  const { count } = await prisma.contatoEmpresa.deleteMany({ where: { id: contatoId, cnpj: cartao.fornecedorCnpj } });
  if (count > 0) {
    await registrarAuditoria({
      ator: `admin:${adminId}`,
      acao: "captacao.contato.apagar",
      alvo: contatoId,
      detalhe: `CNPJ ${cartao.fornecedorCnpj}`,
    });
  }
  atualizarTelas(captacaoId);
}
