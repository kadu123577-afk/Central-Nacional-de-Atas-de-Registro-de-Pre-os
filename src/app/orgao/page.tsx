import Link from "next/link";
import { redirect } from "next/navigation";
import { orgaoIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROTULO_ESTAGIO, atorEsperado } from "@/lib/adesao";
import type { EstagioAdesao } from "@/generated/prisma/enums";
import { logoutOrgao } from "./actions";
import { AppShell } from "@/components/ui/app-shell";
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
      <div>
        <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
          Meus pedidos de adesão
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
          {orgao.nome}
        </p>
      </div>

      {enviados.length > 0 ? (
        <Secao titulo={`Pedidos enviados à equipe (${enviados.length})`}>
          <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
            A equipe da Central confere itens e saldo, monta o pedido e responde pelo contato que você
            informou.
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {enviados.map((e) => (
              <li key={e.id} className="painel p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium" style={{ color: "var(--cor-texto)" }}>
                    {e.ataId ? (
                      <Link href={`/catalogo/${e.ataId}`} className="underline">
                        Ata {codigoPublico(e.ataId)}
                      </Link>
                    ) : (
                      "Pedido"
                    )}
                  </span>
                  <span className="eyebrow">{ROTULO_ANDAMENTO[e.status] ?? e.status}</span>
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
          <Secao titulo={`Precisa da sua ação (${precisamDeAcao.length})`}>
            <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
              Estimativa por estágio — qualquer um dos dois lados ainda pode avançar qualquer
              pedido, isto é só um guia de prioridade.
            </p>
            {precisamDeAcao.length === 0 ? (
              <div className="mt-3">
                <VazioComAcao
                  titulo="Nada esperando por você agora"
                  descricao="Os pedidos em andamento estão com o fornecedor ou com terceiros."
                />
              </div>
            ) : (
              <ListaDePedidos adesoes={precisamDeAcao} />
            )}
          </Secao>

          <Secao titulo={`Outros pedidos (${outros.length})`}>
            {outros.length === 0 ? (
              <p className="mt-3 text-sm" style={{ color: "var(--cor-texto-2)" }}>
                Nenhum outro pedido em andamento.
              </p>
            ) : (
              <ListaDePedidos adesoes={outros} />
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

function ListaDePedidos({ adesoes }: { adesoes: AdesaoComRelacoes[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-3">
      {adesoes.map((adesao) => (
        <li key={adesao.id}>
          <Link
            href={`/adesoes/${adesao.id}`}
            className="painel block p-4 transition-colors hover:border-[var(--cor-borda-forte)]"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-medium" style={{ color: "var(--cor-texto)" }}>
                {adesao.item.descricao}
              </span>
              <span className="eyebrow">{ROTULO_ESTAGIO[adesao.estagio]}</span>
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
              <Numero>
                {adesao.quantidadeSolicitada} {adesao.item.unidade}
              </Numero>{" "}
              — Ata {codigoPublico(adesao.item.ata.id)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
