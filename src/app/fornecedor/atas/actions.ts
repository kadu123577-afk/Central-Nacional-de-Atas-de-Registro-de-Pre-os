"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fornecedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CATEGORIAS_ATAS } from "@/lib/categorias";

export interface EstadoCadastroAtaFornecedor {
  erro?: string;
}

/**
 * Cadastro de ata pelo fornecedor autenticado — substitui o antigo fluxo
 * público de /atas/nova (achado da auditoria de 2026-09-04: qualquer um
 * podia submeter ata/fornecedor sem login). Aqui o fornecedor já vem da
 * sessão, então o formulário só pede o órgão gerenciador, a ata e o item.
 */
export async function cadastrarAtaComoFornecedor(
  _estadoAnterior: EstadoCadastroAtaFornecedor,
  formData: FormData,
): Promise<EstadoCadastroAtaFornecedor> {
  const fornecedorId = await fornecedorIdLogado();
  if (!fornecedorId) {
    redirect("/fornecedor/login");
  }

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

  const itemDescricao = String(formData.get("itemDescricao") ?? "").trim();
  const itemCategoria = String(formData.get("itemCategoria") ?? "").trim();
  const itemUnidade = String(formData.get("itemUnidade") ?? "").trim();
  const itemQuantidade = Number(formData.get("itemQuantidade"));
  const itemValorUnitario = String(formData.get("itemValorUnitario") ?? "").trim();

  if (
    !orgaoNome ||
    !orgaoCnpj ||
    !orgaoUf ||
    !orgaoMunicipio ||
    !orgaoEsfera ||
    !numero ||
    !objeto ||
    !ataCategoria ||
    !CATEGORIAS_ATAS.some((c) => c.rotulo === ataCategoria) ||
    !dataAssinatura ||
    !dataVigenciaFim ||
    !itemDescricao ||
    !itemCategoria ||
    !itemUnidade ||
    !itemValorUnitario ||
    !Number.isFinite(itemQuantidade) ||
    itemQuantidade <= 0
  ) {
    return { erro: "Preencha todos os campos obrigatórios com valores válidos." };
  }

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

  let ataId: string;
  try {
    const ata = await prisma.ata.create({
      data: {
        numero,
        objeto,
        categoria: ataCategoria,
        dataAssinatura: new Date(dataAssinatura),
        dataVigenciaFim: new Date(dataVigenciaFim),
        fornecedorId,
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
    ataId = ata.id;
  } catch {
    // Colidiu com a constraint única de número+órgão.
    return { erro: "Já existe uma ata com esse número para esse órgão gerenciador." };
  }

  revalidatePath("/fornecedor");
  redirect(`/fornecedor?ataCriada=${ataId}`);
}
