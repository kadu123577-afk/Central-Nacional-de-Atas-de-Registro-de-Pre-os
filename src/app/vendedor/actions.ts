"use server";

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
import { buscarMunicipiosCompativeis } from "@/lib/match-ata-municipio";
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

/**
 * "A partir do momento que ele pegou uma ata ela fica com ele para
 * vender para aqueles municípios" (2026-10-01) — reivindicação exclusiva
 * e atômica (updateMany com vendedorId: null na condição evita dois
 * vendedores pegarem a mesma ata numa corrida). Ao reivindicar, já cria
 * uma oportunidade (card do Kanban) pra cada município da lista "já
 * contrataram" dessa categoria — os candidatos fortes, não os
 * especulativos (esses o vendedor adiciona manualmente se quiser
 * perseguir, ver `adicionarOportunidadeManual`).
 */
export async function reivindicarAta(ataId: string): Promise<void> {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  const ata = await prisma.ata.findUnique({ where: { id: ataId } });
  if (!ata) return;

  const resultado = await prisma.ata.updateMany({
    where: { id: ataId, vendedorId: null },
    data: { vendedorId },
  });
  if (resultado.count === 0) {
    // Outro vendedor já pegou antes (ou é o mesmo vendedor clicando de
    // novo) — não faz nada, não é erro.
    revalidatePath("/vendedor");
    return;
  }

  if (ata.categoria) {
    const { jaContrataram } = await buscarMunicipiosCompativeis(ata.categoria);
    if (jaContrataram.length > 0) {
      await prisma.oportunidadeVenda.createMany({
        data: jaContrataram.map((m) => ({
          ataId,
          entidadeAlvoId: m.id,
          vendedorId,
        })),
        skipDuplicates: true,
      });
    }
  }

  revalidatePath("/vendedor");
  redirect(`/vendedor/atas/${ataId}`);
}

/** Adiciona manualmente um município da lista especulativa ("possível
 * oportunidade") ao Kanban — o vendedor decide perseguir, não é
 * automático como os candidatos fortes. */
export async function adicionarOportunidadeManual(
  ataId: string,
  entidadeAlvoId: string,
): Promise<void> {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  const ata = await prisma.ata.findUnique({ where: { id: ataId } });
  if (!ata || ata.vendedorId !== vendedorId) return;

  await prisma.oportunidadeVenda.upsert({
    where: { ataId_entidadeAlvoId: { ataId, entidadeAlvoId } },
    update: {},
    create: { ataId, entidadeAlvoId, vendedorId },
  });

  revalidatePath(`/vendedor/atas/${ataId}`);
}

/**
 * Move o card no Kanban — e espelha a mudança como uma
 * InteracaoPontoFocal (histórico por contato que já existia), escolhendo
 * o primeiro contato ativo do município como representante. Assim o
 * painel de contatos e o Kanban nunca desencontram.
 */
export interface EstadoMoverEstagio {
  erro?: string;
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
  if (!estagioOportunidadeValido(novoEstagio)) return { erro: "Estágio inválido." };

  const oportunidade = await prisma.oportunidadeVenda.findUnique({
    where: { id: oportunidadeId },
  });
  if (!oportunidade || oportunidade.vendedorId !== vendedorId) {
    return { erro: "Oportunidade não encontrada." };
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
      return { erro: "Informe um valor aderido maior que zero." };
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
      };
    }
    limparRecebivel = true;
  }

  await prisma.oportunidadeVenda.update({
    where: { id: oportunidadeId },
    data: {
      estagio: novoEstagio,
      observacoes: observacoesLimpa,
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
