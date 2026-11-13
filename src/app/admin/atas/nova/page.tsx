import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";
import { dataParaCampo, urlAtaPncp } from "@/lib/radar-atas-view";
import { FormularioNovaAtaAdmin, type InicialNovaAta } from "./formulario";

export const dynamic = "force-dynamic";

/**
 * Cadastro de ata pelo admin (2026-09-26) — decisão de negócio: quem
 * cadastra a ata agora é a Tech 10, manualmente; o painel do fornecedor
 * virou vitrine, não ferramenta de autocadastro (ver
 * src/app/fornecedor/atas/nova/page.tsx, pausada).
 *
 * Com ?captacao=<id> (botão "Fechou: cadastrar a ata" do cartão da Captação), o formulário já vem
 * com o que o cartão sabe; ao cadastrar, o cartão fecha.
 */
export default async function NovaAtaAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }
  await exigirPermissaoDe(adminId, "atas.captar");

  const pedido = (await searchParams).captacao;
  const captacaoId = typeof pedido === "string" && /^c[a-z0-9]{15,40}$/.test(pedido) ? pedido : null;

  let inicial: InicialNovaAta | undefined;
  if (captacaoId) {
    const cartao = await prisma.captacao.findUnique({ where: { id: captacaoId } });
    // Cartão que já fechou (já tem ata) não pré-preenche: o cadastro seria uma segunda ata.
    if (cartao && !cartao.ataId) {
      const contato = cartao.fornecedorCnpj
        ? await prisma.contatoEmpresa.findFirst({
            where: { cnpj: cartao.fornecedorCnpj, email: { not: null } },
            orderBy: { criadoEm: "asc" },
            select: { email: true },
          })
        : null;
      inicial = {
        captacaoId: cartao.id,
        nomeDoCartao: cartao.nome,
        fornecedorNome: cartao.fornecedorNome ?? undefined,
        fornecedorCnpj: cartao.fornecedorCnpj ?? undefined,
        fornecedorEmail: contato?.email ?? undefined,
        orgaoNome: cartao.orgaoNome ?? undefined,
        orgaoUf: cartao.uf ?? undefined,
        orgaoMunicipio: cartao.municipioNome ?? undefined,
        numero: cartao.numeroAta ?? undefined,
        objeto: cartao.objeto,
        ataCategoria: cartao.categoria ?? undefined,
        dataVigenciaFim: dataParaCampo(cartao.vigenciaFim) || undefined,
        linkPncp: urlAtaPncp(cartao.numeroControlePncpAta) ?? undefined,
      };
    }
  }

  return <FormularioNovaAtaAdmin inicial={inicial} />;
}
