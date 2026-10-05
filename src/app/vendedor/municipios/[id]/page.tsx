import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { ContatoCard } from "@/components/kanban/contato-card";
import { ROTULO_CATEGORIA_CONSUMO } from "@/lib/classificador-objeto";
import { dataCurtaUtc, moedaCurta } from "@/lib/formato";
import { haQuantoTempo, montarContatosView } from "@/lib/kanban-view";
import { ROTULO_TIPO_SINAL, TOM_TIPO_SINAL, tipoSinalValido } from "@/lib/sinais";
import { logoutVendedor } from "../../actions";
import { NAV_VENDEDOR } from "../../nav";

export const dynamic = "force-dynamic";

/**
 * Dossiê de um município pro vendedor (2026-10-01, redesenhado na fase 2 em
 * 2026-10-05) — quem decide e como falar (contatos com fonte, confiança e
 * verificação), sinais de compra e o raio-X completo de necessidades, tudo
 * numa tela só, acessível direto da lista de Municípios.
 */
export default async function MunicipioVendedorPage({ params }: { params: Promise<{ id: string }> }) {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  const { id } = await params;
  const municipio = await prisma.entidadeAlvo.findUnique({
    where: { id },
    include: {
      contatos: { where: { ativo: true }, orderBy: { createdAt: "asc" } },
      historicoConsumo: { orderBy: { ultimaContratacao: "desc" } },
      sinais: { orderBy: { dataSinal: "desc" }, take: 20 },
      oportunidades: {
        where: { vendedorId, expiradaEm: null },
        select: { ataId: true, estagio: true, ata: { select: { numero: true } } },
      },
    },
  });
  if (!municipio) notFound();

  // Sem categoria: a ordem de abordagem padrão (administração primeiro, prefeito por último).
  const { contatos, semCanal } = montarContatosView(municipio.contatos, null);
  const agora = new Date();
  const sinaisVigentes = municipio.sinais.filter((s) => !s.expiraEm || s.expiraEm >= agora);

  return (
    <AppShell
      area="Vendedor"
      itens={NAV_VENDEDOR}
      larguraMaxima="max-w-5xl"
      rodape={
        <form action={logoutVendedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            {municipio.nome}
            {municipio.uf ? ` / ${municipio.uf}` : ""}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tom={semCanal ? "atencao" : "marca"}>{semCanal ? "Sem decisor com contato" : "Decisor com contato"}</Badge>
            <Badge tom="neutro">{municipio.historicoConsumo.length} categoria(s) no raio-X</Badge>
            {sinaisVigentes.length > 0 && <Badge tom="atencao">{sinaisVigentes.length} sinal(is) de compra</Badge>}
            {municipio.oportunidades.map((o) => (
              <Link key={o.ataId} href={`/vendedor/atas/${o.ataId}`} className="underline text-xs" style={{ color: "var(--cor-marca-clara)" }}>
                Em negociação — ata {o.ata.numero} →
              </Link>
            ))}
          </div>
        </div>
        <Link href="/vendedor/municipios" className="botao-atas link">
          ← Municípios
        </Link>
      </div>

      <div className="kb-kpis">
        <div className="kb-kpi">
          <p className="eyebrow">CNPJ</p>
          <p className="kb-kpi-valor numero" style={{ fontSize: 16 }}>
            {municipio.cnpj ?? "não encontrado"}
          </p>
        </div>
        <div className="kb-kpi">
          <p className="eyebrow">Endereço</p>
          <p className="kb-kpi-valor" style={{ fontSize: 14 }}>
            {municipio.endereco ?? "não encontrado"}
          </p>
        </div>
      </div>

      <Secao titulo={`Quem falar ${contatos.length > 0 ? `(${contatos.length})` : ""}`}>
        {contatos.length === 0 ? (
          <VazioComAcao
            titulo="Nenhum contato levantado ainda"
            descricao="Peça ao administrador para incluir os decisores deste município."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {contatos.map((p) => (
              <ContatoCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </Secao>

      <Secao titulo={`Sinais de compra ${sinaisVigentes.length > 0 ? `(${sinaisVigentes.length})` : ""}`}>
        {sinaisVigentes.length === 0 ? (
          <div className="kb-coluna-vazia">
            Nenhum sinal de compra registrado. PCA, licitações abertas, contratos a vencer e troca de gestão aparecem
            aqui quando forem levantados.
          </div>
        ) : (
          <div>
            {sinaisVigentes.map((sn) => {
              const tom = tipoSinalValido(sn.tipo) ? TOM_TIPO_SINAL[sn.tipo] : "neutro";
              const cor =
                tom === "critico" ? "var(--cor-critico)" : tom === "atencao" ? "var(--cor-atencao)" : "var(--cor-borda-forte)";
              return (
                <div key={sn.id} className="kb-sinal">
                  <i style={{ background: cor }} />
                  <div>
                    <b>{sn.titulo}</b>
                    <span>
                      {tipoSinalValido(sn.tipo) ? ROTULO_TIPO_SINAL[sn.tipo] : sn.tipo}
                      {sn.valorEstimado ? ` · ${moedaCurta(Number(sn.valorEstimado))}` : ""} ·{" "}
                      {sn.fonteUrl ? (
                        <a href={sn.fonteUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                          {sn.fonte}
                        </a>
                      ) : (
                        sn.fonte
                      )}{" "}
                      · {haQuantoTempo(sn.dataSinal.toISOString())}
                    </span>
                    {sn.detalhe && <span>{sn.detalhe}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Secao>

      <Secao
        titulo={`Necessidades identificadas (raio-X) ${municipio.historicoConsumo.length > 0 ? `(${municipio.historicoConsumo.length})` : ""}`}
      >
        {municipio.historicoConsumo.length === 0 ? (
          <VazioComAcao
            titulo="Raio-X ainda não identificou necessidades"
            descricao="Pode ser que o raio-X não tenha rodado ainda, ou não tenha achado contratação em nenhuma categoria conhecida."
          />
        ) : (
          <div>
            {municipio.historicoConsumo.map((h) => (
              <div key={h.categoria} className="kb-sinal">
                <i style={{ background: "var(--cor-borda-forte)" }} />
                <div>
                  <b>{ROTULO_CATEGORIA_CONSUMO[h.categoria] ?? h.categoria}</b>
                  <span>
                    Última contratação {dataCurtaUtc(h.ultimaContratacao.toISOString())} ·{" "}
                    {moedaCurta(Number(h.valorUltimaContratacao))} · {h.quantidadeContratosNaJanela} contrato(s) nos
                    últimos 3 anos
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Secao>
    </AppShell>
  );
}
