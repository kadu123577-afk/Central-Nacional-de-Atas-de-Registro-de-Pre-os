"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  criarSessaoVendedor,
  encerrarSessaoVendedor,
  hashSenha,
  verificarSenha,
  vendedorIdLogado,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prazoParaEstagio } from "@/lib/negociacao";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import {
  estagioOportunidadeValido,
  RESULTADO_INTERACAO_POR_ESTAGIO,
} from "@/lib/oportunidades";
import type { EstadoTrocarSenha } from "@/components/ui/formulario-trocar-senha";

export interface EstadoLoginVendedor {
  erro?: string;
}

export async function trocarSenhaVendedor(
  _estadoAnterior: EstadoTrocarSenha,
  formData: FormData,
): Promise<EstadoTrocarSenha> {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  const senhaAtual = String(formData.get("senhaAtual") ?? "");
  const senhaNova = String(formData.get("senhaNova") ?? "");
  const confirmacao = String(formData.get("confirmacaoSenhaNova") ?? "");

  if (senhaNova.length < 8) {
    return { erro: "A nova senha precisa ter ao menos 8 caracteres." };
  }
  if (senhaNova !== confirmacao) {
    return { erro: "A confirmação não bate com a nova senha." };
  }

  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId } });
  if (!vendedor) {
    return { erro: "Conta inválida." };
  }

  const senhaAtualCorreta = await verificarSenha(senhaAtual, vendedor.senhaHash);
  if (!senhaAtualCorreta) {
    return { erro: "Senha atual incorreta." };
  }

  const senhaHash = await hashSenha(senhaNova);
  await prisma.vendedor.update({ where: { id: vendedorId }, data: { senhaHash } });
  return { sucesso: true };
}

export async function loginVendedor(
  _estadoAnterior: EstadoLoginVendedor,
  formData: FormData,
): Promise<EstadoLoginVendedor> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const vendedor = await prisma.vendedor.findUnique({ where: { email } });
  if (!vendedor || !vendedor.ativo) {
    return { erro: "E-mail ou senha inválidos." };
  }

  const senhaCorreta = await verificarSenha(senha, vendedor.senhaHash);
  if (!senhaCorreta) {
    return { erro: "E-mail ou senha inválidos." };
  }

  await criarSessaoVendedor(vendedor.id);
  redirect("/vendedor");
}

export async function logoutVendedor(): Promise<void> {
  await encerrarSessaoVendedor();
  redirect("/vendedor/login");
}

export interface EstadoSolicitarMunicipios {
  erro?: string;
}

/**
 * Pedido de negociação (2026-10-04): a ata não é mais "pega" de forma
 * exclusiva — o vendedor pede os municípios em que quer negociar e o admin
 * libera (inclusive dois vendedores na mesma ata em municípios diferentes).
 * Só atas aprovadas e com contrato de intermediação aceitam pedido. Um
 * município que já está em negociação (por qualquer vendedor) ou que já
 * tem pedido meu aguardando liberação é ignorado.
 */
export async function solicitarMunicipios(
  ataId: string,
  _estadoAnterior: EstadoSolicitarMunicipios,
  formData: FormData,
): Promise<EstadoSolicitarMunicipios> {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  await expirarOportunidadesVencidas();

  const ata = await prisma.ata.findUnique({ where: { id: ataId }, include: { contrato: true } });
  if (!ata || ata.status !== "APROVADA" || !ata.contrato) {
    return { erro: "Esta ata não está liberada para negociação." };
  }

  const ids = [...new Set(formData.getAll("entidadeAlvoId").map(String).filter(Boolean))];
  if (ids.length === 0) return { erro: "Escolha ao menos um município." };

  const [existentes, ocupados, meusPendentes] = await Promise.all([
    prisma.entidadeAlvo.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    prisma.oportunidadeVenda.findMany({
      where: { ataId, entidadeAlvoId: { in: ids }, expiradaEm: null },
      select: { entidadeAlvoId: true },
    }),
    prisma.pedidoNegociacao.findMany({
      where: { ataId, vendedorId, entidadeAlvoId: { in: ids }, status: "pendente" },
      select: { entidadeAlvoId: true },
    }),
  ]);
  const bloqueados = new Set([
    ...ocupados.map((o) => o.entidadeAlvoId),
    ...meusPendentes.map((p) => p.entidadeAlvoId),
  ]);
  const livres = existentes.map((e) => e.id).filter((id) => !bloqueados.has(id));
  if (livres.length === 0) {
    return { erro: "Os municípios escolhidos já estão em negociação ou aguardando liberação." };
  }

  await prisma.pedidoNegociacao.createMany({
    data: livres.map((entidadeAlvoId) => ({ ataId, vendedorId, entidadeAlvoId })),
  });

  revalidatePath("/vendedor");
  revalidatePath("/admin/negociacoes");
  redirect("/vendedor");
}

/**
 * Move o card no Kanban — e espelha a mudança como uma
 * InteracaoPontoFocal (histórico por contato que já existia), escolhendo
 * o primeiro contato ativo do município como representante. Assim o
 * painel de contatos e o Kanban nunca desencontram.
 */
export interface EstadoMoverEstagio {
  erro?: string;
  /** Devolvido junto do erro: o React zera o formulário após a action, e isso repõe o que foi digitado. */
  valores?: { valorAderido: string; observacoes: string; nonce: string };
}

export async function moverEstagioOportunidade(
  oportunidadeId: string,
  _estadoAnterior: EstadoMoverEstagio,
  formData: FormData,
): Promise<EstadoMoverEstagio> {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  const novoEstagio = String(formData.get("estagio") ?? "");
  const observacoes = String(formData.get("observacoes") ?? "");
  // nonce: muda a cada envio, pro cartão remontar o <select> (que o reset do form zera).
  const valores = {
    valorAderido: String(formData.get("valorAderido") ?? ""),
    observacoes,
    nonce: randomUUID(),
  };
  if (!estagioOportunidadeValido(novoEstagio)) return { erro: "Estágio inválido.", valores };

  const oportunidade = await prisma.oportunidadeVenda.findUnique({
    where: { id: oportunidadeId },
  });
  if (!oportunidade || oportunidade.vendedorId !== vendedorId) {
    return { erro: "Oportunidade não encontrada.", valores };
  }
  if (oportunidade.expiradaEm) {
    return { erro: "O prazo deste município venceu. Faça um novo pedido de negociação.", valores };
  }

  const observacoesLimpa = observacoes.trim() || null;

  // Controle de recebíveis — "Aderiu" exige o valor que o ente aderiu e
  // um contrato de intermediação cadastrado na ata (2026-10-04): o
  // percentual de comissão vem do contrato pactuado com o fornecedor, não
  // é digitado pelo vendedor. Fica copiado na oportunidade (não muda se o
  // contrato for reeditado depois da adesão).
  let valorAderido: string | undefined;
  let percentualComissao: string | undefined;
  if (novoEstagio === "aderiu") {
    const valorBruto = String(formData.get("valorAderido") ?? "").trim().replace(",", ".");
    const valorNumero = Number(valorBruto);
    if (!valorBruto || !Number.isFinite(valorNumero) || valorNumero <= 0) {
      return { erro: "Informe um valor aderido maior que zero.", valores };
    }
    valorAderido = valorBruto;

    if (oportunidade.estagio === "aderiu" && oportunidade.percentualComissao) {
      percentualComissao = oportunidade.percentualComissao.toString();
    } else {
      const contrato = await prisma.contratoIntermediacao.findUnique({
        where: { ataId: oportunidade.ataId },
      });
      if (!contrato) {
        return {
          erro: "Esta ata ainda não tem contrato de intermediação cadastrado. Peça ao administrador antes de marcar como Aderiu.",
          valores,
        };
      }
      percentualComissao = contrato.percentualComissao.toString();
    }
  }

  // Saindo de "aderiu": os dados de recebível deixam de valer e são
  // limpos — mas só se nenhuma nota fiscal já foi liquidada em cima deles,
  // senão o admin perderia a base do que já foi (ou será) cobrado.
  let limparRecebivel = false;
  if (oportunidade.estagio === "aderiu" && novoEstagio !== "aderiu") {
    const liquidacoes = await prisma.liquidacao.count({ where: { oportunidadeId } });
    if (liquidacoes > 0) {
      return {
        erro: `Esta oportunidade já tem ${liquidacoes} liquidação(ões) registrada(s) e não pode sair de "Aderiu". Fale com o administrador.`,
        valores,
      };
    }
    limparRecebivel = true;
  }

  await prisma.oportunidadeVenda.update({
    where: { id: oportunidadeId },
    data: {
      estagio: novoEstagio,
      observacoes: observacoesLimpa,
      prazoEm: prazoParaEstagio(novoEstagio),
      ...(valorAderido ? { valorAderido, percentualComissao } : {}),
      ...(limparRecebivel ? { valorAderido: null, percentualComissao: null } : {}),
    },
  });

  const contatoPrincipal = await prisma.pontoFocal.findFirst({
    where: { entidadeAlvoId: oportunidade.entidadeAlvoId, ativo: true },
    orderBy: { createdAt: "asc" },
  });
  if (contatoPrincipal) {
    await prisma.interacaoPontoFocal.create({
      data: {
        pontoFocalId: contatoPrincipal.id,
        ataId: oportunidade.ataId,
        resultado: RESULTADO_INTERACAO_POR_ESTAGIO[novoEstagio],
        observacao: observacoesLimpa,
      },
    });
  }

  revalidatePath(`/vendedor/atas/${oportunidade.ataId}`);
  return {};
}
