import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { adminIdLogado } from "@/lib/auth";
import { MENSAGEM_SEM_PERMISSAO, temAlguma, temPermissao, type Permissao } from "@/lib/permissoes";
import { permissoesDoAdmin } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";
import { saldoAgregadoDisponivel } from "@/lib/saldo";
import { logoutAdmin, rejeitarAta } from "./actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Badge, type Tom } from "@/components/ui/badge";
import { Cifra } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { FunilVendedor } from "@/components/vendedor/painel-resumo";
import { NAV_ADMIN } from "@/app/admin/nav";
import { ITENS_CONFORMIDADE } from "@/lib/conformidade";
import { moedaCurta, percentualDeFracao } from "@/lib/formato";
import { ONDE_LIQUIDACAO_A_COBRAR } from "@/lib/recebiveis";
import { expirarOportunidadesVencidas } from "@/lib/negociacao-expiracao";
import { montarPainel, resumirPorVendedor } from "@/lib/painel-vendedor";
import { carregarLinhasOportunidades } from "@/lib/painel-vendedor-db";
import { hojeBrasilia } from "@/lib/radar-atas-view";
import { ONDE_PRONTA_PARA_REGISTRAR } from "@/lib/registrar-adesao-db";
import { etapaPorNumero } from "@/lib/ciclo-ata";
import { carregarAtasEmAndamento } from "@/lib/ciclo-ata-db";
import { carregarFilaDaInstrucao } from "@/lib/fila-instrucao-db";

export const dynamic = "force-dynamic";

// Mesmo valor usado em src/lib/rastreador-pncp.ts pro fornecedor
// placeholder quando o PNCP não retorna o vencedor da compra.
const CNPJ_FORNECEDOR_A_CONFIRMAR = "00000000000000";

/** Ata importada automaticamente (PNCP ou Compras.gov.br) que ainda não tem
 * fornecedor real identificado ou nenhum item enriquecido — acha da revisão
 * de telas de 2026-09-04: essas atas se perdiam misturadas com a fila
 * normal de moderação. Mesma checagem serve pras duas fontes, que rodam em
 * paralelo desde 2026-09-04. */
function ataImportadaIncompleta(ata: { origem: string; itens: unknown[]; fornecedor: { cnpj: string } }): boolean {
  return (
    (ata.origem === "PNCP" || ata.origem === "COMPRAS_GOV") &&
    (ata.itens.length === 0 || ata.fornecedor.cnpj === CNPJ_FORNECEDOR_A_CONFIRMAR)
  );
}

/** Uma linha dentro de uma tarefa da fila: a ata, o município ou o cartão que está esperando, com o link direto. */
interface SubLinha {
  rotulo: string;
  detalhe?: string;
  href: string;
}

/** Quantas linhas cada tarefa mostra antes do "e mais N". */
const LIMITE_SUBLINHAS = 5;

async function subAdesoesParaRegistrar(): Promise<SubLinha[]> {
  const ops = await prisma.oportunidadeVenda.findMany({
    where: ONDE_PRONTA_PARA_REGISTRAR,
    take: LIMITE_SUBLINHAS,
    select: { id: true, ata: { select: { numero: true } }, entidadeAlvo: { select: { nome: true, municipio: true, uf: true } } },
  });
  return ops.map((o) => ({
    rotulo: `${o.entidadeAlvo.municipio ?? o.entidadeAlvo.nome}${o.entidadeAlvo.uf ? `/${o.entidadeAlvo.uf}` : ""}`,
    detalhe: `Ata ${o.ata.numero}`,
    href: `/admin/adesoes/${o.id}`,
  }));
}

async function subCaptacoes(adminId: string, onde: Prisma.CaptacaoWhereInput): Promise<SubLinha[]> {
  const cartoes = await prisma.captacao.findMany({
    where: { responsavelId: adminId, ...onde },
    orderBy: [{ proximoContatoEm: { sort: "asc", nulls: "last" } }, { atualizadoEm: "desc" }],
    take: LIMITE_SUBLINHAS,
    select: { id: true, nome: true, fornecedorNome: true },
  });
  return cartoes.map((c) => ({ rotulo: c.nome, detalhe: c.fornecedorNome ?? "Empresa a identificar", href: `/admin/captacao/${c.id}` }));
}

async function subCadastrosAguardando(): Promise<SubLinha[]> {
  const [orgaos, fornecedores] = await Promise.all([
    prisma.orgao.findMany({ where: { aguardaLiberacao: true }, orderBy: { createdAt: "asc" }, take: LIMITE_SUBLINHAS, select: { nome: true, uf: true } }),
    prisma.fornecedor.findMany({ where: { aguardaLiberacao: true }, orderBy: { createdAt: "asc" }, take: LIMITE_SUBLINHAS, select: { razaoSocial: true } }),
  ]);
  return [
    ...orgaos.map((o) => ({ rotulo: o.nome, detalhe: `Órgão${o.uf ? ` · ${o.uf}` : ""}`, href: "/admin/usuarios" })),
    ...fornecedores.map((f) => ({ rotulo: f.razaoSocial, detalhe: "Fornecedor", href: "/admin/usuarios" })),
  ].slice(0, LIMITE_SUBLINHAS);
}

interface ItemFila {
  rotulo: string;
  /** Quem resolve este ponto: só aparece na fila de quem tem uma destas permissões. */
  permissao: readonly Permissao[];
  descricao: string;
  n: number;
  href: string;
  tom: Tom;
  /** Uma linha por ata, município ou cartão que espera (as primeiras), com o link direto. */
  subitens?: SubLinha[];
}

/**
 * Painel do gestor (2026-09, redesenhado na fase 2 em 2026-10-05): primeiro o
 * que precisa de ação (fila), depois o canal de vendedores (indicadores,
 * funil, por vendedor), as atas aguardando moderação e, por último, o canal
 * de autoatendimento dos órgãos.
 */
export default async function PainelAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ acesso?: string }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }
  const { acesso } = await searchParams;
  const permissoes = await permissoesDoAdmin(adminId);
  if (permissoes === null) redirect("/admin/login");
  const podeAprovar = temPermissao(permissoes, "atas.aprovar");
  // A página inicial é a fila de tarefas de cada perfil: cada pessoa vê só o que as permissões dela resolvem.
  // Engessado por função (14/11/2026): quem executa uma etapa vê só o que está na vez dele; os painéis
  // de números e a visão geral são da Gestão ("visao.geral").
  const ehGestor = temPermissao(permissoes, "visao.geral");
  const verCanalVendedores = ehGestor;
  // A lista de atas esperando análise é de quem age sobre elas: contrato, conformidade ou aprovação.
  const verModeracao = temAlguma(permissoes, ["atas.contrato", "atas.conformidade", "atas.aprovar"]);
  // Os painéis de números (atas aprovadas, saldo, conversão, valores) são visão geral. Quem cobra a
  // comissão trabalha na aba Financeiro, não neste painel.
  const verFinanceiro = ehGestor;

  await expirarOportunidadesVencidas();

  // Ciclo da ata (2026-11-14): quantas atas esperam uma etapa que ESTA pessoa pode resolver.
  const atasEmAndamento = ehGestor || verModeracao ? await carregarAtasEmAndamento() : [];
  const atasDoCiclo = atasEmAndamento.filter((a) => {
    const etapa = a.situacao.etapaAtual ? etapaPorNumero(a.situacao.etapaAtual) : undefined;
    return etapa ? temPermissao(permissoes, etapa.permissao) : false;
  });
  const atasNaSuaVez = atasDoCiclo.length;

  // Instrução da adesão (2026-11-14): o que espera o jurídico declarar e o que o Dr. Rui ainda instrui.
  const filaInstrucao = temAlguma(permissoes, ["adesao.declarar", "adesao.instruir"]) ? await carregarFilaDaInstrucao(300) : null;

  const [
    totalAtas,
    atasComAdesao,
    itensComSaldo,
    pedidosEmAndamento,
    pedidosFaturados,
    atasPendentes,
    faturamentos,
    pedidosNegociacaoPendentes,
    contatosParaRevisar,
    atasSemContrato,
    totalAtasSemContrato,
    liquidacoesACobrar,
    linhasPipeline,
    contratosDetectadosParaConfirmar,
    aditivosAAcompanhar,
    captacoesComContatoVencido,
    captacoesParaPrimeiroContato,
    adesoesProntasParaRegistrar,
    atasSemItens,
    cadastrosAguardandoLiberacao,
  ] = await Promise.all([
    prisma.ata.count({ where: { status: "APROVADA" } }),
    // Funil de conversão (mapa do núcleo de atas, 2026-09-05): quantas atas
    // aprovadas conseguiram fechar pelo menos uma adesão de verdade — não
    // existe estágio de "cancelada" em Adesao hoje, então qualquer adesão
    // registrada já conta.
    prisma.ata.count({
      where: { status: "APROVADA", itens: { some: { adesoes: { some: {} } } } },
    }),
    prisma.item.findMany({ include: { saldo: true } }),
    prisma.adesao.count({ where: { estagio: { not: "FATURADA" } } }),
    prisma.adesao.count({ where: { estagio: "FATURADA" } }),
    prisma.ata
      .findMany({
        where: { status: "PENDENTE" },
        include: {
          fornecedor: true,
          orgaoGerenciador: true,
          itens: true,
          documentos: true,
          conformidade: true,
          contrato: true,
        },
        orderBy: { createdAt: "asc" },
      })
      .then((atas) =>
        // Incompletas primeiro — são as que mais precisam de atenção do
        // admin antes de aprovar/rejeitar, não deveriam ficar perdidas no
        // meio da fila comum.
        [...atas].sort((a, b) => Number(ataImportadaIncompleta(b)) - Number(ataImportadaIncompleta(a))),
      ),
    prisma.faturamento.findMany(),
    prisma.pedidoNegociacao.count({ where: { status: "pendente" } }),
    prisma.pontoFocal.count({ where: { contatoErradoEm: { not: null }, ativo: true } }),
    prisma.ata.findMany({
      where: { status: "APROVADA", contrato: { is: null } },
      select: { id: true, numero: true },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.ata.count({ where: { status: "APROVADA", contrato: { is: null } } }),
    prisma.liquidacao.count({ where: ONDE_LIQUIDACAO_A_COBRAR }),
    carregarLinhasOportunidades({}),
    // Acompanhamento de contratos do PNCP (Projeto RNA, etapa 2): vínculos que
    // o script sugeriu e esperam o gestor confirmar ou descartar.
    prisma.vinculoContrato.count({ where: { status: "sugerido" } }),
    // Aditivos (valor ou prazo) de contratos com vínculo já confirmado: geram
    // comissão em cascata e ficam a acompanhar até o gestor lançar a
    // liquidação ou marcar "sem comissão".
    prisma.termoContratoPublico.count({
      where: { cobrancaStatus: "a_acompanhar", contrato: { vinculo: { is: { status: "confirmado" } } } },
    }),
    // Captação de atas (14/11/2026): os cartões DESTA pessoa cujo próximo contato marcado já passou, e os
    // que ela assumiu e ainda não procurou. Cada captador vê só o que é dele.
    prisma.captacao.count({
      where: {
        responsavelId: adminId,
        estagio: { in: ["identificada", "em_contato", "interessada"] },
        proximoContatoEm: { lt: hojeBrasilia(new Date()) },
      },
    }),
    prisma.captacao.count({ where: { responsavelId: adminId, estagio: "identificada" } }),
    // Registro da adesão (2026-11-14): declaração do jurídico feita, contrato na ata, ainda não aderida.
    prisma.oportunidadeVenda.count({ where: ONDE_PRONTA_PARA_REGISTRAR }),
    // Itens e saldos (2026-11-14): ata cadastrada ou aprovada, com a empresa já confirmada (etapa 3 do ciclo),
    // que ainda não tem itens. É a lista da tela "Itens das atas" (/admin/atas-itens).
    prisma.ata.findMany({
      where: {
        status: { in: ["PENDENTE", "APROVADA"] },
        itens: { none: {} },
        fornecedor: { cnpj: { not: CNPJ_FORNECEDOR_A_CONFIRMAR } },
      },
      select: { id: true, numero: true, fornecedor: { select: { razaoSocial: true } } },
      orderBy: { createdAt: "asc" },
    }),
    // Cadastro público (14/11/2026): órgãos e fornecedores que se cadastraram e esperam a equipe liberar.
    Promise.all([prisma.orgao.count({ where: { aguardaLiberacao: true } }), prisma.fornecedor.count({ where: { aguardaLiberacao: true } })]).then(
      ([orgaos, fornecedores]) => orgaos + fornecedores,
    ),
  ]);

  // Listas curtas para as tarefas (uma linha por ata, município ou cartão), só do que a pessoa pode resolver.
  const [subRegistrar, subPrimeiroContato, subContatoVencido, subCadastros] = await Promise.all([
    temPermissao(permissoes, "adesao.registrar") && adesoesProntasParaRegistrar > 0 ? subAdesoesParaRegistrar() : Promise.resolve([]),
    temPermissao(permissoes, "atas.captar") && captacoesParaPrimeiroContato > 0
      ? subCaptacoes(adminId, { estagio: "identificada" })
      : Promise.resolve([]),
    temPermissao(permissoes, "atas.captar") && captacoesComContatoVencido > 0
      ? subCaptacoes(adminId, {
          estagio: { in: ["identificada", "em_contato", "interessada"] },
          proximoContatoEm: { lt: hojeBrasilia(new Date()) },
        })
      : Promise.resolve([]),
    temPermissao(permissoes, "usuarios.gerir") && cadastrosAguardandoLiberacao > 0 ? subCadastrosAguardando() : Promise.resolve([]),
  ]);
  const naFilaDeInstrucao = filaInstrucao?.itens ?? [];
  const linhaDaInstrucao = (i: (typeof naFilaDeInstrucao)[number]): SubLinha => ({
    rotulo: `${i.municipio}${i.uf ? `/${i.uf}` : ""}`,
    detalhe: `Ata ${i.ataNumero} · ${i.obrigatoriosFeitos} de ${i.obrigatoriosTotal} itens · ${i.consultor}`,
    href: `/admin/adesoes/${i.id}`,
  });

  const taxaConversao = totalAtas > 0 ? Math.round((atasComAdesao / totalAtas) * 100) : null;

  const saldoTotalDisponivel = itensComSaldo.reduce(
    (total, item) =>
      total + saldoAgregadoDisponivel(item.quantidadeRegistrada, item.saldo?.quantidadeConsumida ?? 0),
    0,
  );

  const totalAReceber = faturamentos
    .filter((f) => !f.pago)
    .reduce((total, f) => total + Number(f.valorTaxaIntermediacao), 0);
  const totalRecebido = faturamentos
    .filter((f) => f.pago)
    .reduce((total, f) => total + Number(f.valorTaxaIntermediacao), 0);

  // A ata só aparece para quem age sobre ela NESTA etapa (14/11/2026): contrato (4), conformidade (5)
  // ou aprovação (6). Antes a lista mostrava toda ata pendente, até as que ainda não estavam na vez.
  const etapaDaAta = new Map(atasEmAndamento.map((a) => [a.id, a.situacao.etapaAtual]));
  const etapaDaVez = (id: string): 4 | 5 | 6 | null => {
    const n = etapaDaAta.get(id);
    return n === 4 || n === 5 || n === 6 ? n : null;
  };
  const podeAgirNaEtapa = (n: 4 | 5 | 6) =>
    temPermissao(permissoes, n === 4 ? "atas.contrato" : n === 5 ? "atas.conformidade" : "atas.aprovar");
  const atasNaMinhaVez = atasPendentes.filter((ata) => {
    const n = etapaDaVez(ata.id);
    return n !== null && podeAgirNaEtapa(n);
  });

  // Tarefa do captador: ata importada cuja empresa prestadora ainda não foi confirmada.
  const atasParaCompletar = atasPendentes.filter((ata) => ata.fornecedor.cnpj === CNPJ_FORNECEDOR_A_CONFIRMAR);

  const painel = montarPainel(linhasPipeline);
  const porVendedor = resumirPorVendedor(linhasPipeline);
  const k = painel.kpis;

  const fila: ItemFila[] = [
    {
      rotulo: "Atas esperando uma etapa sua no ciclo",
      permissao: ["visao.geral"],
      descricao: "Da captação à publicação: cada ata mostra em que etapa está e o prazo em dias úteis.",
      n: atasNaSuaVez,
      href: "/admin/ciclo",
      tom: "atencao",
      subitens: atasDoCiclo.slice(0, LIMITE_SUBLINHAS).flatMap((a) => {
        const etapa = a.situacao.etapaAtual ? etapaPorNumero(a.situacao.etapaAtual) : undefined;
        return etapa ? [{ rotulo: `Ata ${a.numero}`, detalhe: `${etapa.numero}. ${etapa.titulo} · ${a.fornecedor}`, href: etapa.caminho(a.id) }] : [];
      }),
    },
    {
      rotulo: "Atas para completar os dados da empresa",
      permissao: ["atas.captar"],
      descricao: "Atas importadas cuja empresa prestadora ainda não foi confirmada: feche com a empresa e complete os dados.",
      n: atasParaCompletar.length,
      href: atasParaCompletar[0] ? `/admin/atas/${atasParaCompletar[0].id}/completar` : "/admin",
      tom: "atencao",
      subitens: atasParaCompletar.slice(0, LIMITE_SUBLINHAS).map((a) => ({
        rotulo: `Ata ${a.numero}`,
        detalhe: a.fornecedor.razaoSocial,
        href: `/admin/atas/${a.id}/completar`,
      })),
    },
    {
      rotulo: "Atas sem itens cadastrados",
      permissao: ["atas.itens"],
      descricao: "O captador já cadastrou a ata: faltam os itens e os saldos (importe o Excel ou o PDF).",
      n: atasSemItens.length,
      href: "/admin/atas-itens",
      tom: "atencao",
      subitens: atasSemItens.slice(0, LIMITE_SUBLINHAS).map((a) => ({
        rotulo: `Ata ${a.numero}`,
        detalhe: a.fornecedor.razaoSocial,
        href: `/admin/atas/${a.id}/itens`,
      })),
    },
    {
      rotulo: "Declarações de conformidade a fazer",
      permissao: ["adesao.declarar"],
      descricao: "Municípios com todos os itens obrigatórios da instrução feitos: esperam a declaração do jurídico.",
      n: filaInstrucao?.prontosParaDeclarar ?? 0,
      href: "/admin/adesoes",
      tom: "atencao",
      subitens: naFilaDeInstrucao.filter((i) => i.prontoParaDeclarar).slice(0, LIMITE_SUBLINHAS).map(linhaDaInstrucao),
    },
    {
      rotulo: "Instruções de adesão em andamento",
      permissao: ["adesao.instruir"],
      descricao: "Municípios em negociação ainda sem a declaração: marque os itens conforme os documentos chegam.",
      n: filaInstrucao?.total ?? 0,
      href: "/admin/adesoes",
      tom: "atencao",
      subitens: naFilaDeInstrucao.slice(0, LIMITE_SUBLINHAS).map(linhaDaInstrucao),
    },
    {
      rotulo: "Adesões prontas para registrar",
      permissao: ["adesao.registrar"],
      descricao: "O jurídico já declarou a conformidade: registre a quantidade de cada item.",
      n: adesoesProntasParaRegistrar,
      href: "/admin/adesoes",
      tom: "atencao",
      subitens: subRegistrar,
    },
    {
      rotulo: "Atas na sua vez",
      permissao: ["atas.contrato", "atas.conformidade", "atas.aprovar"],
      descricao: "Contrato, conformidade ou aprovação: cada ata aparece aqui quando chega à etapa que é sua.",
      n: atasNaMinhaVez.length,
      href: "#moderacao",
      tom: "atencao",
    },
    {
      rotulo: "Pedidos de negociação aguardando liberação",
      permissao: ["municipios.liberar"],
      descricao: "Vendedores esperando o município ser liberado.",
      n: pedidosNegociacaoPendentes,
      href: "/admin/negociacoes",
      tom: "atencao",
    },
    {
      rotulo: "Atas aprovadas sem contrato de intermediação",
      permissao: ["atas.contrato"],
      descricao: "Ficam invisíveis para os vendedores até o contrato ser cadastrado.",
      n: totalAtasSemContrato,
      href: atasSemContrato[0] ? `/admin/atas/${atasSemContrato[0].id}/contrato` : "/admin",
      tom: "alerta",
    },
    {
      rotulo: "Cadastros aguardando liberação",
      permissao: ["usuarios.gerir"],
      descricao: "Órgãos e fornecedores que se cadastraram sozinhos: confira os dados e libere o acesso em Usuários.",
      n: cadastrosAguardandoLiberacao,
      href: "/admin/usuarios",
      tom: "atencao",
      subitens: subCadastros,
    },
    {
      rotulo: "Contatos marcados como errados",
      permissao: ["base.editar"],
      descricao: "Vendedores sinalizaram telefone, e-mail ou pessoa incorretos.",
      n: contatosParaRevisar,
      href: "/admin/contatos-revisao",
      tom: "atencao",
    },
    {
      rotulo: "Comissões a cobrar",
      permissao: ["comissao.cobrar"],
      descricao: "Notas fiscais já liquidadas e pagas pelo órgão, sem cobrança ao fornecedor.",
      n: liquidacoesACobrar,
      href: "/admin/recebiveis-vendedores",
      tom: "atencao",
    },
    {
      rotulo: "Contratos detectados para confirmar",
      permissao: ["adesao.acompanhar"],
      descricao: "O PNCP publicou contratos que parecem ter nascido das nossas atas ou negociações.",
      n: contratosDetectadosParaConfirmar,
      href: "/admin/contratos-detectados",
      tom: "atencao",
    },
    {
      rotulo: "Aditivos a acompanhar",
      permissao: ["adesao.acompanhar"],
      descricao: "Aditivo de valor ou prazo gera comissão em cascata: lance a liquidação ou marque sem comissão.",
      n: aditivosAAcompanhar,
      href: "/admin/contratos-detectados",
      tom: "atencao",
    },
    {
      rotulo: "Atas suas para o primeiro contato",
      permissao: ["atas.captar"],
      descricao: "Atas que você assumiu na captação e ainda não procurou a empresa.",
      n: captacoesParaPrimeiroContato,
      href: "/admin/captacao?so=meus",
      tom: "atencao",
      subitens: subPrimeiroContato,
    },
    {
      rotulo: "Captações com contato vencido",
      permissao: ["atas.captar"],
      descricao: "Atas suas cujo próximo contato com a empresa já passou.",
      n: captacoesComContatoVencido,
      href: "/admin/captacao?so=meus",
      tom: "critico",
      subitens: subContatoVencido,
    },
    {
      rotulo: "Prazos de negociação vencendo",
      permissao: ["visao.geral"],
      descricao: "Municípios que expiram em até 3 dias sem avanço.",
      n: k.vencendo,
      href: "/admin/pipeline",
      tom: "critico",
    },
  ];
  // Só o que está na vez da pessoa: o que não tem nada esperando não aparece (sem linha "0 · Em dia").
  const filaDoPerfil = fila.filter((item) => temAlguma(permissoes, item.permissao) && item.n > 0);
  const totalFila = filaDoPerfil.reduce((soma, item) => soma + item.n, 0);

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-6xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      {acesso === "negado" && <Aviso tom="atencao">{MENSAGEM_SEM_PERMISSAO}</Aviso>}

      <CabecalhoPagina
        rotulo="Operação"
        titulo={ehGestor ? "Painel" : "Minhas tarefas"}
        destaque={ehGestor ? "administrativo" : "da equipe"}
        descricao={totalFila === 0 ? "Tudo em dia." : `${totalFila} ponto(s) esperando uma decisão sua.`}
      />

      <Secao titulo={ehGestor ? "Fila de ação" : "O que está esperando você"} destaque>
        {filaDoPerfil.length === 0 && (
          <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Nada esperando você agora. Quando chegar a sua vez em alguma etapa, ela aparece aqui.
          </p>
        )}
        <ul className="lista-linhas">
          {filaDoPerfil.map((item) => (
            <li key={item.rotulo} className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <i
                  aria-hidden="true"
                  className="kb-ponto mt-1.5"
                  style={{
                    background:
                      item.n === 0
                        ? "var(--cor-borda-forte)"
                        : item.tom === "critico"
                          ? "var(--cor-critico)"
                          : item.tom === "alerta"
                            ? "var(--cor-alerta)"
                            : "var(--cor-atencao)",
                  }}
                />
                <div className="min-w-0">
                  <p
                    className="text-[14px] font-bold tracking-[-0.01em]"
                    style={{ color: item.n === 0 ? "var(--cor-texto-2)" : "var(--cor-texto)" }}
                  >
                    {item.rotulo}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {item.descricao}
                  </p>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <span
                  className="numero min-w-8 text-right text-[22px] font-extrabold tracking-[-0.03em]"
                  style={{ color: item.n === 0 ? "var(--cor-texto-3)" : "var(--cor-texto)" }}
                >
                  {item.n}
                </span>
                <div className="flex min-w-[4.75rem] justify-end">
                  {item.n > 0 ? (
                    <Link href={item.href} className="botao-atas secundario pequeno" aria-label={`Abrir: ${item.rotulo}`}>
                      Abrir
                    </Link>
                  ) : (
                    <Badge tom="neutro">Em dia</Badge>
                  )}
                </div>
              </div>
              {item.n > 0 && item.subitens && item.subitens.length > 0 && (
                <ul className="mt-1 w-full basis-full border-l-2 pl-4 text-[13px]" style={{ borderColor: "var(--cor-borda)" }}>
                  {item.subitens.map((s) => (
                    <li key={`${s.href}-${s.rotulo}-${s.detalhe ?? ""}`} className="py-0.5">
                      <Link href={s.href} className="font-semibold hover:text-[var(--cor-marca-clara)]">
                        {s.rotulo}
                      </Link>
                      {s.detalhe && (
                        <span className="ml-2 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                          {s.detalhe}
                        </span>
                      )}
                    </li>
                  ))}
                  {item.n > item.subitens.length && (
                    <li className="py-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      e mais {item.n - item.subitens.length} ·{" "}
                      <Link href={item.href} className="font-semibold underline underline-offset-2">
                        ver todas
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {atasSemContrato.length > 1 && temPermissao(permissoes, "atas.contrato") && (
          <p
            className="mt-4 border-t pt-3 text-xs"
            style={{ borderColor: "var(--cor-borda)", color: "var(--cor-texto-3)" }}
          >
            Sem contrato:{" "}
            {atasSemContrato.map((a, i) => (
              <span key={a.id}>
                {i > 0 ? " · " : ""}
                <Link
                  href={`/admin/atas/${a.id}/contrato`}
                  className="font-semibold hover:underline"
                  style={{ color: "var(--cor-marca-clara)" }}
                >
                  Ata <span className="codigo">{a.numero}</span>
                </Link>
              </span>
            ))}
            {totalAtasSemContrato > atasSemContrato.length ? ` · +${totalAtasSemContrato - atasSemContrato.length}` : ""}
          </p>
        )}
      </Secao>

      {verCanalVendedores && (
      <>
      <FaixaNumeros
        itens={[
          {
            valor: moedaCurta(k.aderido),
            rotulo: "Aderido (vendedores)",
            nota: `${k.aderidos} município(s) aderiram`,
            tom: "marca",
          },
          {
            valor: moedaCurta(k.comissaoDevida - k.comissaoRecebida),
            rotulo: "Comissão a receber",
            nota: `devida ${moedaCurta(k.comissaoDevida)} · recebida ${moedaCurta(k.comissaoRecebida)}`,
            tom: k.comissaoDevida - k.comissaoRecebida > 0 ? "atencao" : undefined,
          },
          {
            valor: k.emNegociacao,
            rotulo: "Em negociação",
            nota: `${k.abertos} município(s) em aberto · ~${moedaCurta(k.potencial)} em potencial`,
          },
          {
            valor: k.semContato,
            rotulo: "Sem decisor com contato",
            nota: "municípios em aberto sem telefone nem e-mail",
            tom: k.semContato > 0 ? "atencao" : undefined,
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FunilVendedor funil={painel.funil} />
        <Secao
          titulo="Por vendedor"
          acao={
            <Link href="/admin/pipeline" className="botao-atas link">
              Abrir pipeline →
            </Link>
          }
        >
          {porVendedor.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--cor-texto-3)" }}>
              Nenhum vendedor com município ativo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabela-atas">
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th>Em aberto</th>
                    <th>Aderidos</th>
                    <th>Valor aderido</th>
                  </tr>
                </thead>
                <tbody>
                  {porVendedor.slice(0, 6).map((v) => (
                    <tr key={v.vendedorId}>
                      <td>
                        <Link
                          href={`/admin/pipeline?vendedor=${v.vendedorId}`}
                          className="titulo-linha hover:text-[var(--cor-marca-clara)]"
                        >
                          {v.nome}
                        </Link>
                      </td>
                      <td className="numero">{v.abertos}</td>
                      <td className="numero">{v.aderidos}</td>
                      <td className="whitespace-nowrap" style={{ color: "var(--cor-texto)" }}>
                        <Cifra valor={v.valorAderido} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Secao>
      </div>
      </>
      )}

      {verModeracao && (
      <div id="moderacao" className="scroll-mt-6">
        <Secao
          titulo={`Atas na sua vez (${atasNaMinhaVez.length})`}
          descricao={
            <>
              Uma ata só aparece no catálogo público depois de aprovada aqui — e só chega ao vendedor com contrato de
              intermediação cadastrado.
            </>
          }
        >
          {atasNaMinhaVez.length === 0 ? (
            <VazioComAcao titulo="Nada na sua vez" descricao="Quando uma ata chegar à etapa que é sua (contrato, conformidade ou aprovação), ela aparece aqui." />
          ) : (
            <ul className="lista-linhas">
              {atasNaMinhaVez.map((ata) => {
                const confirmados = ITENS_CONFORMIDADE.filter((i) => ata.conformidade?.[i.campo]).length;
                return (
                  <li key={ata.id} className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="codigo text-xs font-semibold" style={{ color: "var(--cor-texto-3)" }}>
                          Ata {ata.numero}
                        </h3>
                        <span className="eyebrow">
                          {ata.origem === "PNCP"
                            ? "Importada do PNCP"
                            : ata.origem === "COMPRAS_GOV"
                              ? "Importada do Compras.gov.br"
                              : ata.origem === "CIABC"
                                ? "Repassada pelo CIABC"
                                : "Cadastro manual"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {ataImportadaIncompleta(ata) && <Badge tom="alerta">Importação incompleta</Badge>}
                        <Badge tom={confirmados === ITENS_CONFORMIDADE.length ? "marca" : confirmados > 0 ? "atencao" : "neutro"}>
                          Conformidade {confirmados}/{ITENS_CONFORMIDADE.length}
                        </Badge>
                        <Badge tom={ata.contrato ? "marca" : "alerta"}>
                          {ata.contrato
                            ? `Contrato ${percentualDeFracao(Number(ata.contrato.percentualComissao))}`
                            : "Sem contrato"}
                        </Badge>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[14.5px] font-bold leading-snug tracking-[-0.01em]" style={{ color: "var(--cor-texto)" }}>
                        {ata.objeto}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        <span>
                          {ata.fornecedor.cnpj === CNPJ_FORNECEDOR_A_CONFIRMAR
                            ? "Fornecedor a confirmar"
                            : ata.fornecedor.razaoSocial}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Órgão gerenciador: {ata.orgaoGerenciador.nome}</span>
                        <span className="selo-uf">{ata.orgaoGerenciador.uf}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {ata.itens.length === 0
                            ? "sem itens (a completar)"
                            : `${ata.itens.length} ${ata.itens.length === 1 ? "item" : "itens"}`}
                        </span>
                      </p>
                      {ata.documentos.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          {ata.documentos.map((doc) => (
                            <a
                              key={doc.id}
                              href={`/api/documentos/${doc.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
                              style={{ color: "var(--cor-marca-clara)" }}
                            >
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <path
                                  d="M13.5 7.6 8.2 12.9a3.4 3.4 0 0 1-4.8-4.8l5.6-5.6a2.3 2.3 0 0 1 3.2 3.2L6.6 11.3a1.1 1.1 0 0 1-1.6-1.6l5-5"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              {doc.nomeArquivo}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {etapaDaVez(ata.id) === 4 && (
                        <Link href={`/admin/atas/${ata.id}/contrato`} className="botao-atas">
                          Cadastrar o contrato
                        </Link>
                      )}
                      {etapaDaVez(ata.id) === 5 && (
                        <Link href={`/admin/atas/${ata.id}/analise`} className="botao-atas">
                          Conferir a conformidade
                        </Link>
                      )}
                      {etapaDaVez(ata.id) === 6 && (
                        <Link href={`/admin/atas/${ata.id}/analise`} className="botao-atas">
                          Analisar e aprovar
                        </Link>
                      )}
                      {podeAprovar && (
                        <form action={rejeitarAta}>
                          <input type="hidden" name="ataId" value={ata.id} />
                          <button type="submit" className="botao-atas critico">
                            Rejeitar
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Secao>
      </div>
      )}

      {verFinanceiro && (
      <section className="flex flex-col gap-3">
        <h2
          className="marca text-[17px]"
          style={{ color: "var(--cor-texto)", fontWeight: 800, letterSpacing: "-0.025em" }}
        >
          Canal de autoatendimento (órgãos)
        </h2>
        <FaixaNumeros
          itens={[
            { valor: totalAtas, rotulo: "Atas aprovadas" },
            { valor: saldoTotalDisponivel.toLocaleString("pt-BR"), rotulo: "Saldo total disponível" },
            { valor: atasComAdesao, rotulo: "Atas com adesão", nota: `de ${totalAtas} aprovadas` },
            {
              valor: taxaConversao === null ? "—" : `${taxaConversao}%`,
              rotulo: "Taxa de conversão",
              nota: "atas aprovadas que já fecharam ao menos 1 adesão",
              tom: taxaConversao !== null && taxaConversao > 0 ? "marca" : undefined,
            },
          ]}
        />
        <FaixaNumeros
          itens={[
            { valor: pedidosFaturados, rotulo: "Contratos faturados", tom: "marca" },
            {
              valor: pedidosEmAndamento,
              rotulo: "Pedidos em andamento",
              tom: pedidosEmAndamento > 0 ? "atencao" : undefined,
            },
            {
              valor: <Cifra valor={totalAReceber} />,
              rotulo: "Total a receber",
              tom: totalAReceber > 0 ? "atencao" : undefined,
            },
            { valor: <Cifra valor={totalRecebido} />, rotulo: "Total recebido" },
          ]}
        />
      </section>
      )}
    </AppShell>
  );
}
