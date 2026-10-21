import Link from "next/link";
import { redirect } from "next/navigation";
import { orgaoIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROTULO_ESTAGIO, atorEsperado } from "@/lib/adesao";
import { tomEstagioAdesao } from "@/lib/severidade";
import type { EstagioAdesao } from "@/generated/prisma/enums";
import { logoutOrgao } from "./actions";
import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { FaixaNumeros } from "@/components/ui/faixa-numeros";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { Numero } from "@/components/ui/valores";
import { codigoPublico } from "@/lib/site/regras";

export const dynamic = "force-dynamic";

/** Como o andamento da demanda aparece para o órgão. */
const ROTULO_ANDAMENTO: Record<string, string> = {
  nova: "Recebido",
  em_busca: "Em análise pela equipe",
  respondida: "Respondido pela equipe",
  descartada: "Encerrado",
};

export default async function PainelOrgaoPage() {
  const orgaoId = await orgaoIdLogado();
  if (!orgaoId) {
    redirect("/orgao/login");
  }

  const orgao = await prisma.orgao.findUnique({
    where: { id: orgaoId },
    include: {
      adesoes: {
        include: { item: { include: { ata: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!orgao) {
    redirect("/orgao/login");
  }

  // Pedidos de adesão enviados pela página da ata (a equipe confere itens e saldo).
  const enviados = await prisma.demandaSemAta.findMany({
    where: { orgaoId, tipo: "pedido_adesao" },
    orderBy: { criadoEm: "desc" },
    select: { id: true, ataId: true, objeto: true, status: true, criadoEm: true },
  });

  const precisamDeAcao = orgao.adesoes.filter((a) => atorEsperado(a.estagio) === "orgao");
  const outros = orgao.adesoes.filter((a) => atorEsperado(a.estagio) !== "orgao");

  return (
    <AppShell
      area="Órgão comprador"
      itens={[
        { rotulo: "Meus pedidos", href: "/orgao" },
        { rotulo: "Catálogo", href: "/catalogo" },
        { rotulo: "Perfil", href: "/orgao/perfil" },
      ]}
      rodape={
        <form action={logoutOrgao}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Painel do órgão"
        titulo="Meus pedidos"
        destaque="de adesão"
        descricao={orgao.nome}
        acoes={
          orgao.adesoes.length > 0 ? (
            <Link href="/catalogo" className="botao-atas">
              Buscar itens no catálogo
            </Link>
          ) : undefined
        }
      />

      {enviados.length > 0 ? (
        <Secao
          titulo={`Pedidos enviados à equipe (${enviados.length})`}
          descricao="A equipe da Central confere itens e saldo, monta o pedido e responde pelo contato que você informou."
        >
          <ul className="lista-linhas">
            {enviados.map((e) => (
              <li key={e.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="titulo-linha">
                    {e.ataId ? (
                      <Link href={`/catalogo/${e.ataId}`} className="hover:text-[var(--cor-marca-clara)]">
                        Ata {codigoPublico(e.ataId)}
                      </Link>
                    ) : (
                      "Pedido"
                    )}
                  </span>
                  <Badge tom="neutro">{ROTULO_ANDAMENTO[e.status] ?? e.status}</Badge>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
                  {e.objeto.length > 140 ? `${e.objeto.slice(0, 140)}…` : e.objeto}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  Enviado em {e.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </p>
              </li>
            ))}
          </ul>
        </Secao>
      ) : null}

      {orgao.adesoes.length === 0 ? (
        enviados.length > 0 ? null : (
          <VazioComAcao
            titulo="Nenhum pedido ainda"
            descricao="Escolha uma ata no catálogo público e peça a adesão."
            acao={
              <Link href="/catalogo" className="botao-atas">
                Ver o catálogo
              </Link>
            }
          />
        )
      ) : (
        <>
          <FaixaNumeros
            itens={[
              { valor: orgao.adesoes.length, rotulo: orgao.adesoes.length === 1 ? "Pedido de adesão" : "Pedidos de adesão" },
              {
                valor: precisamDeAcao.length,
                rotulo: "Precisa da sua ação",
                tom: precisamDeAcao.length > 0 ? "atencao" : undefined,
              },
              { valor: outros.length, rotulo: "Outros pedidos" },
            ]}
          />

          <Secao
            titulo={`Precisa da sua ação (${precisamDeAcao.length})`}
            descricao="Estimativa por estágio — qualquer um dos dois lados ainda pode avançar qualquer pedido, isto é só um guia de prioridade."
            destaque
          >
            {precisamDeAcao.length === 0 ? (
              <VazioComAcao
                titulo="Nada esperando por você agora"
                descricao="Os pedidos em andamento estão com o fornecedor ou com terceiros."
              />
            ) : (
              <TabelaDePedidos adesoes={precisamDeAcao} />
            )}
          </Secao>

          <Secao titulo={`Outros pedidos (${outros.length})`}>
            {outros.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                Nenhum outro pedido em andamento.
              </p>
            ) : (
              <TabelaDePedidos adesoes={outros} />
            )}
          </Secao>
        </>
      )}
    </AppShell>
  );
}

type AdesaoComRelacoes = {
  id: string;
  estagio: EstagioAdesao;
  quantidadeSolicitada: number;
  item: {
    descricao: string;
    unidade: string;
    ata: { id: string };
  };
};

function TabelaDePedidos({ adesoes }: { adesoes: AdesaoComRelacoes[] }) {
  return (
    <div className="overflow-x-auto rounded-[12px] border" style={{ borderColor: "var(--cor-borda)" }}>
      <table className="tabela-atas min-w-[640px]">
        <thead>
          <tr>
            <th>Item</th>
            <th className="text-right">Quantidade</th>
            <th>Estágio</th>
            <th className="w-[1%]"></th>
          </tr>
        </thead>
        <tbody>
          {adesoes.map((adesao) => (
            <tr key={adesao.id}>
              <td>
                <Link
                  href={`/adesoes/${adesao.id}`}
                  className="block font-bold tracking-[-0.01em] text-[var(--cor-texto)] transition-colors hover:text-[var(--cor-marca-clara)]"
                >
                  {adesao.item.descricao}
                </Link>
                <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  Ata {codigoPublico(adesao.item.ata.id)}
                </span>
              </td>
              <td className="whitespace-nowrap text-right" style={{ color: "var(--cor-texto)" }}>
                <Numero>
                  {adesao.quantidadeSolicitada} {adesao.item.unidade}
                </Numero>
              </td>
              <td>
                <Badge tom={tomEstagioAdesao(adesao.estagio)}>{ROTULO_ESTAGIO[adesao.estagio]}</Badge>
              </td>
              <td className="whitespace-nowrap text-right">
                <Link href={`/adesoes/${adesao.id}`} className="botao-atas link">
                  Ver →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
