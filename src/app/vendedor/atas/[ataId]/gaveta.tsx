"use client";

import { useActionState, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Icone } from "@/components/ui/icones";
import { abordagemSugerida } from "@/lib/abordagem";
import { ROTULO_CATEGORIA_CONSUMO } from "@/lib/classificador-objeto";
import { linkEmail, linkTelefone, linkWhatsapp } from "@/lib/contato-links";
import { dataCurtaUtc, moedaCurta, percentualDeFracao } from "@/lib/formato";
import { haQuantoTempo, type CartaoView, type ContatoView } from "@/lib/kanban-view";
import { ESTAGIOS_OPORTUNIDADE, ROTULO_ESTAGIO_OPORTUNIDADE } from "@/lib/oportunidades";
import { RESULTADOS_INTERACAO } from "@/lib/pontos-focais";
import {
  confirmarContatoVendedor,
  marcarContatoErradoVendedor,
  moverEstagioOportunidade,
  registrarContatoVendedor,
  type EstadoMoverEstagio,
  type EstadoRegistrarContato,
} from "../../actions";
import { ROTULO_TIPO_SINAL, TOM_TIPO_SINAL, tipoSinalValido } from "@/lib/sinais";

type Aba = "quem" | "necessidade" | "contexto" | "historico";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "quem", rotulo: "Quem falar" },
  { id: "necessidade", rotulo: "Necessidade" },
  { id: "contexto", rotulo: "Contexto" },
  { id: "historico", rotulo: "Histórico" },
];

const ROTULO_PAPEL = { principal: "Principal", aprovacao: "Aprovação final", apoio: "Apoio" } as const;

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

const estadoMoverInicial: EstadoMoverEstagio = {};
const estadoContatoInicial: EstadoRegistrarContato = {};

/**
 * Gaveta do município (fase 2 de design, 2026-10-04): o dossiê do município
 * ao lado do Kanban. Quem falar (decisores por ordem de abordagem, com
 * canais de um toque), necessidade (raio-X), contexto e histórico. O rodapé
 * concentra as duas ações do vendedor: registrar contato e atualizar estágio.
 */
export function Gaveta({
  cartao: c,
  categoriaAta,
  fechar,
}: {
  cartao: CartaoView;
  categoriaAta: string | null;
  fechar: () => void;
}) {
  const [aba, setAba] = useState<Aba>("quem");
  const [painel, setPainel] = useState<"nenhum" | "contato" | "estagio">("nenhum");

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [fechar]);

  const daCategoria = c.necessidades.find((n) => n.categoria === categoriaAta);
  const abordagem = abordagemSugerida(c.principal?.cargo ?? null, categoriaAta, c.porQueAgora);

  return (
    <>
      <div className="kb-fundo-gaveta" onClick={fechar} aria-hidden="true" />
      <aside className="kb-gaveta" role="dialog" aria-label={`Dossiê de ${c.nomeMunicipio}`}>
        <div className="kb-gaveta-topo">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="kb-gaveta-titulo">
                {c.nomeMunicipio}
                {c.uf ? ` / ${c.uf}` : ""}
              </h2>
              <p className="kb-sub" style={{ fontSize: 12.5 }}>
                {ROTULO_ESTAGIO_OPORTUNIDADE[c.estagio as keyof typeof ROTULO_ESTAGIO_OPORTUNIDADE] ?? c.estagio}
                {c.estagio !== "aderiu" && c.estagio !== "recusado" ? ` · ${c.urgencia.rotulo.toLowerCase()}` : ""}
              </p>
            </div>
            <button type="button" className="kb-fechar" onClick={fechar} aria-label="Fechar">
              <Icone nome="x" className="h-4 w-4" />
            </button>
          </div>

          <div className="kb-fatos" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div className="kb-fato">
              <p className="eyebrow">Já contratou</p>
              <p className="valor numero">{daCategoria ? dataCurtaUtc(daCategoria.ultimaContratacao).slice(3) : "—"}</p>
            </div>
            <div className="kb-fato">
              <p className="eyebrow">Valor estimado</p>
              <p className="valor numero">{c.valorEstimado != null ? moedaCurta(c.valorEstimado) : "—"}</p>
            </div>
            <div className="kb-fato">
              <p className="eyebrow">Casa com a ata</p>
              <p className="valor" style={{ color: c.casaComAta ? "var(--cor-marca-clara)" : "var(--cor-texto-2)" }}>
                {c.casaComAta ? "Sim" : "Sem histórico"}
              </p>
            </div>
          </div>

          <div className="kb-abas" role="tablist">
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                className="kb-aba"
                aria-selected={aba === a.id}
                onClick={() => setAba(a.id)}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="kb-gaveta-corpo">
          {aba === "quem" && (
            <>
              <p className="kb-secao">Decisores — por ordem de abordagem</p>
              {c.contatos.length === 0 ? (
                <div className="kb-sem-canal">
                  Nenhum contato levantado para este município ainda. Peça ao administrador para incluir.
                </div>
              ) : (
                c.contatos.map((p) => <Pessoa key={p.id} p={p} oportunidadeId={c.id} />)
              )}
              <div className="kb-abordagem">
                <p className="titulo">{abordagem.titulo}</p>
                {abordagem.texto}
              </div>
            </>
          )}

          {aba === "necessidade" && (
            <>
              <p className="kb-secao">Raio-X de consumo (PNCP, últimos anos)</p>
              {c.necessidades.length === 0 ? (
                <p className="kb-sub">Raio-X não identificou nenhuma categoria de consumo para este município.</p>
              ) : (
                <div>
                  {[...c.necessidades]
                    .sort((a, b) => Number(b.categoria === categoriaAta) - Number(a.categoria === categoriaAta))
                    .map((n) => (
                      <div key={n.categoria} className="kb-sinal">
                        <i style={{ background: n.categoria === categoriaAta ? "var(--cor-marca)" : "var(--cor-borda-forte)" }} />
                        <div>
                          <b>
                            {ROTULO_CATEGORIA_CONSUMO[n.categoria] ?? n.categoria}
                            {n.categoria === categoriaAta ? " — casa com esta ata" : ""}
                          </b>
                          <span>
                            Última contratação {dataCurtaUtc(n.ultimaContratacao)} · {moedaCurta(n.valor)} ·{" "}
                            {n.quantidadeContratos} contrato(s) na janela
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}

          {aba === "contexto" && (
            <>
              <p className="kb-secao">Por que agora</p>
              {c.porQueAgora ? (
                <div className="kb-sinal">
                  <i />
                  <div>
                    <b>{c.porQueAgora}</b>
                    <span>Raio-X de consumo</span>
                  </div>
                </div>
              ) : (
                <p className="kb-sub">Sem sinal registrado para este município.</p>
              )}
              <p className="kb-secao">Sinais de compra</p>
              {c.sinais.length === 0 ? (
                <div className="kb-coluna-vazia">
                  Nenhum sinal de compra registrado. PCA, licitações abertas, contratos a vencer e troca de gestão
                  aparecem aqui quando forem levantados.
                </div>
              ) : (
                <div>
                  {c.sinais.map((sn) => {
                    const tom = tipoSinalValido(sn.tipo) ? TOM_TIPO_SINAL[sn.tipo] : "neutro";
                    const cor =
                      tom === "critico"
                        ? "var(--cor-critico)"
                        : tom === "atencao"
                          ? "var(--cor-atencao)"
                          : "var(--cor-borda-forte)";
                    return (
                      <div key={sn.id} className="kb-sinal">
                        <i style={{ background: cor }} />
                        <div>
                          <b>{sn.titulo}</b>
                          <span>
                            {tipoSinalValido(sn.tipo) ? ROTULO_TIPO_SINAL[sn.tipo] : sn.tipo}
                            {sn.valorEstimado != null ? ` · ${moedaCurta(sn.valorEstimado)}` : ""} ·{" "}
                            {sn.fonteUrl ? (
                              <a href={sn.fonteUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                                {sn.fonte}
                              </a>
                            ) : (
                              sn.fonte
                            )}{" "}
                            · {haQuantoTempo(sn.dataSinal)}
                          </span>
                          {sn.detalhe && <span>{sn.detalhe}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {c.observacoes && (
                <>
                  <p className="kb-secao">Suas observações</p>
                  <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                    {c.observacoes}
                  </p>
                </>
              )}
            </>
          )}

          {aba === "historico" && (
            <>
              <p className="kb-secao">Contatos registrados</p>
              {c.interacoes.length === 0 ? (
                <p className="kb-sub">Nenhum contato registrado ainda. Use &quot;Registrar contato&quot; abaixo.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {c.interacoes.map((i) => (
                    <div key={i.id} className="kb-historico-item">
                      <b>{i.resultado}</b> — {i.contatoNome} ({i.contatoCargo})
                      <span>
                        {haQuantoTempo(i.quando)}
                        {i.observacao ? ` · ${i.observacao}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="kb-gaveta-rodape">
          {painel === "contato" && <PainelContato cartao={c} aoConcluir={() => setPainel("nenhum")} />}
          {painel === "estagio" && <PainelEstagio cartao={c} />}
          <div className="kb-linha-botoes">
            <button
              type="button"
              className={painel === "contato" ? "botao-atas" : "botao-atas secundario"}
              onClick={() => setPainel(painel === "contato" ? "nenhum" : "contato")}
            >
              Registrar contato
            </button>
            <button
              type="button"
              className={painel === "estagio" ? "botao-atas" : "botao-atas secundario"}
              onClick={() => setPainel(painel === "estagio" ? "nenhum" : "estagio")}
            >
              Estágio e retorno
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

const ROTULO_CONFIANCA: Record<number, string> = { 1: "baixa", 2: "média", 3: "alta" };

function Pessoa({ p, oportunidadeId }: { p: ContatoView; oportunidadeId: string }) {
  const wa = linkWhatsapp(p.telefone);
  const tel = linkTelefone(p.telefone);
  const mail = linkEmail(p.email);
  const [marcando, setMarcando] = useState(false);
  const errado = p.contatoErradoEm != null;

  return (
    <div
      className="kb-pessoa"
      data-papel={errado ? "apoio" : p.papel}
      style={errado ? { borderColor: "var(--cor-critico)" } : undefined}
    >
      <div className="kb-avatar">{iniciais(p.nomeContato)}</div>
      <div className="kb-pessoa-info">
        <div className="kb-pessoa-nome">
          <b>{p.nomeContato}</b>
          {errado ? (
            <Badge tom="critico">Marcado como errado</Badge>
          ) : (
            <Badge tom={p.papel === "principal" ? "marca" : "neutro"}>{ROTULO_PAPEL[p.papel]}</Badge>
          )}
        </div>
        <p className="kb-cargo">
          {p.cargo}
          {p.area ? ` · ${p.area}` : ""}
        </p>
        {p.telefone || p.email ? (
          <div className="kb-canais">
            {p.telefone && (
              <a href={wa ?? tel ?? undefined} target={wa ? "_blank" : undefined} rel="noopener noreferrer">
                <Icone nome={wa ? "chat" : "tel"} />
                {p.telefone}
              </a>
            )}
            {p.email && (
              <a href={mail ?? undefined}>
                <Icone nome="mail" />
                {p.email}
              </a>
            )}
          </div>
        ) : (
          <p className="kb-fonte" style={{ color: "var(--cor-atencao)" }}>
            Sem telefone nem e-mail levantado
          </p>
        )}
        {p.nota && <p className="kb-sub">Nota do levantamento: {p.nota}</p>}
        {p.particularidades && !p.fonte && <p className="kb-sub">{p.particularidades}</p>}
        {errado && p.contatoErradoMotivo && <p className="kb-sub">Motivo: {p.contatoErradoMotivo}</p>}

        <p className="kb-fonte">
          <span>
            {p.confianca != null && (
              <>
                <span className="kb-frescor" data-nivel={p.confianca} style={{ marginRight: 4 }}>
                  <i />
                  <i />
                  <i />
                </span>
                confiança {ROTULO_CONFIANCA[p.confianca]} ·{" "}
              </>
            )}
            {p.fonte ? (
              <>
                fonte:{" "}
                {p.fonteUrl ? (
                  <a href={p.fonteUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                    {p.fonte}
                  </a>
                ) : (
                  p.fonte
                )}{" "}
                ·{" "}
              </>
            ) : null}
            {p.verificadoEm ? `verificado ${haQuantoTempo(p.verificadoEm)}` : `levantado ${haQuantoTempo(p.atualizadoEm)}`}
          </span>
        </p>

        <div className="kb-linha-botoes" style={{ marginTop: 8 }}>
          {!marcando ? (
            <>
              <form action={confirmarContatoVendedor.bind(null, oportunidadeId, p.id)}>
                <button type="submit" className="botao-atas secundario" style={{ padding: "3px 10px", fontSize: 12 }}>
                  Confirmar contato
                </button>
              </form>
              {!errado && (
                <button
                  type="button"
                  className="botao-atas secundario"
                  style={{ padding: "3px 10px", fontSize: 12 }}
                  onClick={() => setMarcando(true)}
                >
                  Contato errado
                </button>
              )}
            </>
          ) : (
            <form
              action={marcarContatoErradoVendedor.bind(null, oportunidadeId, p.id)}
              className="flex w-full flex-wrap items-center gap-2"
            >
              <input
                name="motivo"
                placeholder="O que está errado? (opcional)"
                className="campo-atas"
                style={{ flex: 1, minWidth: 160, padding: "4px 8px", fontSize: 12 }}
              />
              <button type="submit" className="botao-atas critico" style={{ padding: "3px 10px", fontSize: 12 }}>
                Marcar
              </button>
              <button type="button" className="botao-atas link" style={{ fontSize: 12 }} onClick={() => setMarcando(false)}>
                Cancelar
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function PainelContato({ cartao: c, aoConcluir }: { cartao: CartaoView; aoConcluir: () => void }) {
  const acao = registrarContatoVendedor.bind(null, c.id);
  const [estado, formAction, pendente] = useActionState(acao, estadoContatoInicial);

  useEffect(() => {
    if (estado.ok) aoConcluir();
  }, [estado, aoConcluir]);

  if (c.contatos.length === 0) {
    return <div className="kb-painel-acao kb-sub">Sem contatos levantados — não há com quem registrar.</div>;
  }

  return (
    <form action={formAction} className="kb-painel-acao">
      <label className="block text-xs">
        <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
          Falou com
        </span>
        <select name="pontoFocalId" className="campo-atas" defaultValue={c.principal?.id ?? c.contatos[0].id}>
          {c.contatos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.cargo} — {p.nomeContato}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
          Resultado
        </span>
        <select name="resultado" className="campo-atas" defaultValue="Em conversa">
          {RESULTADOS_INTERACAO.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
          Observação
        </span>
        <textarea name="observacao" rows={2} className="campo-atas" />
      </label>
      {estado.erro && (
        <p className="text-xs" style={{ color: "var(--cor-critico)" }}>
          {estado.erro}
        </p>
      )}
      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Salvando..." : "Salvar contato"}
      </button>
    </form>
  );
}

function PainelEstagio({ cartao: c }: { cartao: CartaoView }) {
  const acao = moverEstagioOportunidade.bind(null, c.id);
  const [estado, formAction, pendente] = useActionState(acao, estadoMoverInicial);
  const [selecionado, setSelecionado] = useState(c.estagio);

  return (
    <form action={formAction} className="kb-painel-acao">
      <label className="block text-xs">
        <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
          Estágio
        </span>
        <select
          name="estagio"
          key={estado.valores?.nonce ?? "inicial"}
          defaultValue={selecionado}
          onChange={(e) => setSelecionado(e.target.value)}
          className="campo-atas"
        >
          {ESTAGIOS_OPORTUNIDADE.map((e) => (
            <option key={e} value={e}>
              {ROTULO_ESTAGIO_OPORTUNIDADE[e]}
            </option>
          ))}
        </select>
      </label>

      {selecionado === "aderiu" && (
        <div
          className="flex flex-col gap-2 rounded-[var(--raio)] border p-2"
          style={{ borderColor: "var(--cor-marca)" }}
        >
          <p className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
            Controle de recebíveis — obrigatório para marcar como aderiu.
          </p>
          <label className="block text-xs">
            <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
              Valor aderido (R$)
            </span>
            <input
              name="valorAderido"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={estado.valores?.valorAderido ?? (c.valorAderido != null ? String(c.valorAderido) : "")}
              className="campo-atas"
            />
          </label>
          {c.percentualContrato != null ? (
            <p className="text-xs" style={{ color: "var(--cor-texto-2)" }}>
              Comissão pactuada no contrato: {percentualDeFracao(c.percentualContrato)}
            </p>
          ) : (
            <p className="text-xs" style={{ color: "var(--cor-critico)" }}>
              Esta ata ainda não tem contrato de intermediação — peça ao administrador para cadastrar antes de marcar
              como Aderiu.
            </p>
          )}
        </div>
      )}

      <label className="block text-xs">
        <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
          Próximo contato (opcional)
        </span>
        <input
          name="proximoContatoEm"
          type="date"
          className="campo-atas"
          defaultValue={c.proximoContatoEm ? c.proximoContatoEm.slice(0, 10) : ""}
        />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium" style={{ color: "var(--cor-texto-2)" }}>
          Observação / próximo passo
        </span>
        <textarea
          name="observacoes"
          rows={2}
          className="campo-atas"
          defaultValue={estado.valores?.observacoes ?? c.observacoes ?? ""}
        />
      </label>

      {estado.erro && (
        <p className="text-xs" style={{ color: "var(--cor-critico)" }}>
          {estado.erro}
        </p>
      )}
      {estado.ok && !estado.erro && (
        <p className="text-xs" style={{ color: "var(--cor-marca-clara)" }}>
          Salvo.
        </p>
      )}
      <button type="submit" disabled={pendente} className="botao-atas self-start">
        {pendente ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
