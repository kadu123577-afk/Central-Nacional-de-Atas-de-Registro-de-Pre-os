import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Badge } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
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
      <CabecalhoPagina
        rotulo="Dossiê do município"
        voltar={{ href: "/vendedor/municipios", rotulo: "Municípios" }}
        titulo={
          <>
            {municipio.nome}
            {municipio.uf && <span className="selo-uf ml-3 align-middle">{municipio.uf}</span>}
          </>
        }
        descricao={
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tom={semCanal ? "atencao" : "marca"}>{semCanal ? "Sem decisor com contato" : "Decisor com contato"}</Badge>
            <Badge tom="neutro">{municipio.historicoConsumo.length} categoria(s) no raio-X</Badge>
            {sinaisVigentes.length > 0 && <Badge tom="atencao">{sinaisVigentes.length} sinal(is) de compra</Badge>}
            {municipio.oportunidades.map((o) => (
              <Link key={o.ataId} href={`/vendedor/atas/${o.ataId}`} className="botao-atas link">
                Em negociação — ata {o.ata.numero} →
              </Link>
            ))}
          </span>
        }
      />

      <dl className="painel grid grid-cols-1 gap-x-10 gap-y-5 p-6 sm:grid-cols-[minmax(0,240px)_1fr]">
        <div>
          <dt className="eyebrow">CNPJ</dt>
          <dd className="codigo mt-1.5 text-[15px] font-semibold" style={{ color: "var(--cor-texto)" }}>
            {municipio.cnpj ?? "não encontrado"}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Endereço</dt>
          <dd className="mt-1.5 text-[14px] leading-relaxed" style={{ color: "var(--cor-texto)" }}>
            {municipio.endereco ?? "não encontrado"}
          </dd>
        </div>
      </dl>

      <Secao titulo={`Quem falar ${contatos.length > 0 ? `(${contatos.length})` : ""}`} destaque>
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
          <VazioComAcao
            titulo="Nenhum sinal de compra registrado"
            descricao="PCA, licitações abertas, contratos a vencer e troca de gestão aparecem aqui quando forem levantados."
          />
        ) : (
          <ul className="lista-linhas">
            {sinaisVigentes.map((sn) => {
              const tom = tipoSinalValido(sn.tipo) ? TOM_TIPO_SINAL[sn.tipo] : "neutro";
              const cor =
                tom === "critico" ? "var(--cor-critico)" : tom === "atencao" ? "var(--cor-atencao)" : "var(--cor-borda-forte)";
              return (
                <li key={sn.id} className="flex items-start gap-3">
                  <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full" style={{ background: cor }} />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-bold" style={{ color: "var(--cor-texto)", letterSpacing: "-0.01em" }}>
                      {sn.titulo}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      {tipoSinalValido(sn.tipo) ? ROTULO_TIPO_SINAL[sn.tipo] : sn.tipo}
                      {sn.valorEstimado ? (
                        <>
                          {" · "}
                          <span className="numero">{moedaCurta(Number(sn.valorEstimado))}</span>
                        </>
                      ) : (
                        ""
                      )}{" "}
                      ·{" "}
                      {sn.fonteUrl ? (
                        <a
                          href={sn.fonteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold underline underline-offset-2 hover:text-[var(--cor-marca-clara)]"
                        >
                          {sn.fonte}
                        </a>
                      ) : (
                        sn.fonte
                      )}{" "}
                      · {haQuantoTempo(sn.dataSinal.toISOString())}
                    </p>
                    {sn.detalhe && (
                      <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
                        {sn.detalhe}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
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
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[620px]">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th className="w-[150px]">Última contratação</th>
                  <th className="w-[130px]">Valor</th>
                  <th className="w-[190px]">Contratos nos últimos 3 anos</th>
                </tr>
              </thead>
              <tbody>
                {municipio.historicoConsumo.map((h) => (
                  <tr key={h.categoria}>
                    <td>
                      <span className="titulo-linha">{ROTULO_CATEGORIA_CONSUMO[h.categoria] ?? h.categoria}</span>
                    </td>
                    <td className="numero whitespace-nowrap" style={{ color: "var(--cor-texto)" }}>
                      {dataCurtaUtc(h.ultimaContratacao.toISOString())}
                    </td>
                    <td className="numero whitespace-nowrap font-semibold" style={{ color: "var(--cor-texto)" }}>
                      {moedaCurta(Number(h.valorUltimaContratacao))}
                    </td>
                    <td className="numero">{h.quantidadeContratosNaJanela} contrato(s)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </AppShell>
  );
}
