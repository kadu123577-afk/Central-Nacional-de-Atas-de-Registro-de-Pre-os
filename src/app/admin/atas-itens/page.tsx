import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { etapaPorNumero, situacaoDoPrazo, textoDoPrazo } from "@/lib/ciclo-ata";
import { carregarAtasEmAndamento } from "@/lib/ciclo-ata-db";
import { carregarFeriadosExtras } from "@/lib/feriados-db";
import { linkPncpDaAta } from "@/lib/link-pncp";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";
import { diaBrasilia } from "@/lib/radar-atas-view";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Badge, type Tom } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";

export const dynamic = "force-dynamic";

const TOM_DO_PRAZO: Record<"ok" | "hoje" | "atrasado", Tom> = { ok: "neutro", hoje: "atencao", atrasado: "critico" };
const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;

/**
 * Itens das atas (2026-11-14): a tela do estagiário (atividade 3 do workflow). O captador cadastra a
 * ata e anexa o documento; aqui o estagiário vê, uma linha por ata, o que está esperando os itens e os
 * saldos, com o prazo em dias úteis, e abre cada uma para importar o Excel ou o PDF (ou digitar).
 * Só aparece a ata que chegou à etapa 3 (a empresa já confirmada e ainda sem itens). Exige "atas.itens".
 */
export default async function ItensDasAtasPage() {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "atas.itens");

  const agora = new Date();
  const etapa = etapaPorNumero(3)!;
  const [emAndamento, feriados] = await Promise.all([carregarAtasEmAndamento(), carregarFeriadosExtras()]);
  const esperando = emAndamento.filter((a) => a.situacao.etapaAtual === 3);

  const [detalhes, recentes] = await Promise.all([
    esperando.length
      ? prisma.ata.findMany({
          where: { id: { in: esperando.map((a) => a.id) } },
          select: {
            id: true,
            dataVigenciaFim: true,
            linkPncp: true,
            numeroControlePncp: true,
            orgaoGerenciador: { select: { nome: true, uf: true, municipio: true } },
            _count: { select: { documentos: true } },
          },
        })
      : Promise.resolve([]),
    prisma.ata.findMany({
      where: { status: { not: "REJEITADA" }, itens: { some: {} } },
      orderBy: { updatedAt: "desc" },
      take: 15,
      select: {
        id: true,
        numero: true,
        fornecedor: { select: { razaoSocial: true } },
        orgaoGerenciador: { select: { nome: true } },
        _count: { select: { itens: true } },
      },
    }),
  ]);
  const detalheDe = new Map(detalhes.map((d) => [d.id, d]));

  const linhas = esperando.map((a) => {
    const atual = a.situacao.etapas.find((e) => e.atual);
    const prazo = atual?.desde ? situacaoDoPrazo(etapa, atual.desde, agora, feriados) : null;
    return { ata: a, desde: atual?.desde ?? null, prazo, detalhe: detalheDe.get(a.id) };
  });
  const atrasadas = linhas.filter((l) => l.prazo?.tom === "atrasado").length;

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
        rotulo="Itens e saldos"
        titulo="Itens das"
        destaque="atas"
        descricao={`O captador cadastrou a ata e anexou o documento. Cadastre os itens e os saldos de cada uma: importe o Excel ou o PDF, ou digite. Prazo de ${etapa.prazoDiasUteis} ${etapa.prazoDiasUteis === 1 ? "dia útil" : "dias úteis"} por ata.`}
      />

      <FaixaNumeros
        itens={[
          { valor: linhas.length, rotulo: "Esperando itens", tom: linhas.length > 0 ? "marca" : undefined },
          {
            valor: atrasadas,
            rotulo: "Com prazo vencido",
            nota: atrasadas > 0 ? "passaram dos dias úteis" : "nenhuma atrasada",
            tom: atrasadas > 0 ? "atencao" : undefined,
          },
          { valor: recentes.length, rotulo: "Já com itens", nota: "as últimas movimentadas" },
        ]}
      />

      <Secao titulo={`Esperando itens (${linhas.length})`} destaque>
        {linhas.length === 0 ? (
          <VazioComAcao
            titulo="Nenhuma ata esperando itens"
            descricao="Quando o captador cadastrar uma ata, ela aparece aqui para você cadastrar os itens e os saldos."
          />
        ) : (
          <div className="moldura-tabela">
            <table className="tabela-atas min-w-[820px]">
              <thead>
                <tr>
                  <th>Ata</th>
                  <th>Empresa</th>
                  <th>Órgão</th>
                  <th>Chegou em</th>
                  <th>Prazo</th>
                  <th>Documento</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ ata, desde, prazo, detalhe }) => {
                  const linkPncp = detalhe ? linkPncpDaAta(detalhe) : null;
                  return (
                    <tr key={ata.id}>
                      <td className="align-top">
                        <span className="codigo">{ata.numero}</span>
                        <span className="block max-w-[320px] truncate text-xs" style={COR_SECUNDARIA} title={ata.objeto}>
                          {ata.objeto}
                        </span>
                      </td>
                      <td className="align-top">{ata.fornecedor}</td>
                      <td className="align-top">
                        {detalhe ? (
                          <>
                            {detalhe.orgaoGerenciador.nome}
                            <span className="block text-xs" style={COR_SECUNDARIA}>
                              {detalhe.orgaoGerenciador.municipio}/{detalhe.orgaoGerenciador.uf}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="align-top">{desde ? diaBrasilia(desde) : "—"}</td>
                      <td className="align-top">{prazo && <Badge tom={TOM_DO_PRAZO[prazo.tom]}>{textoDoPrazo(prazo)}</Badge>}</td>
                      <td className="align-top text-[13px]">
                        {detalhe && detalhe._count.documentos > 0 ? (
                          <span>{detalhe._count.documentos} anexado(s)</span>
                        ) : (
                          <span style={COR_SECUNDARIA}>nenhum</span>
                        )}
                        {linkPncp && (
                          <a
                            href={linkPncp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="botao-atas link mt-0.5 block text-[12.5px]"
                          >
                            ata no PNCP →<span className="sr-only"> (abre em nova aba)</span>
                          </a>
                        )}
                      </td>
                      <td className="align-top text-right whitespace-nowrap">
                        <Link href={`/admin/atas/${ata.id}/itens`} className="botao-atas">
                          Cadastrar os itens
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {recentes.length > 0 && (
        <Secao titulo="Já com itens" descricao="As últimas atas movimentadas. Abra uma para conferir ou acrescentar itens.">
          <ul className="lista-linhas text-[14px]">
            {recentes.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="codigo">{a.numero}</span> · {a.fornecedor.razaoSocial}
                  <span className="block text-xs" style={COR_SECUNDARIA}>
                    {a.orgaoGerenciador.nome} · {a._count.itens} item(ns)
                  </span>
                </span>
                <Link href={`/admin/atas/${a.id}/itens`} className="botao-atas link">
                  Ver os itens
                </Link>
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </AppShell>
  );
}
