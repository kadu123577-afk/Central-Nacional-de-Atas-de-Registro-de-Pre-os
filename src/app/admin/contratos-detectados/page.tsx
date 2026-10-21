import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { NIVEIS_VINCULO, ROTULO_NIVEL_VINCULO } from "@/lib/acompanhamento";
import {
  EXPLICACAO_NIVEL,
  distribuirLimite,
  paraNumero,
  rotuloDoNivel,
  tomDoNivel,
} from "@/lib/acompanhamento-view";
import { LinhaVinculoSugerido, type DadosVinculoSugerido } from "./linha-vinculo";
import { TabelaAditivos, type DadosAditivo } from "./tabela-aditivos";
import { TabelaDecididos, type DadosVinculoDecidido } from "./tabela-decididos";
import type { DadosContrato } from "./bloco-contrato";

export const dynamic = "force-dynamic";

/** Teto de itens por seção (a lista "Já decididos" mostra só as últimas 30). */
const LIMITE_POR_SECAO = 200;
const LIMITE_DECIDIDOS = 30;

const INCLUIR_CONTRATO = {
  contrato: { include: { entidadeAlvo: { select: { nome: true, uf: true } } } },
} as const;

/** Aditivo ainda sem decisão, de contrato cujo vínculo o gestor já confirmou. */
const ADITIVOS_A_ACOMPANHAR = {
  cobrancaStatus: "a_acompanhar",
  contrato: { vinculo: { status: "confirmado" } },
} as const;

async function buscarSugeridos(nivel: string, quantidade: number) {
  if (quantidade <= 0) return [];
  return prisma.vinculoContrato.findMany({
    where: { status: "sugerido", nivel },
    // Contratos maiores primeiro: é onde a comissão pesa mais.
    orderBy: [{ contrato: { valorGlobal: { sort: "desc", nulls: "last" } } }, { criadoEm: "desc" }],
    take: quantidade,
    include: {
      ...INCLUIR_CONTRATO,
      ata: { select: { id: true, numero: true } },
      oportunidade: { select: { estagio: true, vendedor: { select: { nome: true } } } },
    },
  });
}

async function buscarAditivos(quantidade: number) {
  if (quantidade <= 0) return [];
  return prisma.termoContratoPublico.findMany({
    where: ADITIVOS_A_ACOMPANHAR,
    orderBy: { criadoEm: "desc" },
    take: quantidade,
    include: {
      contrato: {
        include: {
          entidadeAlvo: { select: { nome: true, uf: true } },
          vinculo: { select: { oportunidade: { select: { vendedor: { select: { nome: true } } } } } },
        },
      },
    },
  });
}

async function buscarDecididos(quantidade: number) {
  return prisma.vinculoContrato.findMany({
    where: { status: { in: ["confirmado", "descartado"] } },
    orderBy: [{ decididoEm: { sort: "desc", nulls: "last" } }, { atualizadoEm: "desc" }],
    take: quantidade,
    include: INCLUIR_CONTRATO,
  });
}

type ContratoComMunicipio = Awaited<ReturnType<typeof buscarDecididos>>[number]["contrato"];

function dadosDoContrato(c: ContratoComMunicipio): DadosContrato {
  return {
    numeroControlePncp: c.numeroControlePncp,
    orgaoNome: c.orgaoNome,
    fornecedorNome: c.fornecedorNome,
    fornecedorCnpj: c.fornecedorCnpj,
    objeto: c.objeto,
    valorGlobal: paraNumero(c.valorGlobal),
    dataAssinatura: c.dataAssinatura,
    vigenciaInicio: c.vigenciaInicio,
    vigenciaFim: c.vigenciaFim,
  };
}

/**
 * Contratos detectados no PNCP (Projeto RNA, etapa 2, 2026-10-21): o script
 * scripts/inteligencia/acompanhar-contratos.ts liga contratos públicos ao
 * funil e grava cada ligação como "sugerida"; aqui o gestor confirma ou
 * descarta (a decisão dele nunca é sobrescrita pelo script) e acompanha os
 * aditivos dos contratos confirmados, que geram comissão em cascata.
 */
export default async function ContratosDetectadosPage() {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const [contagens, totalAditivos] = await Promise.all([
    prisma.vinculoContrato.groupBy({ by: ["status", "nivel"], _count: { _all: true } }),
    prisma.termoContratoPublico.count({ where: ADITIVOS_A_ACOMPANHAR }),
  ]);

  const contar = (status: string, nivel?: string) =>
    contagens
      .filter((c) => c.status === status && (nivel === undefined || c.nivel === nivel))
      .reduce((soma, c) => soma + c._count._all, 0);

  const sugeridosPorNivel = NIVEIS_VINCULO.map((nivel) => contar("sugerido", nivel));
  const totalSugeridos = sugeridosPorNivel.reduce((soma, n) => soma + n, 0);
  const totalConfirmados = contar("confirmado");
  const totalDescartados = contar("descartado");
  const totalVinculos = contagens.reduce((soma, c) => soma + c._count._all, 0);
  const desvios = sugeridosPorNivel[NIVEIS_VINCULO.indexOf("desvio")];

  const quantidades = distribuirLimite(sugeridosPorNivel, LIMITE_POR_SECAO);
  const mostradosSugeridos = quantidades.reduce((soma, n) => soma + n, 0);

  const [lotes, aditivos, decididos] = await Promise.all([
    Promise.all(NIVEIS_VINCULO.map((nivel, i) => buscarSugeridos(nivel, quantidades[i]))),
    buscarAditivos(LIMITE_POR_SECAO),
    totalConfirmados + totalDescartados > 0 ? buscarDecididos(LIMITE_DECIDIDOS) : Promise.resolve([]),
  ]);

  const idsAdmins = [...new Set(decididos.map((d) => d.decididoPorId).filter((id): id is string => !!id))];
  const admins = idsAdmins.length
    ? await prisma.admin.findMany({ where: { id: { in: idsAdmins } }, select: { id: true, nome: true } })
    : [];
  const nomeDoAdmin = new Map(admins.map((a) => [a.id, a.nome]));

  const gruposSugeridos = NIVEIS_VINCULO.map((nivel, i) => ({
    nivel,
    total: sugeridosPorNivel[i],
    linhas: lotes[i].map(
      (v): DadosVinculoSugerido => ({
        id: v.id,
        nivel: v.nivel,
        motivo: v.motivo,
        contrato: dadosDoContrato(v.contrato),
        municipio: v.contrato.entidadeAlvo,
        ata: v.ata,
        negociacao: v.oportunidade
          ? { vendedorNome: v.oportunidade.vendedor.nome, estagio: v.oportunidade.estagio }
          : null,
      }),
    ),
  })).filter((g) => g.linhas.length > 0);

  const linhasAditivos = aditivos.map(
    (t): DadosAditivo => ({
      id: t.id,
      tipo: t.tipo,
      descricao: t.descricao,
      valorAcrescido: paraNumero(t.valorAcrescido),
      novaVigenciaFim: t.novaVigenciaFim,
      detectadoEm: t.criadoEm,
      contrato: {
        numeroControlePncp: t.contrato.numeroControlePncp,
        orgaoNome: t.contrato.orgaoNome,
        objeto: t.contrato.objeto,
        valorGlobal: paraNumero(t.contrato.valorGlobal),
      },
      municipio: t.contrato.entidadeAlvo,
      vendedorNome: t.contrato.vinculo?.oportunidade?.vendedor.nome ?? null,
    }),
  );

  const linhasDecididos = decididos.map(
    (d): DadosVinculoDecidido => ({
      id: d.id,
      nivel: d.nivel,
      status: d.status,
      decididoPorNome: d.decididoPorId ? (nomeDoAdmin.get(d.decididoPorId) ?? null) : null,
      decididoEm: d.decididoEm,
      contrato: {
        numeroControlePncp: d.contrato.numeroControlePncp,
        orgaoNome: d.contrato.orgaoNome,
        objeto: d.contrato.objeto,
        valorGlobal: paraNumero(d.contrato.valorGlobal),
      },
      municipio: d.contrato.entidadeAlvo,
    }),
  );

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
      <CabecalhoPagina
        rotulo="Operação"
        titulo="Contratos"
        destaque="detectados"
        descricao="Contratos públicos do PNCP que o sistema ligou ao funil. Confirme o vínculo para passar a acompanhar os aditivos, ou descarte o que não tem relação."
      />

      <FaixaNumeros
        itens={[
          {
            valor: totalSugeridos,
            rotulo: "Contratos a confirmar",
            nota: desvios > 0 ? `${desvios} possível(is) desvio(s) do funil` : undefined,
            tom: totalSugeridos > 0 ? "atencao" : undefined,
          },
          { valor: totalConfirmados, rotulo: "Confirmados", tom: totalConfirmados > 0 ? "marca" : undefined },
          { valor: totalDescartados, rotulo: "Descartados" },
          {
            valor: totalAditivos,
            rotulo: "Aditivos a acompanhar",
            nota: "de contratos confirmados",
            tom: totalAditivos > 0 ? "atencao" : undefined,
          },
        ]}
      />

      {totalVinculos === 0 ? (
        <>
          <Secao titulo="Nenhum contrato detectado ainda" destaque>
            <VazioComAcao
              titulo="Ainda não há contratos ligados ao funil"
              descricao="Esta página é alimentada pelo script scripts/inteligencia/acompanhar-contratos.ts, que lê a coleta de contratos do PNCP e sugere os vínculos. Só aparece vínculo quando existem atas e fornecedores reais na rede: sem eles, não há o que ligar. Quando o script rodar, os contratos aparecem aqui para você confirmar ou descartar."
            />
          </Secao>

          <Secao titulo="Como o sistema liga um contrato ao funil" descricao="Três níveis, do vínculo mais firme ao mais fraco. O script só sugere; quem decide é você.">
            <ul className="lista-linhas">
              {NIVEIS_VINCULO.map((nivel) => (
                <li key={nivel} className="flex flex-col gap-1.5">
                  <span>
                    <Badge tom={tomDoNivel(nivel)}>{ROTULO_NIVEL_VINCULO[nivel]}</Badge>
                  </span>
                  <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
                    {EXPLICACAO_NIVEL[nivel]}
                  </p>
                </li>
              ))}
            </ul>
          </Secao>
        </>
      ) : (
        <>
          <Secao
            titulo={`A confirmar (${totalSugeridos})`}
            descricao="Decida um a um. Confirmar liga o contrato ao funil e passa a acompanhar os aditivos dele; descartar tira o contrato da fila. O script não altera uma decisão já tomada."
            destaque
          >
            <div className="flex flex-col gap-6">
              {totalSugeridos > mostradosSugeridos && (
                <Aviso tom="atencao">
                  Mostrando {mostradosSugeridos} de {totalSugeridos} contratos a confirmar, na ordem: citam a ata da
                  rede, em negociação e possíveis desvios. Decida alguns para ver os demais.
                </Aviso>
              )}

              {gruposSugeridos.length === 0 ? (
                <VazioComAcao
                  titulo="Nenhum contrato esperando decisão"
                  descricao="Quando o script sugerir novos vínculos, eles aparecem aqui."
                />
              ) : (
                gruposSugeridos.map((grupo) => {
                  const desvio = grupo.nivel === "desvio";
                  return (
                    <div
                      key={grupo.nivel}
                      className={desvio ? "rounded-[var(--raio-grande)] border p-4" : undefined}
                      style={
                        desvio
                          ? { borderColor: "var(--cor-atencao)", background: "var(--cor-atencao-fundo)" }
                          : undefined
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tom={tomDoNivel(grupo.nivel)}>{rotuloDoNivel(grupo.nivel)}</Badge>
                        <span className="numero text-xs" style={{ color: "var(--cor-texto-3)" }}>
                          {grupo.total} contrato(s)
                        </span>
                      </div>
                      <p className="mb-4 mt-2 text-[13px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
                        {EXPLICACAO_NIVEL[grupo.nivel]}
                      </p>
                      <ul className="lista-linhas">
                        {grupo.linhas.map((v) => (
                          <LinhaVinculoSugerido key={v.id} vinculo={v} />
                        ))}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>
          </Secao>

          <Secao
            titulo={`Aditivos a acompanhar (${totalAditivos})`}
            descricao={
              <>
                Aditivos de valor ou de prazo de contratos com vínculo confirmado. A comissão em cascata sobre aditivo é
                lançada como liquidação do tipo &ldquo;aditivo&rdquo; na tela de{" "}
                <Link
                  href="/admin/recebiveis-vendedores"
                  className="font-semibold hover:underline"
                  style={{ color: "var(--cor-marca-clara)" }}
                >
                  recebíveis
                </Link>
                . Depois de lançar lá, marque o aditivo aqui como lançado; se ele não gera comissão, marque sem comissão.
              </>
            }
          >
            <div className="flex flex-col gap-4">
              {totalAditivos > linhasAditivos.length && (
                <Aviso tom="atencao">
                  Mostrando os {linhasAditivos.length} aditivos mais recentes de {totalAditivos}. Trate alguns para ver
                  os demais.
                </Aviso>
              )}
              {linhasAditivos.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--cor-texto-3)" }}>
                  Nenhum aditivo a acompanhar. Eles aparecem quando um contrato com vínculo confirmado ganha aditivo de
                  valor ou de prazo no PNCP.
                </p>
              ) : (
                <TabelaAditivos aditivos={linhasAditivos} />
              )}
            </div>
          </Secao>

          <Secao
            titulo="Já decididos"
            descricao={`As últimas ${LIMITE_DECIDIDOS} decisões, só para consulta.`}
          >
            {linhasDecididos.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--cor-texto-3)" }}>
                Nenhuma decisão registrada ainda.
              </p>
            ) : (
              <TabelaDecididos decididos={linhasDecididos} />
            )}
          </Secao>
        </>
      )}
    </AppShell>
  );
}
