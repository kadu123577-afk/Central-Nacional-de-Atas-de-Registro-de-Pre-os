"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  adminIdLogado,
  criarSessaoAdmin,
  encerrarSessaoAdmin,
  hashSenha,
  verificarSenha,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { EstadoTrocarSenha } from "@/components/ui/formulario-trocar-senha";
import { esferaValida } from "@/lib/esferas";
import { resultadoInteracaoValido } from "@/lib/pontos-focais";
import { tipoEntidadeAlvoValido } from "@/lib/entidades-alvo";
import { calcularRaioXConsumo } from "@/lib/raio-x-consumo";
import { CATEGORIAS_ATAS } from "@/lib/categorias";

export interface EstadoLoginAdmin {
  erro?: string;
}

export async function loginAdmin(
  _estadoAnterior: EstadoLoginAdmin,
  formData: FormData,
): Promise<EstadoLoginAdmin> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) {
    return { erro: "E-mail ou senha inválidos." };
  }

  const senhaCorreta = await verificarSenha(senha, admin.senhaHash);
  if (!senhaCorreta) {
    return { erro: "E-mail ou senha inválidos." };
  }

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

  if (senhaNova.length < 8) {
    return { erro: "A nova senha precisa ter ao menos 8 caracteres." };
  }
  if (senhaNova !== confirmacao) {
    return { erro: "A confirmação não bate com a nova senha." };
  }

  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) {
    return { erro: "Conta inválida." };
  }

  const senhaAtualCorreta = await verificarSenha(senhaAtual, admin.senhaHash);
  if (!senhaAtualCorreta) {
    return { erro: "Senha atual incorreta." };
  }

  const senhaHash = await hashSenha(senhaNova);
  await prisma.admin.update({ where: { id: adminId }, data: { senhaHash } });
  return { sucesso: true };
}

async function exigirAdmin(): Promise<void> {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }
}

export async function aprovarAta(formData: FormData): Promise<void> {
  await exigirAdmin();
  const ataId = String(formData.get("ataId") ?? "");
  if (!ataId) return;

  await prisma.ata.update({ where: { id: ataId }, data: { status: "APROVADA" } });
  revalidatePath("/admin");
  revalidatePath("/catalogo");
}

export async function rejeitarAta(formData: FormData): Promise<void> {
  await exigirAdmin();
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
  await exigirAdmin();
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

export async function alternarStatusOrgao(formData: FormData): Promise<void> {
  await exigirAdmin();
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
  await exigirAdmin();
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
  await exigirAdmin();

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
  await exigirAdmin();
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
  await exigirAdmin();

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
  await exigirAdmin();
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
  await exigirAdmin();

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
  await exigirAdmin();

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
  await exigirAdmin();
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
  await exigirAdmin();
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
  await exigirAdmin();

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
  await exigirAdmin();
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
  await exigirAdmin();

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
  const dataAssinatura = String(formData.get("dataAssinatura") ?? "");
  const dataVigenciaFim = String(formData.get("dataVigenciaFim") ?? "");

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

  let ataId: string;
  try {
    const ata = await prisma.ata.create({
      data: {
        numero,
        objeto,
        categoria: ataCategoria,
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
                  nomeArquivo: documento.name,
                  tipoMime: documento.type,
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
