import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { adminIdLogado } from "@/lib/auth";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../actions";
import { NAV_ADMIN } from "../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import {
  COR_ESTAGIO_CAPTACAO,
  ESTAGIOS_ABERTOS_CAPTACAO,
  ESTAGIOS_CAPTACAO,
  EXPLICACAO_ESTAGIO_CAPTACAO,
  ROTULO_ESTAGIO_CAPTACAO,
} from "@/lib/captacao";
import { hojeBrasilia, LIMITE_CARTOES_POR_COLUNA } from "@/lib/radar-atas-view";
import { CartaoCaptacao, type DadosCartaoCaptacao } from "./cartao-captacao";

export const dynamic = "force-dynamic";

/**
 * Captação de atas (2026-11-14): o Kanban do captador. Um cartão por ata que a Central quer trazer
 * para dentro do sistema, vinda do Radar de atas (botão "Captar") ou de um contato do próprio
 * captador (cadastro manual). O cartão anda de Identificada até Fechada, que só acontece quando
 * a ata é cadastrada no sistema. "Só os meus" mostra o que cada captador assumiu.
 */
export default async function CaptacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "atas.captar");

  const params = await searchParams;
  const soMeus = params.so === "meus";
  const ataCriada = params.ataCriada === "1";
  const agora = new Date();

  const filtroDono: Prisma.CaptacaoWhereInput = soMeus ? { responsavelId: adminId } : {};

  const [contagens, vencidos, ...colunas] = await Promise.all([
    prisma.captacao.groupBy({ by: ["estagio"], where: filtroDono, _count: { _all: true } }),
    prisma.captacao.count({
      where: { ...filtroDono, estagio: { in: [...ESTAGIOS_ABERTOS_CAPTACAO] }, proximoContatoEm: { lt: hojeBrasilia(agora) } },
    }),
    ...ESTAGIOS_CAPTACAO.map((estagio) =>
      prisma.captacao.findMany({
        where: { ...filtroDono, estagio },
        // Quem tem contato marcado vem primeiro (o mais próximo no topo); depois, o mexido há menos tempo.
        orderBy: [{ proximoContatoEm: { sort: "asc", nulls: "last" } }, { atualizadoEm: "desc" }],
        take: LIMITE_CARTOES_POR_COLUNA,
        select: {
          id: true,
          nome: true,
          origem: true,
          estagio: true,
          fornecedorCnpj: true,
          fornecedorNome: true,
          orgaoNome: true,
          uf: true,
          municipioNome: true,
          categoria: true,
          vigenciaFim: true,
          responsavelId: true,
          proximoContatoEm: true,
          observacoes: true,
          motivoPerda: true,
        },
      }),
    ),
  ]);

  const donos = [...new Set(colunas.flat().map((c) => c.responsavelId).filter((x): x is string => Boolean(x)))];
  const nomes = new Map(
    (donos.length ? await prisma.admin.findMany({ where: { id: { in: donos } }, select: { id: true, nome: true } }) : []).map(
      (a) => [a.id, a.nome],
    ),
  );

  const total = (e: string) => contagens.find((c) => c.estagio === e)?._count._all ?? 0;
  const emAndamento = ESTAGIOS_ABERTOS_CAPTACAO.reduce((soma, e) => soma + total(e), 0);
  const geral = ESTAGIOS_CAPTACAO.reduce((soma, e) => soma + total(e), 0);

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-7xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Atas"
        titulo="Captação de"
        destaque="atas"
        descricao="Cada cartão é uma ata que queremos trazer para a Central. Ela chega pelo Radar de atas ou por um contato seu. Abra o cartão para ver a empresa, falar com ela, registrar o que foi combinado e, quando fechar, cadastrar a ata."
        acoes={
          <>
            <Link href="/admin/captacao/nova" className="botao-atas">
              Nova ata (indicação)
            </Link>
            <Link href="/admin/radar-atas" className="botao-atas secundario">
              Ver o radar de atas
            </Link>
          </>
        }
      />

      {ataCriada && (
        <Aviso tom="sucesso" titulo="Ata cadastrada.">
          Ela segue o ciclo: itens e saldos (estagiário), contrato de intermediação, conformidade e aprovação.
        </Aviso>
      )}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quais cartões mostrar">
        <Link href="/admin/captacao" className={soMeus ? "botao-atas secundario pequeno" : "botao-atas pequeno"} aria-current={soMeus ? undefined : "true"}>
          Todos
        </Link>
        <Link href="/admin/captacao?so=meus" className={soMeus ? "botao-atas pequeno" : "botao-atas secundario pequeno"} aria-current={soMeus ? "true" : undefined}>
          Só os meus
        </Link>
      </div>

      <FaixaNumeros
        itens={[
          { valor: emAndamento, rotulo: "Em andamento", nota: "identificadas, em contato ou interessadas" },
          {
            valor: vencidos,
            rotulo: "Com contato vencido",
            nota: vencidos > 0 ? "a data marcada já passou" : "nenhuma pendente",
            tom: vencidos > 0 ? "atencao" : undefined,
          },
          { valor: total("fechada"), rotulo: "Fechadas", nota: "ata cadastrada no sistema", tom: total("fechada") > 0 ? "marca" : undefined },
          { valor: total("perdida"), rotulo: "Não deu", nota: "recusou ou sem retorno" },
        ]}
      />

      {geral === 0 ? (
        <Secao titulo="Quadro de captação" destaque>
          <VazioComAcao
            titulo={soMeus ? "Você ainda não assumiu nenhuma ata" : "Nenhuma ata em captação ainda"}
            descricao="Escolha uma ata no Radar de atas e clique em “Captar”, ou cadastre uma ata que você achou por um contato seu."
            acao={
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/admin/radar-atas" className="botao-atas secundario">
                  Ver o radar de atas
                </Link>
                <Link href="/admin/captacao/nova" className="botao-atas">
                  Nova ata (indicação)
                </Link>
              </div>
            }
          />
        </Secao>
      ) : (
        <div className="kb-quadro" data-rolagem="true" style={{ gridTemplateColumns: "repeat(5, minmax(235px, 1fr))" }}>
          {ESTAGIOS_CAPTACAO.map((estagio, i) => {
            const cartoes: DadosCartaoCaptacao[] = colunas[i].map((c) => ({
              id: c.id,
              nome: c.nome,
              origem: c.origem,
              estagio: c.estagio,
              fornecedorCnpj: c.fornecedorCnpj,
              fornecedorNome: c.fornecedorNome,
              orgaoNome: c.orgaoNome,
              uf: c.uf,
              municipioNome: c.municipioNome,
              categoria: c.categoria,
              vigenciaFim: c.vigenciaFim,
              responsavelNome: c.responsavelId ? (nomes.get(c.responsavelId) ?? null) : null,
              proximoContatoEm: c.proximoContatoEm,
              observacoes: c.observacoes,
              motivoPerda: c.motivoPerda,
            }));
            const n = total(estagio);
            return (
              <section key={estagio} aria-label={ROTULO_ESTAGIO_CAPTACAO[estagio]}>
                <div className="kb-col-topo">
                  <div className="kb-col-titulo">
                    <i className="kb-ponto" style={{ background: COR_ESTAGIO_CAPTACAO[estagio] }} />
                    {ROTULO_ESTAGIO_CAPTACAO[estagio]}
                    <span className="kb-contagem numero">{n}</span>
                  </div>
                </div>
                <p className="mb-2.5 px-0.5 text-xs leading-snug" style={{ color: "var(--cor-texto-3)" }}>
                  {EXPLICACAO_ESTAGIO_CAPTACAO[estagio]}
                </p>
                {n > cartoes.length && (
                  <Aviso tom="atencao" className="mb-2.5">
                    Mostrando {cartoes.length} de {n}. Quem tem contato marcado vem primeiro. Mova alguns para ver os demais.
                  </Aviso>
                )}
                <ul className="kb-lista-cartoes">
                  {cartoes.length === 0 ? (
                    <li className="kb-coluna-vazia">Nenhuma ata aqui</li>
                  ) : (
                    cartoes.map((c) => <CartaoCaptacao key={c.id} cartao={c} agora={agora} />)
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
