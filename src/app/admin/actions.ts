"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  adminIdLogado,
  criarSessaoAdmin,
  encerrarSessaoAdmin,
  gastarTempoDeHash,
  hashSenha,
  verificarSenha,
} from "@/lib/auth";
import {
  checarBloqueioLogin,
  registrarFalhaLogin,
  registrarSucessoLogin,
} from "@/lib/limite-tentativas";
import { registrarAuditoria } from "@/lib/auditoria";
import { detectarTipoDocumento, nomeArquivoSeguro } from "@/lib/documentos";
import { statusDemandaValido } from "@/lib/demandas";
import { validarTituloPublico } from "@/lib/site/titulo";
import { validarSenhaNova } from "@/lib/senha";
import {
  cifrarSegredo,
  decifrarSegredo,
  gerarSegredoTotp,
  uriOtpauth,
  verificarTotp,
} from "@/lib/totp";
import { prisma } from "@/lib/prisma";
import type { EstadoTrocarSenha } from "@/components/ui/formulario-trocar-senha";
import { esferaValida } from "@/lib/esferas";
import { resultadoInteracaoValido } from "@/lib/pontos-focais";
import { tipoEntidadeAlvoValido } from "@/lib/entidades-alvo";
import { calcularRaioXConsumo } from "@/lib/raio-x-consumo";
import { CATEGORIAS_ATAS } from "@/lib/categorias";
import { tipoVendedorValido } from "@/lib/vendedores";
import { tipoSinalValido } from "@/lib/sinais";
import { interpretarPercentualComissao } from "@/lib/comissao";
import { calcularPrazo } from "@/lib/negociacao";
import {
  interpretarDataLiquidacao,
  interpretarDataPagamentoEnte,
  motivoParaRecusarCobranca,
  statusCobrancaValido,
  tipoLiquidacaoValido,
} from "@/lib/recebiveis";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { ITENS_CONFORMIDADE, itensPendentes, type RespostasConformidade } from "@/lib/conformidade";

export interface EstadoLoginAdmin {
  erro?: string;
}

export async function loginAdmin(
  _estadoAnterior: EstadoLoginAdmin,
  formData: FormData,
): Promise<EstadoLoginAdmin> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const codigo = String(formData.get("codigo") ?? "");

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const bloqueio = await checarBloqueioLogin("admin", email);
  if (bloqueio) {
    return { erro: bloqueio };
  }

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) {
    await gastarTempoDeHash(senha);
    await registrarFalhaLogin("admin", email);
    return { erro: "E-mail ou senha inválidos." };
  }

  const senhaCorreta = await verificarSenha(senha, admin.senhaHash);
  if (!senhaCorreta) {
    await registrarFalhaLogin("admin", email);
    await registrarAuditoria({ ator: `admin:${admin.id}`, acao: "admin.login_falhou" });
    return { erro: "E-mail ou senha inválidos." };
  }

  // 2FA: com o autenticador ativado, a senha sozinha não basta.
  if (admin.totpAtivo && admin.totpSegredo) {
    if (!codigo.trim()) {
      return { erro: "Informe o código de verificação do aplicativo autenticador." };
    }
    const passo = verificarTotp(decifrarSegredo(admin.totpSegredo), codigo, admin.totpUltimoPasso);
    if (passo === null) {
      await registrarFalhaLogin("admin", email);
      await registrarAuditoria({ ator: `admin:${admin.id}`, acao: "admin.login_2fa_falhou" });
      return { erro: "Código de verificação inválido ou já utilizado." };
    }
    await prisma.admin.update({ where: { id: admin.id }, data: { totpUltimoPasso: passo } });
  }

  await registrarSucessoLogin("admin", email);
  await registrarAuditoria({ ator: `admin:${admin.id}`, acao: "admin.login" });
  await criarSessaoAdmin(admin.id);
  redirect("/admin");
}

export async function logoutAdmin(): Promise<void> {
  await encerrarSessaoAdmin();
  redirect("/admin/login");
}

export interface EstadoCompletarAta {
  erro?: string;
}

/**
 * Corrige o fornecedor de uma ata importada do PNCP sem fornecedor real
 * identificado. NÃO edita o fornecedor-placeholder em si (CNPJ
 * 00000000000000) — ele é compartilhado por qualquer ata PNCP ainda sem
 * fornecedor confirmado, editar em cima dele mudaria o fornecedor de
 * TODAS as outras atas que ainda apontam pra ele. Em vez disso, faz
 * upsert de um fornecedor real (por CNPJ) e reaponta só esta ata pra ele.
 */
export async function completarFornecedorDaAta(
  _estadoAnterior: EstadoCompletarAta,
  formData: FormData,
): Promise<EstadoCompletarAta> {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const ataId = String(formData.get("ataId") ?? "");
  const razaoSocial = String(formData.get("razaoSocial") ?? "").trim();
  const cnpj = String(formData.get("cnpj") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!ataId || !razaoSocial || !cnpj || !email) {
    return { erro: "Preencha razão social, CNPJ e e-mail do fornecedor." };
  }

  const fornecedorReal = await prisma.fornecedor.upsert({
    where: { cnpj },
    update: { razaoSocial, email },
    create: { razaoSocial, cnpj, email },
  });

  await prisma.ata.update({ where: { id: ataId }, data: { fornecedorId: fornecedorReal.id } });
  revalidatePath(`/admin/atas/${ataId}/completar`);
  revalidatePath("/admin");
  return {};
}

export interface EstadoAdicionarItem {
  erro?: string;
}

export async function adicionarItemNaAta(
  _estadoAnterior: EstadoAdicionarItem,
  formData: FormData,
): Promise<EstadoAdicionarItem> {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const ataId = String(formData.get("ataId") ?? "");
  const descricao = String(formData.get("descricao") ?? "").trim();
  const categoria = String(formData.get("categoria") ?? "").trim();
  const unidade = String(formData.get("unidade") ?? "").trim();
  const quantidadeRegistrada = Number(formData.get("quantidadeRegistrada"));
  const valorUnitario = String(formData.get("valorUnitario") ?? "").trim();

  if (
    !ataId ||
    !descricao ||
    !categoria ||
    !unidade ||
    !valorUnitario ||
    !Number.isFinite(quantidadeRegistrada) ||
    quantidadeRegistrada <= 0
  ) {
    return { erro: "Preencha todos os campos do item com valores válidos." };
  }

  await prisma.item.create({
    data: {
      ataId,
      descricao,
      categoria,
      unidade,
      quantidadeRegistrada,
      valorUnitario,
      saldo: { create: {} },
    },
  });

  revalidatePath(`/admin/atas/${ataId}/completar`);
  revalidatePath("/admin");
  return {};
}

export async function trocarSenhaAdmin(
  _estadoAnterior: EstadoTrocarSenha,
  formData: FormData,
): Promise<EstadoTrocarSenha> {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const senhaAtual = String(formData.get("senhaAtual") ?? "");
  const senhaNova = String(formData.get("senhaNova") ?? "");
  const confirmacao = String(formData.get("confirmacaoSenhaNova") ?? "");

  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  const erroSenha = validarSenhaNova(senhaNova, admin?.email);
  if (erroSenha) {
    return { erro: erroSenha };
  }
  if (senhaNova !== confirmacao) {
    return { erro: "A confirmação não bate com a nova senha." };
  }

  if (!admin) {
    return { erro: "Conta inválida." };
  }

  const senhaAtualCorreta = await verificarSenha(senhaAtual, admin.senhaHash);
  if (!senhaAtualCorreta) {
    return { erro: "Senha atual incorreta." };
  }

  const senhaHash = await hashSenha(senhaNova);
  await prisma.admin.update({
    where: { id: adminId },
    data: { senhaHash, sessaoVersao: { increment: 1 } },
  });
  await criarSessaoAdmin(adminId);
  await registrarAuditoria({ ator: `admin:${adminId}`, acao: "admin.troca_senha" });
  return { sucesso: true };
}

export interface EstadoTotp {
  erro?: string;
  sucesso?: boolean;
  /** Segredo em base32 e URI otpauth, mostrados uma vez na ativação. */
  segredo?: string;
  uri?: string;
}

/** Passo 1 da ativação do 2FA: gera o segredo (ainda inativo) e o devolve. */
export async function iniciarAtivacaoTotp(): Promise<EstadoTotp> {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) return { erro: "Conta inválida." };
  if (admin.totpAtivo) return { erro: "O 2FA já está ativado." };

  const segredo = gerarSegredoTotp();
  await prisma.admin.update({
    where: { id: adminId },
    data: { totpSegredo: cifrarSegredo(segredo), totpUltimoPasso: null },
  });
  return { segredo, uri: uriOtpauth(segredo, admin.email, "Central de Atas") };
}

/** Passo 2: confirma com um código gerado pelo app e só então ativa o 2FA. */
export async function confirmarAtivacaoTotp(
  _estadoAnterior: EstadoTotp,
  formData: FormData,
): Promise<EstadoTotp> {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const codigo = String(formData.get("codigo") ?? "");
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin?.totpSegredo || admin.totpAtivo) {
    return { erro: "Comece a ativação de novo." };
  }

  const passo = verificarTotp(decifrarSegredo(admin.totpSegredo), codigo, null);
  if (passo === null) {
    return { erro: "Código inválido. Confira o horário do celular e tente de novo." };
  }

  await prisma.admin.update({
    where: { id: adminId },
    data: { totpAtivo: true, totpUltimoPasso: passo },
  });
  await registrarAuditoria({ ator: `admin:${adminId}`, acao: "admin.2fa_ativado" });
  revalidatePath("/admin/perfil");
  return { sucesso: true };
}

/** Desativa o 2FA — exige a senha atual e um código válido. */
export async function desativarTotp(
  _estadoAnterior: EstadoTotp,
  formData: FormData,
): Promise<EstadoTotp> {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const senha = String(formData.get("senha") ?? "");
  const codigo = String(formData.get("codigo") ?? "");
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin?.totpAtivo || !admin.totpSegredo) {
    return { erro: "O 2FA não está ativado." };
  }

  if (!(await verificarSenha(senha, admin.senhaHash))) {
    return { erro: "Senha incorreta." };
  }
  const passo = verificarTotp(decifrarSegredo(admin.totpSegredo), codigo, admin.totpUltimoPasso);
  if (passo === null) {
    return { erro: "Código inválido ou já utilizado." };
  }

  await prisma.admin.update({
    where: { id: adminId },
    data: { totpAtivo: false, totpSegredo: null, totpUltimoPasso: null },
  });
  await registrarAuditoria({ ator: `admin:${adminId}`, acao: "admin.2fa_desativado" });
  revalidatePath("/admin/perfil");
  return { sucesso: true };
}

/**
 * Exige admin logado e registra a ação na trilha de auditoria (quem, o quê,
 * quando e de que IP). Cada server action passa o próprio nome.
 */
async function exigirAdmin(acao: string): Promise<string> {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }
  await registrarAuditoria({ ator: `admin:${adminId}`, acao });
  return adminId;
}

export async function rejeitarAta(formData: FormData): Promise<void> {
  await exigirAdmin("admin.rejeitarAta");
  const ataId = String(formData.get("ataId") ?? "");
  if (!ataId) return;

  await prisma.ata.update({ where: { id: ataId }, data: { status: "REJEITADA" } });
  revalidatePath("/admin");
  revalidatePath("/catalogo");
}

/**
 * Gestão de usuários (2026-09-04) — desativar bloqueia login (checado em
 * loginFornecedor/loginOrgao), sem apagar nada: atas, adesões e
 * faturamento já existentes continuam intactos. Sessão já aberta no
 * momento da desativação não é revogada na hora — expira sozinha em até
 * 7 dias (mesma duração de qualquer sessão, ver src/lib/auth.ts).
 */
export async function alternarStatusFornecedor(formData: FormData): Promise<void> {
  await exigirAdmin("admin.alternarStatusFornecedor");
  const fornecedorId = String(formData.get("fornecedorId") ?? "");
  if (!fornecedorId) return;

  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: fornecedorId } });
  if (!fornecedor) return;

  await prisma.fornecedor.update({
    where: { id: fornecedorId },
    data: { ativo: !fornecedor.ativo },
  });
  revalidatePath("/admin/usuarios");
}

export interface EstadoCriarVendedor {
  erro?: string;
}

/** Cadastro de vendedor pelo admin (2026-10-01) — até aqui só existia via
 * seed; sem isso o time comercial não consegue crescer o time dentro do
 * sistema. Tipo (interno/externo) é obrigatório desde a criação. */
export async function criarVendedorAdmin(
  _estadoAnterior: EstadoCriarVendedor,
  formData: FormData,
): Promise<EstadoCriarVendedor> {
  await exigirAdmin("admin.criarVendedorAdmin");

  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const tipo = String(formData.get("tipo") ?? "").trim();

  if (!nome || !email) {
    return { erro: "Informe nome e e-mail." };
  }
  const erroSenha = validarSenhaNova(senha, email);
  if (erroSenha) {
    return { erro: erroSenha };
  }
  if (!tipoVendedorValido(tipo)) {
    return { erro: "Selecione um tipo de vendedor válido." };
  }

  const senhaHash = await hashSenha(senha);
  try {
    await prisma.vendedor.create({
      data: { nome, email, senhaHash, tipo },
    });
  } catch {
    return { erro: "Já existe um vendedor com esse e-mail." };
  }

  revalidatePath("/admin/usuarios");
  return {};
}

export async function alternarStatusVendedor(formData: FormData): Promise<void> {
  await exigirAdmin("admin.alternarStatusVendedor");
  const vendedorId = String(formData.get("vendedorId") ?? "");
  if (!vendedorId) return;

  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId } });
  if (!vendedor) return;

  await prisma.vendedor.update({
    where: { id: vendedorId },
    data: { ativo: !vendedor.ativo },
  });
  revalidatePath("/admin/usuarios");
}

/**
 * Tira um vendedor de uma ata (2026-10-01, ajustado em 2026-10-04 pra
 * negociação por município): expira as oportunidades ainda abertas desse
 * vendedor na ata (aderiu/recusado ficam — são histórico e recebível) e
 * libera os municípios pra novo pedido. Não apaga nada.
 */
export async function devolverAtaAoPool(formData: FormData): Promise<void> {
  await exigirAdmin("admin.devolverAtaAoPool");
  const ataId = String(formData.get("ataId") ?? "");
  const vendedorId = String(formData.get("vendedorId") ?? "");
  if (!ataId || !vendedorId) return;

  await prisma.oportunidadeVenda.updateMany({
    where: {
      ataId,
      vendedorId,
      expiradaEm: null,
      estagio: { in: ["a_contatar", "em_negociacao"] },
    },
    data: { expiradaEm: new Date() },
  });
  await expirarOportunidadesVencidas();
  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/negociacoes");
  revalidatePath("/vendedor");
}

/**
 * Decisão do admin sobre os pedidos de negociação de um vendedor numa ata
 * (2026-10-04): aprova ou nega os municípios marcados. Aprovar cria a
 * oportunidade (card do Kanban) com prazo de 10 dias — mas se outro
 * vendedor já negocia aquele município, o pedido é negado na hora (dois
 * vendedores na mesma ata só em municípios diferentes).
 */
export async function decidirPedidosNegociacao(formData: FormData): Promise<void> {
  await exigirAdmin("admin.decidirPedidosNegociacao");
  const ataId = String(formData.get("ataId") ?? "");
  const vendedorId = String(formData.get("vendedorId") ?? "");
  const decisao = String(formData.get("decisao") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  const pedidoIds = formData.getAll("pedidoId").map(String).filter(Boolean);
  if (!ataId || !vendedorId || pedidoIds.length === 0) return;
  if (decisao !== "aprovar" && decisao !== "negar") return;

  const agora = new Date();
  const pedidos = await prisma.pedidoNegociacao.findMany({
    where: { id: { in: pedidoIds }, ataId, vendedorId, status: "pendente" },
  });

  for (const pedido of pedidos) {
    if (decisao === "negar") {
      await prisma.pedidoNegociacao.update({
        where: { id: pedido.id },
        data: { status: "negado", motivo, decididoEm: agora },
      });
      continue;
    }

    const ativa = await prisma.oportunidadeVenda.findUnique({
      where: { ataId_entidadeAlvoId: { ataId, entidadeAlvoId: pedido.entidadeAlvoId } },
    });
    if (ativa && !ativa.expiradaEm && ativa.vendedorId !== vendedorId) {
      await prisma.pedidoNegociacao.update({
        where: { id: pedido.id },
        data: {
          status: "negado",
          motivo: "Município já está em negociação por outro vendedor.",
          decididoEm: agora,
        },
      });
      continue;
    }

    if (!ativa) {
      await prisma.oportunidadeVenda.create({
        data: {
          ataId,
          entidadeAlvoId: pedido.entidadeAlvoId,
          vendedorId,
          prazoEm: calcularPrazo(agora),
        },
      });
    } else if (ativa.expiradaEm) {
      // Reaproveita o card expirado (mesma ata+município): reinicia no
      // começo do funil, sem dados de adesão. A instrução da adesão (checklist
      // e declaração de conformidade) é do ciclo anterior, talvez de outro
      // vendedor: apaga junto, senão o novo vendedor herdaria a declaração e
      // passaria pela trava do estágio "aderiu" sem ter declarado nada.
      await prisma.$transaction([
        prisma.instrucaoAdesao.deleteMany({ where: { oportunidadeId: ativa.id } }),
        prisma.oportunidadeVenda.update({
          where: { id: ativa.id },
          data: {
            vendedorId,
            estagio: "a_contatar",
            expiradaEm: null,
            prazoEm: calcularPrazo(agora),
            valorAderido: null,
            percentualComissao: null,
          },
        }),
      ]);
    }
    await prisma.pedidoNegociacao.update({
      where: { id: pedido.id },
      data: { status: "aprovado", decididoEm: agora },
    });
  }

  if (decisao === "aprovar") {
    await prisma.ata.updateMany({ where: { id: ataId, vendedorId: null }, data: { vendedorId } });
  }

  revalidatePath("/admin/negociacoes");
  revalidatePath("/vendedor");
}

/** Canal de contato técnico do fornecedor (2026-10-01, pedido explícito):
 * o vendedor precisa conseguir falar com alguém técnico da empresa
 * vencedora da ata pra organizar a adesão com o ente, não só com o
 * município. Campo de contato simples, sem login próprio. */
export async function atualizarContatoTecnicoFornecedor(formData: FormData): Promise<void> {
  await exigirAdmin("admin.atualizarContatoTecnicoFornecedor");
  const fornecedorId = String(formData.get("fornecedorId") ?? "");
  if (!fornecedorId) return;

  const contatoTecnicoNome = String(formData.get("contatoTecnicoNome") ?? "").trim();
  const contatoTecnicoTelefone = String(formData.get("contatoTecnicoTelefone") ?? "").trim();
  const contatoTecnicoEmail = String(formData.get("contatoTecnicoEmail") ?? "").trim();

  await prisma.fornecedor.update({
    where: { id: fornecedorId },
    data: {
      contatoTecnicoNome: contatoTecnicoNome || null,
      contatoTecnicoTelefone: contatoTecnicoTelefone || null,
      contatoTecnicoEmail: contatoTecnicoEmail || null,
    },
  });
  revalidatePath("/admin/fornecedores");
}

export interface EstadoAnaliseAta {
  erro?: string;
  mensagem?: string;
  valores?: { respostas: RespostasConformidade; parecer: string };
}

/**
 * Análise de conformidade da ata (2026-10-04, SCP cl. 8): o gestor marca o
 * checklist, escreve o parecer e salva ou aprova. Itens desmarcados não
 * impedem a aprovação — exigem parecer justificando (aprovação com
 * ressalva); a decisão jurídica é do gestor, o sistema só alerta.
 */
export async function analisarAta(
  ataId: string,
  _estadoAnterior: EstadoAnaliseAta,
  formData: FormData,
): Promise<EstadoAnaliseAta> {
  await exigirAdmin("admin.analisarAta");
  const adminId = await adminIdLogado();

  const ata = await prisma.ata.findUnique({ where: { id: ataId } });
  if (!ata) return { erro: "Ata não encontrada." };

  const respostas = Object.fromEntries(
    ITENS_CONFORMIDADE.map((i) => [i.campo, formData.get(i.campo) === "on"]),
  ) as RespostasConformidade;
  const parecer = String(formData.get("parecer") ?? "").trim() || null;
  const valores = { respostas, parecer: parecer ?? "" };
  const decisao = String(formData.get("decisao") ?? "salvar");

  const pendentes = itensPendentes(respostas);
  if (decisao === "aprovar" && pendentes.length > 0 && !parecer) {
    return {
      erro: `Há ${pendentes.length} item(ns) do checklist não confirmado(s). Para aprovar com ressalva, escreva o parecer justificando.`,
      valores,
    };
  }

  const dados = { ...respostas, parecer, responsavelId: adminId };
  await prisma.conformidadeAta.upsert({
    where: { ataId },
    update: dados,
    create: { ataId, ...dados },
  });

  if (decisao === "aprovar") {
    await prisma.ata.update({ where: { id: ataId }, data: { status: "APROVADA" } });
  }

  revalidatePath(`/admin/atas/${ataId}/analise`);
  revalidatePath("/admin");
  revalidatePath("/catalogo");
  revalidatePath("/vendedor");
  return {
    mensagem:
      decisao === "aprovar"
        ? pendentes.length > 0
          ? "Ata aprovada com ressalva."
          : "Ata aprovada."
        : "Análise salva.",
  };
}

export interface EstadoContratoIntermediacao {
  erro?: string;
  sucesso?: boolean;
  /** Devolvido junto do erro: o React zera o formulário após a action, e isso repõe o que foi digitado. */
  valores?: { percentualComissao: string; dataAssinatura: string; vigenciaFim: string; observacoes: string };
}

/**
 * Contrato de intermediação da ata (2026-10-04, SCP cl. 4 / Projeto RNA
 * §2): o percentual de 3% a 15% é pactuado pelo admin com o fornecedor e
 * fica aqui — o vendedor não digita comissão. Um contrato por ata (upsert).
 */
export async function salvarContratoIntermediacao(
  ataId: string,
  _estadoAnterior: EstadoContratoIntermediacao,
  formData: FormData,
): Promise<EstadoContratoIntermediacao> {
  await exigirAdmin("admin.salvarContratoIntermediacao");

  const valores = {
    percentualComissao: String(formData.get("percentualComissao") ?? ""),
    dataAssinatura: String(formData.get("dataAssinatura") ?? ""),
    vigenciaFim: String(formData.get("vigenciaFim") ?? ""),
    observacoes: String(formData.get("observacoes") ?? ""),
  };

  const ata = await prisma.ata.findUnique({ where: { id: ataId } });
  if (!ata) return { erro: "Ata não encontrada.", valores };

  const percentual = interpretarPercentualComissao(String(formData.get("percentualComissao") ?? ""));
  if (!percentual.ok) return { erro: percentual.erro, valores };

  const dataAssinaturaTexto = String(formData.get("dataAssinatura") ?? "");
  if (!dataAssinaturaTexto) return { erro: "Informe a data de assinatura do contrato.", valores };
  const dataAssinatura = new Date(dataAssinaturaTexto);
  if (Number.isNaN(dataAssinatura.getTime())) return { erro: "Data de assinatura inválida.", valores };

  const vigenciaTexto = String(formData.get("vigenciaFim") ?? "");
  const vigenciaFim = vigenciaTexto ? new Date(vigenciaTexto) : null;
  if (vigenciaFim && (Number.isNaN(vigenciaFim.getTime()) || vigenciaFim < dataAssinatura)) {
    return { erro: "A vigência não pode terminar antes da assinatura.", valores };
  }

  const observacoes = String(formData.get("observacoes") ?? "").trim() || null;
  const dados = {
    percentualComissao: percentual.fracao,
    dataAssinatura,
    vigenciaFim,
    observacoes,
  };

  await prisma.contratoIntermediacao.upsert({
    where: { ataId },
    update: dados,
    create: { ataId, ...dados },
  });

  revalidatePath(`/admin/atas/${ataId}/contrato`);
  revalidatePath("/vendedor");
  return { sucesso: true };
}

export async function alternarStatusOrgao(formData: FormData): Promise<void> {
  await exigirAdmin("admin.alternarStatusOrgao");
  const orgaoId = String(formData.get("orgaoId") ?? "");
  if (!orgaoId) return;

  const orgao = await prisma.orgao.findUnique({ where: { id: orgaoId } });
  if (!orgao) return;

  await prisma.orgao.update({
    where: { id: orgaoId },
    data: { ativo: !orgao.ativo },
  });
  revalidatePath("/admin/usuarios");
}

export interface EstadoMarcarFaturamento {
  erro?: string;
}

export async function marcarFaturamentoComoPago(
  _estadoAnterior: EstadoMarcarFaturamento,
  formData: FormData,
): Promise<EstadoMarcarFaturamento> {
  await exigirAdmin("admin.marcarFaturamentoComoPago");
  const faturamentoId = String(formData.get("faturamentoId") ?? "");
  if (!faturamentoId) return { erro: "Registro inválido." };

  try {
    await prisma.faturamento.update({
      where: { id: faturamentoId },
      data: { pago: true, pagoEm: new Date() },
    });
  } catch {
    return { erro: "Não foi possível marcar como recebido. Tente de novo." };
  }
  revalidatePath("/admin/faturamento");
  revalidatePath("/admin");
  return {};
}

export interface EstadoEntidadeAlvo {
  erro?: string;
}

/**
 * Reorganizado em 2026-09-05: o trabalho de venda é humano, não
 * automatizado ("de formiguinha") — o sistema só é o banco de dados e o
 * CRM que sustenta isso. Uma entidade alvo (prefeitura, secretaria
 * estadual, ministério) é o "lugar"; os contatos dela (PontoFocal) são as
 * pessoas dentro dela — prefeito, cada secretário, intermediário.
 */
export async function criarEntidadeAlvo(
  _estadoAnterior: EstadoEntidadeAlvo,
  formData: FormData,
): Promise<EstadoEntidadeAlvo> {
  await exigirAdmin("admin.criarEntidadeAlvo");

  const nome = String(formData.get("nome") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "").trim();
  const esfera = String(formData.get("esfera") ?? "").trim();
  const uf = String(formData.get("uf") ?? "").trim();
  const municipio = String(formData.get("municipio") ?? "").trim();
  const endereco = String(formData.get("endereco") ?? "").trim();

  if (!nome || !tipoEntidadeAlvoValido(tipo)) {
    return { erro: "Informe o nome e selecione um tipo válido." };
  }
  if (esfera && !esferaValida(esfera)) {
    return { erro: "Esfera inválida." };
  }

  await prisma.entidadeAlvo.create({
    data: {
      nome,
      tipo,
      esfera: esfera || null,
      uf: uf || null,
      municipio: municipio || null,
      endereco: endereco || null,
    },
  });

  revalidatePath("/admin/entidades");
  return {};
}

export async function alternarStatusEntidadeAlvo(formData: FormData): Promise<void> {
  await exigirAdmin("admin.alternarStatusEntidadeAlvo");
  const entidadeAlvoId = String(formData.get("entidadeAlvoId") ?? "");
  if (!entidadeAlvoId) return;

  const entidade = await prisma.entidadeAlvo.findUnique({ where: { id: entidadeAlvoId } });
  if (!entidade) return;

  await prisma.entidadeAlvo.update({
    where: { id: entidadeAlvoId },
    data: { ativo: !entidade.ativo },
  });
  revalidatePath("/admin/entidades");
  revalidatePath(`/admin/entidades/${entidadeAlvoId}`);
}

export interface EstadoPontoFocal {
  erro?: string;
}

/** Contato (pessoa) dentro de uma entidade alvo — prefeito, secretário de
 * uma pasta específica, intermediário. */
export async function criarPontoFocal(
  _estadoAnterior: EstadoPontoFocal,
  formData: FormData,
): Promise<EstadoPontoFocal> {
  await exigirAdmin("admin.criarPontoFocal");

  const entidadeAlvoId = String(formData.get("entidadeAlvoId") ?? "").trim();
  const cargo = String(formData.get("cargo") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const nomeContato = String(formData.get("nomeContato") ?? "").trim();
  const telefone = String(formData.get("telefone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const particularidades = String(formData.get("particularidades") ?? "").trim();

  if (!entidadeAlvoId || !cargo || !nomeContato) {
    return { erro: "Informe ao menos o cargo e o nome do contato." };
  }

  await prisma.pontoFocal.create({
    data: {
      entidadeAlvoId,
      cargo,
      area: area || null,
      nomeContato,
      telefone: telefone || null,
      email: email || null,
      particularidades: particularidades || null,
    },
  });

  revalidatePath(`/admin/entidades/${entidadeAlvoId}`);
  return {};
}

export async function alternarStatusPontoFocal(formData: FormData): Promise<void> {
  await exigirAdmin("admin.alternarStatusPontoFocal");
  const pontoFocalId = String(formData.get("pontoFocalId") ?? "");
  if (!pontoFocalId) return;

  const pontoFocal = await prisma.pontoFocal.findUnique({ where: { id: pontoFocalId } });
  if (!pontoFocal) return;

  await prisma.pontoFocal.update({
    where: { id: pontoFocalId },
    data: { ativo: !pontoFocal.ativo },
  });
  revalidatePath(`/admin/entidades/${pontoFocal.entidadeAlvoId}`);
}

export interface EstadoInteracaoPontoFocal {
  erro?: string;
}

/** Registra o histórico de match descrito no mapa: qual ata foi oferecida
 * a este ponto focal e o que resultou — é o sinal que refina capilaridade
 * com o tempo. */
export async function registrarInteracaoPontoFocal(
  _estadoAnterior: EstadoInteracaoPontoFocal,
  formData: FormData,
): Promise<EstadoInteracaoPontoFocal> {
  await exigirAdmin("admin.registrarInteracaoPontoFocal");

  const pontoFocalId = String(formData.get("pontoFocalId") ?? "");
  const ataId = String(formData.get("ataId") ?? "").trim();
  const resultado = String(formData.get("resultado") ?? "").trim();
  const observacao = String(formData.get("observacao") ?? "").trim();

  if (!pontoFocalId || !resultadoInteracaoValido(resultado)) {
    return { erro: "Selecione um resultado válido." };
  }

  const pontoFocal = await prisma.pontoFocal.findUnique({ where: { id: pontoFocalId } });
  if (!pontoFocal) {
    return { erro: "Contato inválido." };
  }

  await prisma.interacaoPontoFocal.create({
    data: {
      pontoFocalId,
      ataId: ataId || null,
      resultado,
      observacao: observacao || null,
    },
  });

  revalidatePath(`/admin/entidades/${pontoFocal.entidadeAlvoId}/contatos/${pontoFocalId}`);
  return {};
}

export interface EstadoParceiro {
  erro?: string;
}

/** "Os 30 parceiros" das notas de voz — quem revende/comercializa atas
 * junto com a Tech 10, organizado por categoria e UF de interesse. */
export async function criarParceiro(
  _estadoAnterior: EstadoParceiro,
  formData: FormData,
): Promise<EstadoParceiro> {
  await exigirAdmin("admin.criarParceiro");

  const nome = String(formData.get("nome") ?? "").trim();
  const contato = String(formData.get("contato") ?? "").trim();
  const categoriasInteresse = formData.getAll("categoriasInteresse").map(String);
  const ufsInteresse = String(formData.get("ufsInteresse") ?? "")
    .split(",")
    .map((uf) => uf.trim().toUpperCase())
    .filter(Boolean);

  if (!nome || !contato) {
    return { erro: "Informe nome e contato do parceiro." };
  }

  await prisma.parceiro.create({
    data: { nome, contato, categoriasInteresse, ufsInteresse },
  });

  revalidatePath("/admin/parceiros");
  return {};
}

export async function alternarStatusParceiro(formData: FormData): Promise<void> {
  await exigirAdmin("admin.alternarStatusParceiro");
  const parceiroId = String(formData.get("parceiroId") ?? "");
  if (!parceiroId) return;

  const parceiro = await prisma.parceiro.findUnique({ where: { id: parceiroId } });
  if (!parceiro) return;

  await prisma.parceiro.update({
    where: { id: parceiroId },
    data: { ativo: !parceiro.ativo },
  });
  revalidatePath("/admin/parceiros");
}

export async function marcarFaturamentoComoPendente(
  _estadoAnterior: EstadoMarcarFaturamento,
  formData: FormData,
): Promise<EstadoMarcarFaturamento> {
  await exigirAdmin("admin.marcarFaturamentoComoPendente");
  const faturamentoId = String(formData.get("faturamentoId") ?? "");
  if (!faturamentoId) return { erro: "Registro inválido." };

  try {
    await prisma.faturamento.update({
      where: { id: faturamentoId },
      data: { pago: false, pagoEm: null },
    });
  } catch {
    return { erro: "Não foi possível marcar como pendente. Tente de novo." };
  }
  revalidatePath("/admin/faturamento");
  revalidatePath("/admin");
  return {};
}

export interface EstadoLancarLiquidacao {
  erro?: string;
}

/**
 * Controle de recebíveis (2026-10-01, pedido explícito): "temos x% desses
 * 50mi para receber após a liquidação da nota fiscal por esse município,
 * seja o valor de 50mi ou menos". Cada liquidação é um lançamento de NF —
 * pode ter várias parciais pra uma mesma oportunidade. O valor a receber
 * nunca é calculado sobre o valor aderido (que é só o teto), sempre sobre
 * a soma do que foi liquidado de verdade.
 */
export async function lancarLiquidacao(
  oportunidadeId: string,
  _estadoAnterior: EstadoLancarLiquidacao,
  formData: FormData,
): Promise<EstadoLancarLiquidacao> {
  const adminId = await exigirAdmin("admin.lancarLiquidacao");

  const valorBruto = String(formData.get("valorLiquidado") ?? "").trim();
  const numeroNotaFiscal = String(formData.get("numeroNotaFiscal") ?? "").trim();
  const dataLiquidacao = String(formData.get("dataLiquidacao") ?? "");
  const dataPagamentoEnteBruta = String(formData.get("dataPagamentoEnte") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "original");
  const valorNumero = Number(valorBruto.replace(",", "."));

  if (!tipoLiquidacaoValido(tipo)) return { erro: "Tipo de liquidação inválido." };
  if (!valorBruto || !Number.isFinite(valorNumero) || valorNumero <= 0 || !dataLiquidacao) {
    return { erro: "Informe um valor liquidado válido e a data." };
  }
  // A coluna é Decimal(14,2): abaixo de 1 centavo viraria R$ 0,00 e acima do
  // teto estouraria o banco (erro 500 em vez de mensagem na tela).
  if (valorNumero < 0.01 || valorNumero > 999_999_999_999.99) {
    return { erro: "Valor liquidado fora do intervalo aceito (de R$ 0,01 a R$ 999.999.999.999,99)." };
  }
  // Só AAAA-MM-DD à meia-noite UTC: `new Date(texto)` aceitaria "2026-02-30"
  // (viraria 02/03) e textos com hora/fuso, mudando o dia gravado.
  const dataLiquidacaoLida = interpretarDataLiquidacao(dataLiquidacao);
  if (!dataLiquidacaoLida.ok) return { erro: dataLiquidacaoLida.erro };
  const dataLiquidacaoDia = dataLiquidacaoLida.data;

  // Opcional: sem a data, a liquidação entra como "aguardando pagamento do
  // ente" e a comissão só pode ser cobrada depois que o gestor a informar.
  let dataPagamentoEnte: Date | null = null;
  if (dataPagamentoEnteBruta) {
    const lida = interpretarDataPagamentoEnte(dataPagamentoEnteBruta);
    if (!lida.ok) return { erro: lida.erro };
    dataPagamentoEnte = lida.data;
  }

  const oportunidade = await prisma.oportunidadeVenda.findUnique({ where: { id: oportunidadeId } });
  if (!oportunidade || oportunidade.estagio !== "aderiu") {
    return { erro: "Esta oportunidade não está marcada como aderida." };
  }

  const criada = await prisma.liquidacao.create({
    data: {
      oportunidadeId,
      valorLiquidado: String(valorNumero),
      tipo,
      numeroNotaFiscal: numeroNotaFiscal || null,
      dataLiquidacao: dataLiquidacaoDia,
      dataPagamentoEnte,
    },
  });
  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.liquidacao_lancada",
    alvo: `liquidacao:${criada.id}`,
    detalhe: `Oportunidade ${oportunidadeId}, valor ${valorNumero.toFixed(2)}, tipo ${tipo}, pagamento do ente ${
      dataPagamentoEnte ? dataPagamentoEnte.toISOString().slice(0, 10) : "não informado"
    }.`,
  });

  revalidatePath("/admin/recebiveis-vendedores");
  revalidatePath("/admin");
  return {};
}

export interface EstadoPagamentoEnteLiquidacao {
  erro?: string;
  ok?: boolean;
}

/**
 * Data em que o ente público pagou o fornecedor (2026-10-21, honorários do
 * Projeto RNA): é o que libera a cobrança da comissão. Serve para informar a
 * data de uma liquidação lançada sem ela (inclusive as anteriores a esta
 * regra) e para corrigir uma data digitada errada. Não há como apagar a data:
 * uma comissão já liberada não volta a "aguardando" por engano.
 */
export async function informarPagamentoEnteLiquidacao(
  liquidacaoId: string,
  _estadoAnterior: EstadoPagamentoEnteLiquidacao,
  formData: FormData,
): Promise<EstadoPagamentoEnteLiquidacao> {
  const adminId = await exigirAdmin("admin.informarPagamentoEnteLiquidacao");

  const lida = interpretarDataPagamentoEnte(String(formData.get("dataPagamentoEnte") ?? ""));
  if (!lida.ok) return { erro: lida.erro };

  const liquidacao = await prisma.liquidacao.findUnique({ where: { id: liquidacaoId } });
  if (!liquidacao) return { erro: "Liquidação não encontrada." };

  await prisma.liquidacao.update({
    where: { id: liquidacaoId },
    data: { dataPagamentoEnte: lida.data },
  });
  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.liquidacao_pagamento_ente_informado",
    alvo: `liquidacao:${liquidacaoId}`,
    detalhe: `Pagamento do ente: ${lida.data.toISOString().slice(0, 10)} (antes: ${
      liquidacao.dataPagamentoEnte ? liquidacao.dataPagamentoEnte.toISOString().slice(0, 10) : "não informado"
    }).`,
  });

  revalidatePath("/admin/recebiveis-vendedores");
  revalidatePath("/admin");
  return { ok: true };
}

export interface EstadoCobrancaLiquidacao {
  erro?: string;
}

/**
 * Cobrança da comissão por liquidação (2026-10-04, SCP cl. 4): a sócia
 * ostensiva emite a nota fiscal de serviço ao fornecedor depois da
 * liquidação do empenho. Fluxo: A cobrar → Cobrada → Recebida; cobrada e
 * recebida exigem o número da nota fiscal da comissão.
 *
 * Honorários do Projeto RNA (2026-10-21): a comissão só vence depois que o
 * ente liquidou E pagou o fornecedor. Sair de "a cobrar" para cobrada ou
 * recebida é recusado enquanto a liquidação não tiver a data de pagamento
 * do ente (`dataPagamentoEnte`).
 */
export async function atualizarCobrancaLiquidacao(
  liquidacaoId: string,
  _estadoAnterior: EstadoCobrancaLiquidacao,
  formData: FormData,
): Promise<EstadoCobrancaLiquidacao> {
  const adminId = await exigirAdmin("admin.atualizarCobrancaLiquidacao");

  const statusCobranca = String(formData.get("statusCobranca") ?? "");
  const notaFiscalComissao = String(formData.get("notaFiscalComissao") ?? "").trim() || null;
  if (!statusCobrancaValido(statusCobranca)) return { erro: "Status de cobrança inválido." };

  const liquidacao = await prisma.liquidacao.findUnique({ where: { id: liquidacaoId } });
  if (!liquidacao) return { erro: "Liquidação não encontrada." };

  const recusa = motivoParaRecusarCobranca(liquidacao, statusCobranca);
  if (recusa) return { erro: recusa };
  if (statusCobranca !== "pendente" && !notaFiscalComissao) {
    return { erro: "Informe o número da nota fiscal da comissão para marcar como cobrada ou recebida." };
  }

  const agora = new Date();
  await prisma.liquidacao.update({
    where: { id: liquidacaoId },
    data: {
      statusCobranca,
      notaFiscalComissao: statusCobranca === "pendente" ? null : notaFiscalComissao,
      dataCobranca:
        statusCobranca === "pendente" ? null : (liquidacao.dataCobranca ?? agora),
      dataRecebimento: statusCobranca === "recebida" ? (liquidacao.dataRecebimento ?? agora) : null,
    },
  });
  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.liquidacao_cobranca_alterada",
    alvo: `liquidacao:${liquidacaoId}`,
    detalhe: `Cobrança: ${liquidacao.statusCobranca} → ${statusCobranca}.`,
  });

  revalidatePath("/admin/recebiveis-vendedores");
  revalidatePath("/admin");
  return {};
}

export interface EstadoRaioXConsumo {
  erro?: string;
}

/**
 * Raio-X de consumo (2026-09-25) — busca no PNCP, sob demanda (um
 * município de cada vez, nunca em lote pros 1000+), o histórico de
 * contratos dos últimos 3 anos e classifica por categoria. Substitui o
 * snapshot anterior inteiro pra essa entidade — não acumula histórico de
 * execuções, sempre reflete a consulta mais recente.
 */
export async function atualizarRaioXConsumo(
  _estadoAnterior: EstadoRaioXConsumo,
  formData: FormData,
): Promise<EstadoRaioXConsumo> {
  await exigirAdmin("admin.atualizarRaioXConsumo");

  const entidadeAlvoId = String(formData.get("entidadeAlvoId") ?? "");
  const entidade = await prisma.entidadeAlvo.findUnique({ where: { id: entidadeAlvoId } });
  if (!entidade) {
    return { erro: "Entidade inválida." };
  }
  if (!entidade.cnpj) {
    return {
      erro: "Esta entidade não tem CNPJ cadastrado — sem CNPJ não dá pra consultar o histórico no PNCP.",
    };
  }

  const resultado = await calcularRaioXConsumo(entidade.cnpj);
  if (resultado.erro) {
    return { erro: `Não foi possível consultar o PNCP: ${resultado.erro}` };
  }

  await prisma.$transaction([
    prisma.historicoConsumoCategoria.deleteMany({ where: { entidadeAlvoId } }),
    prisma.historicoConsumoCategoria.createMany({
      data: resultado.categoriasIdentificadas.map((c) => ({
        entidadeAlvoId,
        categoria: c.categoria,
        ultimaContratacao: c.ultimaContratacao,
        valorUltimaContratacao: c.valorUltimaContratacao,
        quantidadeContratosNaJanela: c.quantidadeContratosNaJanela,
        objetoUltimaContratacao: c.objetoUltimaContratacao.slice(0, 2000),
      })),
    }),
    // Marca que rodou agora mesmo quando não achou nenhuma categoria —
    // sem isso, "zero categoria" parece indistinguível de "nunca rodou".
    prisma.entidadeAlvo.update({
      where: { id: entidadeAlvoId },
      data: { raioXAtualizadoEm: new Date() },
    }),
  ]);

  revalidatePath(`/admin/entidades/${entidadeAlvoId}`);
  return {};
}

/**
 * Classificar/reclassificar a categoria de uma ata (2026-09-26) — muitas
 * atas entram sem categoria (toda importação do PNCP/Compras.gov.br, e o
 * cadastro antigo em `/atas/nova`, hoje desativado): sem isso não dá pra
 * cruzar "temos uma ata de gráfica — qual município precisa dela?" no
 * raio-X de consumo. Reaproveita o mesmo vocabulário de categoria do
 * raio-X (src/lib/categorias.ts), então uma ata classificada aqui já
 * casa direto com `HistoricoConsumoCategoria.categoria`.
 */
export async function definirCategoriaAta(formData: FormData): Promise<void> {
  await exigirAdmin("admin.definirCategoriaAta");
  const ataId = String(formData.get("ataId") ?? "");
  const categoria = String(formData.get("categoria") ?? "").trim();
  if (!ataId) return;

  await prisma.ata.update({
    where: { id: ataId },
    data: { categoria: categoria || null },
  });
  revalidatePath("/atas");
  revalidatePath(`/admin/atas/${ataId}/municipios`);
}

export interface EstadoCadastroAtaAdmin {
  erro?: string;
}

const TAMANHO_MAXIMO_DOCUMENTO_BYTES_ADMIN = 10 * 1024 * 1024;
const TIPOS_MIME_DOCUMENTO_ACEITOS_ADMIN = ["application/pdf", "image/jpeg", "image/png"];

/**
 * Cadastro de ata pelo admin (2026-09-26) — decisão de negócio: o
 * fornecedor não cadastra mais a própria ata, quem cadastra agora é a
 * Tech 10, manualmente. Mesma lógica de `cadastrarAtaComoFornecedor`
 * (src/app/fornecedor/atas/actions.ts, pausada), só que o fornecedor
 * também vem do formulário (upsert por CNPJ) em vez de vir da sessão.
 */
export async function cadastrarAtaComoAdmin(
  _estadoAnterior: EstadoCadastroAtaAdmin,
  formData: FormData,
): Promise<EstadoCadastroAtaAdmin> {
  await exigirAdmin("admin.cadastrarAtaComoAdmin");

  const fornecedorNome = String(formData.get("fornecedorNome") ?? "").trim();
  const fornecedorCnpj = String(formData.get("fornecedorCnpj") ?? "").trim();
  const fornecedorEmail = String(formData.get("fornecedorEmail") ?? "").trim();

  const orgaoNome = String(formData.get("orgaoNome") ?? "").trim();
  const orgaoCnpj = String(formData.get("orgaoCnpj") ?? "").trim();
  const orgaoUf = String(formData.get("orgaoUf") ?? "").trim().toUpperCase();
  const orgaoMunicipio = String(formData.get("orgaoMunicipio") ?? "").trim();
  const orgaoEsfera = String(formData.get("orgaoEsfera") ?? "").trim();

  const numero = String(formData.get("numero") ?? "").trim();
  const objeto = String(formData.get("objeto") ?? "").trim();
  const ataCategoria = String(formData.get("ataCategoria") ?? "").trim();
  const tituloPublico = String(formData.get("tituloPublico") ?? "").trim();
  const erroTitulo = validarTituloPublico(tituloPublico);
  if (erroTitulo) {
    return { erro: erroTitulo };
  }
  const dataAssinatura = String(formData.get("dataAssinatura") ?? "");
  const dataVigenciaFim = String(formData.get("dataVigenciaFim") ?? "");
  const origemBruta = String(formData.get("origem") ?? "MANUAL").trim();
  const origem = origemBruta === "CIABC" ? "CIABC" : "MANUAL";

  const itensDescricao = formData.getAll("itemDescricao[]").map((v) => String(v).trim());
  const itensCategoria = formData.getAll("itemCategoria[]").map((v) => String(v).trim());
  const itensUnidade = formData.getAll("itemUnidade[]").map((v) => String(v).trim());
  const itensQuantidade = formData.getAll("itemQuantidade[]").map((v) => Number(v));
  const itensValorUnitario = formData.getAll("itemValorUnitario[]").map((v) => String(v).trim());

  if (
    !fornecedorNome ||
    !fornecedorCnpj ||
    !fornecedorEmail ||
    !orgaoNome ||
    !orgaoCnpj ||
    !orgaoUf ||
    !orgaoMunicipio ||
    !orgaoEsfera ||
    !esferaValida(orgaoEsfera) ||
    !numero ||
    !objeto ||
    !ataCategoria ||
    !CATEGORIAS_ATAS.some((c) => c.slug === ataCategoria) ||
    !dataAssinatura ||
    !dataVigenciaFim ||
    itensDescricao.length === 0
  ) {
    return { erro: "Preencha todos os campos obrigatórios com valores válidos." };
  }

  const contagensIguais =
    itensDescricao.length === itensCategoria.length &&
    itensDescricao.length === itensUnidade.length &&
    itensDescricao.length === itensQuantidade.length &&
    itensDescricao.length === itensValorUnitario.length;

  const todosItensValidos =
    contagensIguais &&
    itensDescricao.every((d, i) => {
      return (
        d &&
        itensCategoria[i] &&
        itensUnidade[i] &&
        itensValorUnitario[i] &&
        Number.isFinite(itensQuantidade[i]) &&
        itensQuantidade[i] > 0
      );
    });

  if (!todosItensValidos) {
    return { erro: "Preencha todos os campos obrigatórios de cada item com valores válidos." };
  }

  const documento = formData.get("documento");
  const temDocumento = documento instanceof File && documento.size > 0;

  if (temDocumento) {
    if (documento.size > TAMANHO_MAXIMO_DOCUMENTO_BYTES_ADMIN) {
      return { erro: "O documento não pode passar de 10MB." };
    }
    if (!TIPOS_MIME_DOCUMENTO_ACEITOS_ADMIN.includes(documento.type)) {
      return { erro: "Envie o documento em PDF, JPEG ou PNG." };
    }
    // O tipo declarado pelo navegador não prova nada: confere os primeiros bytes.
    if (!detectarTipoDocumento(Buffer.from(await documento.arrayBuffer()))) {
      return { erro: "O arquivo enviado não é um PDF, JPEG ou PNG válido." };
    }
  }

  const fornecedor = await prisma.fornecedor.upsert({
    where: { cnpj: fornecedorCnpj },
    update: { razaoSocial: fornecedorNome, email: fornecedorEmail },
    create: { razaoSocial: fornecedorNome, cnpj: fornecedorCnpj, email: fornecedorEmail },
  });

  const orgaoGerenciador = await prisma.orgao.upsert({
    where: { cnpj: orgaoCnpj },
    update: { nome: orgaoNome, uf: orgaoUf, municipio: orgaoMunicipio, esfera: orgaoEsfera },
    create: { nome: orgaoNome, cnpj: orgaoCnpj, uf: orgaoUf, municipio: orgaoMunicipio, esfera: orgaoEsfera },
  });

  const conteudoDocumento = temDocumento ? Buffer.from(await documento.arrayBuffer()) : null;
  const tipoMimeDocumento =
    (conteudoDocumento && detectarTipoDocumento(conteudoDocumento)) || "application/octet-stream";

  let ataId: string;
  try {
    const ata = await prisma.ata.create({
      data: {
        numero,
        objeto,
        categoria: ataCategoria,
        tituloPublico: tituloPublico || null,
        origem,
        dataAssinatura: new Date(dataAssinatura),
        dataVigenciaFim: new Date(dataVigenciaFim),
        fornecedorId: fornecedor.id,
        orgaoGerenciadorId: orgaoGerenciador.id,
        itens: {
          create: itensDescricao.map((descricao, i) => ({
            descricao,
            categoria: itensCategoria[i],
            unidade: itensUnidade[i],
            quantidadeRegistrada: itensQuantidade[i],
            valorUnitario: itensValorUnitario[i],
            saldo: { create: {} },
          })),
        },
        ...(temDocumento
          ? {
              documentos: {
                create: {
                  nomeArquivo: nomeArquivoSeguro(documento.name),
                  tipoMime: tipoMimeDocumento,
                  tamanhoBytes: documento.size,
                  conteudo: conteudoDocumento!,
                },
              },
            }
          : {}),
      },
    });
    ataId = ata.id;
  } catch {
    return { erro: "Já existe uma ata com esse número para esse órgão gerenciador." };
  }

  revalidatePath("/atas");
  redirect(`/atas?ataCriada=${ataId}`);
}

/**
 * Revisão de contatos marcados como errados (fase 2 de design, 2026-10-05):
 * o admin confirma que o contato está certo (limpa a marca e registra a
 * verificação). Corrigir o dado é pela tela de edição do contato; desativar
 * é alternarStatusPontoFocal.
 */
export async function confirmarContatoAdmin(formData: FormData): Promise<void> {
  await exigirAdmin("admin.confirmarContatoAdmin");
  const pontoFocalId = String(formData.get("pontoFocalId") ?? "");
  if (!pontoFocalId) return;

  await prisma.pontoFocal.update({
    where: { id: pontoFocalId },
    data: { verificadoEm: new Date(), contatoErradoEm: null, contatoErradoPorId: null, contatoErradoMotivo: null },
  });
  revalidatePath("/admin/contatos-revisao");
}

export interface EstadoSinalMunicipio {
  erro?: string;
  ok?: boolean;
  /** Devolvido junto do erro: o React zera o formulário após a action, e isso repõe o que foi digitado. */
  valores?: Record<string, string>;
}

function lerData(texto: string): Date | null {
  if (!texto) return null;
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Sinal de compra de um município (PCA, licitação aberta, contrato a vencer,
 * troca de gestão…) — vira o "por que agora" do card do vendedor. Sempre com
 * fonte e data; categoria opcional (vazio = vale pra qualquer ata).
 */
export async function criarSinalMunicipio(
  entidadeAlvoId: string,
  _estadoAnterior: EstadoSinalMunicipio,
  formData: FormData,
): Promise<EstadoSinalMunicipio> {
  await exigirAdmin("admin.criarSinalMunicipio");

  const valores: Record<string, string> = {
    tipo: String(formData.get("tipo") ?? ""),
    titulo: String(formData.get("titulo") ?? ""),
    detalhe: String(formData.get("detalhe") ?? ""),
    fonte: String(formData.get("fonte") ?? ""),
    fonteUrl: String(formData.get("fonteUrl") ?? ""),
    categoria: String(formData.get("categoria") ?? ""),
    valorEstimado: String(formData.get("valorEstimado") ?? ""),
    dataSinal: String(formData.get("dataSinal") ?? ""),
    expiraEm: String(formData.get("expiraEm") ?? ""),
  };

  const tipo = String(formData.get("tipo") ?? "");
  const titulo = String(formData.get("titulo") ?? "").trim();
  const detalhe = String(formData.get("detalhe") ?? "").trim() || null;
  const fonte = String(formData.get("fonte") ?? "").trim();
  const fonteUrl = String(formData.get("fonteUrl") ?? "").trim() || null;
  const categoria = String(formData.get("categoria") ?? "").trim() || null;
  const valorTexto = String(formData.get("valorEstimado") ?? "").trim().replace(",", ".");
  const dataSinal = lerData(String(formData.get("dataSinal") ?? ""));
  const expiraTexto = String(formData.get("expiraEm") ?? "");
  const expiraEm = lerData(expiraTexto);

  if (!tipoSinalValido(tipo)) return { erro: "Escolha o tipo do sinal.", valores };
  if (!titulo) return { erro: "Informe o título do sinal.", valores };
  if (!fonte) return { erro: "Informe a fonte (sem fonte o vendedor não confia no dado).", valores };
  if (!dataSinal) return { erro: "Informe a data do sinal.", valores };
  if (expiraTexto && !expiraEm) return { erro: "Data de expiração inválida.", valores };
  if (categoria && !CATEGORIAS_ATAS.some((c) => c.slug === categoria)) return { erro: "Categoria inválida.", valores };
  if (fonteUrl && !/^https?:\/\//i.test(fonteUrl)) return { erro: "O link da fonte deve começar com http:// ou https://.", valores };
  const valorNumero = valorTexto ? Number(valorTexto) : null;
  if (valorTexto && (!Number.isFinite(valorNumero) || (valorNumero ?? 0) < 0)) {
    return { erro: "Valor estimado inválido.", valores };
  }

  const entidade = await prisma.entidadeAlvo.findUnique({ where: { id: entidadeAlvoId } });
  if (!entidade) return { erro: "Município não encontrado.", valores };

  await prisma.sinalMunicipio.create({
    data: {
      entidadeAlvoId,
      tipo,
      titulo,
      detalhe,
      fonte,
      fonteUrl,
      categoria,
      valorEstimado: valorNumero != null ? String(valorNumero) : null,
      dataSinal,
      expiraEm,
    },
  });

  revalidatePath(`/admin/entidades/${entidadeAlvoId}`);
  revalidatePath("/vendedor");
  return { ok: true };
}

export async function removerSinalMunicipio(formData: FormData): Promise<void> {
  await exigirAdmin("admin.removerSinalMunicipio");
  const sinalId = String(formData.get("sinalId") ?? "");
  if (!sinalId) return;

  const sinal = await prisma.sinalMunicipio.findUnique({ where: { id: sinalId } });
  if (!sinal) return;
  await prisma.sinalMunicipio.delete({ where: { id: sinalId } });
  revalidatePath(`/admin/entidades/${sinal.entidadeAlvoId}`);
  revalidatePath("/vendedor");
}

/**
 * Fila "Não achei a ata" (2026-10-20): muda o andamento de uma demanda vinda
 * do formulário público e guarda uma nota interna da equipe.
 */
export async function atualizarDemanda(formData: FormData): Promise<void> {
  await exigirAdmin("admin.atualizarDemanda");
  const demandaId = String(formData.get("demandaId") ?? "");
  const status = String(formData.get("status") ?? "");
  const nota = String(formData.get("notaInterna") ?? "").trim().slice(0, 2000);
  if (!demandaId || !statusDemandaValido(status)) return;

  await prisma.demandaSemAta.update({
    where: { id: demandaId },
    data: {
      status,
      notaInterna: nota || null,
      atendidaEm: status === "respondida" || status === "descartada" ? new Date() : null,
    },
  });
  revalidatePath("/admin/demandas");
}

export interface EstadoTituloPublico {
  erro?: string;
  sucesso?: boolean;
}

/**
 * Título público da ata (2026-10-20): o único nome que visitante e órgão veem no
 * site. Genérico de propósito (ex.: "Ata de material de limpeza"). Vazio = o site
 * gera "Ata de <categoria>". O objeto original nunca sai para o público.
 */
export async function definirTituloPublicoAta(
  _estadoAnterior: EstadoTituloPublico,
  formData: FormData,
): Promise<EstadoTituloPublico> {
  await exigirAdmin("admin.definirTituloPublicoAta");
  const ataId = String(formData.get("ataId") ?? "");
  const titulo = String(formData.get("tituloPublico") ?? "").trim();
  if (!ataId) return { erro: "Ata inválida." };

  const erro = validarTituloPublico(titulo);
  if (erro) return { erro };

  await prisma.ata.update({ where: { id: ataId }, data: { tituloPublico: titulo || null } });
  revalidatePath("/atas");
  revalidatePath(`/admin/atas/${ataId}/municipios`);
  revalidatePath(`/catalogo/${ataId}`);
  return { sucesso: true };
}
