"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fornecedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CATEGORIAS_ATAS } from "@/lib/categorias";

export interface EstadoCadastroAtaFornecedor {
  erro?: string;
}

const TAMANHO_MAXIMO_DOCUMENTO_BYTES = 10 * 1024 * 1024;
const TIPOS_MIME_DOCUMENTO_ACEITOS = ["application/pdf", "image/jpeg", "image/png"];

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

  const itensDescricao = formData.getAll("itemDescricao[]").map((v) => String(v).trim());
  const itensCategoria = formData.getAll("itemCategoria[]").map((v) => String(v).trim());
  const itensUnidade = formData.getAll("itemUnidade[]").map((v) => String(v).trim());
  const itensQuantidade = formData.getAll("itemQuantidade[]").map((v) => Number(v));
  const itensValorUnitario = formData.getAll("itemValorUnitario[]").map((v) => String(v).trim());

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

  // Documento é opcional — campo de arquivo vazio chega como File de
  // tamanho 0, não como null.
  const documento = formData.get("documento");
  const temDocumento = documento instanceof File && documento.size > 0;

  if (temDocumento) {
    if (documento.size > TAMANHO_MAXIMO_DOCUMENTO_BYTES) {
      return { erro: "O documento não pode passar de 10MB." };
    }
    if (!TIPOS_MIME_DOCUMENTO_ACEITOS.includes(documento.type)) {
      return { erro: "Envie o documento em PDF, JPEG ou PNG." };
    }
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
        fornecedorId,
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
    // Colidiu com a constraint única de número+órgão.
    return { erro: "Já existe uma ata com esse número para esse órgão gerenciador." };
  }

  revalidatePath("/fornecedor");
  redirect(`/fornecedor?ataCriada=${ataId}`);
}
