import Link from "next/link";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
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
  COR_ESTAGIO_PROSPECCAO,
  ESTAGIOS_PROSPECCAO,
  ROTULO_ESTAGIO_PROSPECCAO,
  resumirFunil,
  type EstagioProspeccao,
} from "@/lib/radar-atas";
import {
  ESTAGIOS_EM_CONTATO,
  filtroContatoVencido,
  LIMITE_CARTOES_POR_COLUNA,
  listaDeCsv,
} from "@/lib/radar-atas-view";
import { CartaoProspeccao, type DadosCartaoProspeccao } from "./cartao-prospeccao";

export const dynamic = "force-dynamic";

/**
 * Explicação curta de cada coluna, para a equipe saber quando um fornecedor
 * deve estar nela (a regra de passagem é um passo de cada vez).
 */
const EXPLICACAO_ESTAGIO: Record<EstagioProspeccao, string> = {
  identificado: "Achado nas atas do radar; ninguém falou com ele ainda.",
  contatado: "A equipe já fez o primeiro contato.",
  interessado: "Respondeu e quer conhecer a rede.",
  credenciado: "Entrou na rede.",
  recusou: "Disse que não. Pode voltar para Identificado se mudar de ideia.",
};

/**
 * Funil de prospecção de fornecedores (Projeto RNA, etapa 5, 2026-10-22): os
 * donos das atas do radar de atas, para a equipe trazê-los para a rede. O
 * script scripts/inteligencia/gerar-radar-atas.ts cria e atualiza os cartões
 * (atas vigentes, pontuação, categorias e UFs); a equipe move cada um de
 * estágio e anota o próximo contato. O script nunca muda estágio nem
 * observações. Só empresa (CNPJ): nada de CPF nem de contato de pessoa.
 */
export default async function ProspeccaoFornecedoresPage() {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const agora = new Date();

  const [contagens, vencidos, ...colunas] = await Promise.all([
    prisma.prospeccaoFornecedor.groupBy({ by: ["estagio"], _count: { _all: true } }),
    // Mesma regra do painel: contatado ou interessado com próximo contato em data anterior a hoje.
    prisma.prospeccaoFornecedor.count({ where: filtroContatoVencido(agora) }),
    ...ESTAGIOS_PROSPECCAO.map((estagio) =>
      prisma.prospeccaoFornecedor.findMany({
        where: { estagio },
        // Quem tem contato marcado vem primeiro (o mais próximo no topo); depois, pela pontuação.
        orderBy: [{ proximoContatoEm: { sort: "asc", nulls: "last" } }, { pontuacao: "desc" }, { razaoSocial: "asc" }],
        take: LIMITE_CARTOES_POR_COLUNA,
        select: {
          id: true,
          cnpj: true,
          razaoSocial: true,
          estagio: true,
          atasVigentes: true,
          pontuacao: true,
          categorias: true,
          ufs: true,
          proximoContatoEm: true,
          observacoes: true,
        },
      }),
    ),
  ]);

  const resumo = resumirFunil(contagens.map((c) => ({ estagio: c.estagio, quantidade: c._count._all })));
  const emContato = ESTAGIOS_EM_CONTATO.reduce((soma, e) => soma + resumo.porEstagio[e], 0);

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
        rotulo="Rede"
        titulo="Prospecção de"
        destaque="fornecedores"
        descricao="Os fornecedores donos das atas do radar, para a equipe trazê-los para a rede. Mova cada um de estágio, de um passo por vez, e marque quando falar de novo."
        acoes={
          <Link href="/admin/radar-atas" className="botao-atas secundario">
            Ver o radar de atas
          </Link>
        }
      />

      <FaixaNumeros
        itens={[
          { valor: resumo.total, rotulo: "Fornecedores no funil" },
          {
            valor: emContato,
            rotulo: "Em contato",
            nota: vencidos > 0 ? `${vencidos} com contato vencido` : "contatados ou interessados",
            tom: vencidos > 0 ? "atencao" : undefined,
          },
          { valor: resumo.porEstagio.credenciado, rotulo: "Credenciados", tom: resumo.porEstagio.credenciado > 0 ? "marca" : undefined },
          {
            valor: `${resumo.percentualCredenciados.toLocaleString("pt-BR")}%`,
            rotulo: "Taxa de credenciamento",
            nota: "credenciados sobre o total do funil",
          },
        ]}
      />

      {resumo.total === 0 ? (
        <Secao titulo="Funil" destaque>
          <VazioComAcao
            titulo="Nenhum fornecedor no funil ainda"
            descricao="Os fornecedores entram aqui a partir do radar de atas: quando o script que gera o radar roda, cada empresa dona de uma ata candidata vira um cartão em “Identificado”. Antes disso, não há o que acompanhar."
            acao={
              <div className="flex flex-col items-center gap-3">
                <Link href="/admin/radar-atas" className="botao-atas secundario">
                  Ver o radar de atas
                </Link>
                <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  Rotina: <span className="codigo break-all">npx tsx scripts/inteligencia/gerar-radar-atas.ts</span>
                </p>
              </div>
            }
          />
        </Secao>
      ) : (
        <div className="kb-quadro" data-rolagem="true" style={{ gridTemplateColumns: "repeat(5, minmax(260px, 1fr))" }}>
          {ESTAGIOS_PROSPECCAO.map((estagio, i) => {
            const cartoes: DadosCartaoProspeccao[] = colunas[i].map((f) => ({
              id: f.id,
              cnpj: f.cnpj,
              razaoSocial: f.razaoSocial,
              estagio: f.estagio,
              atasVigentes: f.atasVigentes,
              pontuacao: f.pontuacao,
              categorias: listaDeCsv(f.categorias),
              ufs: listaDeCsv(f.ufs),
              proximoContatoEm: f.proximoContatoEm,
              observacoes: f.observacoes,
            }));
            const total = resumo.porEstagio[estagio];
            return (
              <section key={estagio} aria-label={ROTULO_ESTAGIO_PROSPECCAO[estagio]}>
                <div className="kb-col-topo">
                  <div className="kb-col-titulo">
                    <i className="kb-ponto" style={{ background: COR_ESTAGIO_PROSPECCAO[estagio] }} />
                    {ROTULO_ESTAGIO_PROSPECCAO[estagio]}
                    <span className="kb-contagem numero">{total}</span>
                  </div>
                </div>
                <p className="mb-2.5 px-0.5 text-xs leading-snug" style={{ color: "var(--cor-texto-3)" }}>
                  {EXPLICACAO_ESTAGIO[estagio]}
                </p>
                {total > cartoes.length && (
                  <Aviso tom="atencao" className="mb-2.5">
                    Mostrando {cartoes.length} de {total}. Quem tem contato marcado vem primeiro, depois os de maior
                    pontuação. Mova alguns para ver os demais.
                  </Aviso>
                )}
                <ul className="kb-lista-cartoes">
                  {cartoes.length === 0 ? (
                    <li className="kb-coluna-vazia">Nenhum fornecedor aqui</li>
                  ) : (
                    cartoes.map((c) => <CartaoProspeccao key={c.id} fornecedor={c} agora={agora} />)
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
