import Link from "next/link";
import { redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { carregarPosVenda, type LinhaPosVenda } from "@/lib/pos-venda-db";
import { ROTULO_SINAL } from "@/lib/pos-venda";
import { logoutVendedor } from "../actions";
import { NAV_VENDEDOR } from "../nav";

export const dynamic = "force-dynamic";

/**
 * Pós-venda e renovação (atividade 17 do workflow, 14/11/2026), dos consultores: as adesões que a
 * equipe já registrou nos municípios do próprio consultor, com o que pede ação (vigência da ata e do
 * contrato, contato atrasado) e o que é oportunidade (aditivo, novo pedido na mesma ata). A
 * conversa com o município continua no Kanban da ata.
 */
export default async function PosVendaPage() {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId }, select: { nome: true } });
  if (!vendedor) redirect("/vendedor/login");

  const linhas = await carregarPosVenda(vendedorId);
  const pedemAcao = linhas.filter((l) => l.urgente);
  const emAcompanhamento = linhas.filter((l) => !l.urgente);

  return (
    <AppShell
      area={`Vendedor — ${vendedor.nome}`}
      itens={NAV_VENDEDOR}
      larguraMaxima="max-w-6xl"
      rodape={
        <form action={logoutVendedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Atas"
        titulo="Pós-venda"
        destaque="e renovação"
        descricao="Os municípios que já aderiram: o que vence, o que pede contato e onde ainda cabe um novo pedido na mesma ata."
      />

      {linhas.length === 0 ? (
        <VazioComAcao
          titulo="Nenhuma adesão registrada ainda"
          descricao="Quando um município aderir e a equipe registrar a adesão, ele aparece aqui para o pós-venda."
        />
      ) : (
        <>
          <Secao
            titulo={`Pedem ação agora (${pedemAcao.length})`}
            descricao="Vigência chegando ao fim, contato combinado que passou ou ata encerrada."
            destaque
          >
            {pedemAcao.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                Nada urgente. Os municípios abaixo estão em dia.
              </p>
            ) : (
              <ListaDeAdesoes linhas={pedemAcao} />
            )}
          </Secao>

          <Secao
            titulo={`Em acompanhamento (${emAcompanhamento.length})`}
            descricao="Adesões em dia. Aditivos e a margem para um novo pedido aparecem aqui como oportunidade."
          >
            {emAcompanhamento.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                Nenhuma adesão fora da lista de cima.
              </p>
            ) : (
              <ListaDeAdesoes linhas={emAcompanhamento} />
            )}
          </Secao>
        </>
      )}
    </AppShell>
  );
}

/** Valor aderido por extenso (R$ 500.000,00): o resumo curto ("500 mi") confunde numa linha de detalhe. */
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ListaDeAdesoes({ linhas }: { linhas: LinhaPosVenda[] }) {
  return (
    <ul className="lista-linhas">
      {linhas.map((l) => (
        <li key={l.oportunidadeId} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="titulo-linha">{l.municipio}</span>
                {l.uf && <span className="selo-uf">{l.uf}</span>}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                Ata {l.ataNumero} · {l.fornecedor}
                {l.valorAderido !== null ? ` · aderido ${reais(l.valorAderido)}` : ""}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                {l.ataObjeto}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tom={l.etapa === 17 ? "marca" : "neutro"}>{l.situacao}</Badge>
              <Link href={`/vendedor/atas/${l.ataId}`} className="botao-atas link whitespace-nowrap">
                Abrir no Kanban →
              </Link>
            </div>
          </div>

          {l.sinais.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {l.sinais.map((s) => (
                <li key={s.tipo} className="flex flex-wrap items-start gap-2 text-[13px] leading-snug">
                  <Badge tom={s.urgente ? "alerta" : "neutro"}>{ROTULO_SINAL[s.tipo]}</Badge>
                  <span style={{ color: "var(--cor-texto-2)" }}>{s.texto}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
