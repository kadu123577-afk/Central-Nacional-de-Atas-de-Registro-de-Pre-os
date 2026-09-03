"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashSenha } from "@/lib/auth";

export interface EstadoCadastroAta {
  erro?: string;
}

export async function cadastrarAta(
  _estadoAnterior: EstadoCadastroAta,
  formData: FormData,
): Promise<EstadoCadastroAta> {
  const fornecedorRazaoSocial = String(formData.get("fornecedorRazaoSocial") ?? "").trim();
  const fornecedorCnpj = String(formData.get("fornecedorCnpj") ?? "").trim();
  const fornecedorEmail = String(formData.get("fornecedorEmail") ?? "").trim();
  const fornecedorSenha = String(formData.get("fornecedorSenha") ?? "");

  const orgaoNome = String(formData.get("orgaoNome") ?? "").trim();
  const orgaoCnpj = String(formData.get("orgaoCnpj") ?? "").trim();
  const orgaoUf = String(formData.get("orgaoUf") ?? "").trim().toUpperCase();
  const orgaoMunicipio = String(formData.get("orgaoMunicipio") ?? "").trim();
  const orgaoEsfera = String(formData.get("orgaoEsfera") ?? "").trim();

  const numero = String(formData.get("numero") ?? "").trim();
  const objeto = String(formData.get("objeto") ?? "").trim();
  const dataAssinatura = String(formData.get("dataAssinatura") ?? "");
  const dataVigenciaFim = String(formData.get("dataVigenciaFim") ?? "");

  const itemDescricao = String(formData.get("itemDescricao") ?? "").trim();
  const itemCategoria = String(formData.get("itemCategoria") ?? "").trim();
  const itemUnidade = String(formData.get("itemUnidade") ?? "").trim();
  const itemQuantidade = Number(formData.get("itemQuantidade"));
  const itemValorUnitario = String(formData.get("itemValorUnitario") ?? "").trim();

  if (
    !fornecedorRazaoSocial ||
    !fornecedorCnpj ||
    !fornecedorEmail ||
    fornecedorSenha.length < 8 ||
    !orgaoNome ||
    !orgaoCnpj ||
    !orgaoUf ||
    !orgaoMunicipio ||
    !orgaoEsfera ||
    !numero ||
    !objeto ||
    !dataAssinatura ||
    !dataVigenciaFim ||
    !itemDescricao ||
    !itemCategoria ||
    !itemUnidade ||
    !itemValorUnitario ||
    !Number.isFinite(itemQuantidade) ||
    itemQuantidade <= 0
  ) {
    return {
      erro:
        "Preencha todos os campos obrigatórios com valores válidos (senha do fornecedor precisa ter ao menos 8 caracteres).",
    };
  }

  const senhaHash = await hashSenha(fornecedorSenha);

  const fornecedor = await prisma.fornecedor.upsert({
    where: { cnpj: fornecedorCnpj },
    update: { razaoSocial: fornecedorRazaoSocial, email: fornecedorEmail, senhaHash },
    create: {
      razaoSocial: fornecedorRazaoSocial,
      cnpj: fornecedorCnpj,
      email: fornecedorEmail,
      senhaHash,
    },
  });

  const orgaoGerenciador = await prisma.orgao.upsert({
    where: { cnpj: orgaoCnpj },
    update: { nome: orgaoNome, uf: orgaoUf, municipio: orgaoMunicipio, esfera: orgaoEsfera },
    create: {
      nome: orgaoNome,
      cnpj: orgaoCnpj,
      uf: orgaoUf,
      municipio: orgaoMunicipio,
      esfera: orgaoEsfera,
    },
  });

  const ata = await prisma.ata.create({
    data: {
      numero,
      objeto,
      dataAssinatura: new Date(dataAssinatura),
      dataVigenciaFim: new Date(dataVigenciaFim),
      fornecedorId: fornecedor.id,
      orgaoGerenciadorId: orgaoGerenciador.id,
      itens: {
        create: {
          descricao: itemDescricao,
          categoria: itemCategoria,
          unidade: itemUnidade,
          quantidadeRegistrada: itemQuantidade,
          valorUnitario: itemValorUnitario,
          saldo: { create: {} },
        },
      },
    },
  });

  revalidatePath("/atas");
  redirect(`/atas?criada=${ata.id}`);
}
