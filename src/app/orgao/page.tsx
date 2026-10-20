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

export const dynamic = "force-dynamic";

export default async function PainelOrgaoPage() {
  const orgaoId = await orgaoIdLogado();
  if (!orgaoId) {
    redirect("/orgao/login");
  }

  const orgao = await prisma.orgao.findUnique({
    where: { id: orgaoId },
    include: {
      adesoes: {
        include: { item: { include: { ata: { include: { fornecedor: true } } } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!orgao) {
    redirect("/orgao/login");
  }

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

      {orgao.adesoes.length === 0 ? (
        <VazioComAcao
          titulo="Nenhum pedido ainda"
          descricao="Busque um item no catálogo público e peça adesão."
          acao={
            <Link href="/catalogo" className="botao-atas">
              Buscar itens no catálogo
            </Link>
          }
        />
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
    ata: { numero: string; fornecedor: { razaoSocial: string } };
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
                  Ata <span className="codigo">Nº {adesao.item.ata.numero}</span> · {adesao.item.ata.fornecedor.razaoSocial}
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
