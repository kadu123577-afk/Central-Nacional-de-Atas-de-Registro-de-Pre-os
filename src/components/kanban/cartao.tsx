"use client";

import { Badge, type Tom } from "@/components/ui/badge";
import { Icone } from "@/components/ui/icones";
import { linkEmail, linkTelefone, linkWhatsapp } from "@/lib/contato-links";
import { dataCurtaUtc, iniciais, moedaCurta } from "@/lib/formato";
import { haQuantoTempo, nivelFrescor, type CartaoView } from "@/lib/kanban-view";

const ESTAGIOS_ABERTOS = ["a_contatar", "em_negociacao"];

const TOM_URGENCIA: Record<string, Tom> = {
  critico: "critico",
  atencao: "atencao",
  ok: "neutro",
  sem_prazo: "neutro",
};


/** Atributo que pinta a borda do card: urgência nos estágios abertos. */
export function chaveUrgenciaDoCartao(c: CartaoView): string {
  if (c.estagio === "aderiu") return "aderiu";
  if (c.estagio === "recusado") return "sem_prazo";
  return c.urgencia.nivel;
}

/**
 * Card do Kanban (fase 2 de design, 2026-10-04): a frente é um mini painel —
 * responde "quem procurar, por que agora e o que está pendente" sem abrir o
 * card. Borda = urgência do prazo; decisor com ações de um toque; o resto
 * fica na gaveta (divulgação progressiva).
 */
export function Cartao({
  cartao: c,
  selecionado,
  mostrarOrigem = false,
  aoAbrir,
}: {
  cartao: CartaoView;
  selecionado: boolean;
  /** Pipeline do gestor: mostra de qual ata e vendedor é o card. */
  mostrarOrigem?: boolean;
  aoAbrir: () => void;
}) {
  const aberto = ESTAGIOS_ABERTOS.includes(c.estagio);
  const p = c.principal;

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        className="kb-cartao"
        data-urgencia={chaveUrgenciaDoCartao(c)}
        data-selecionado={selecionado}
        onClick={aoAbrir}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            aoAbrir();
          }
        }}
      >
        <div className="kb-cartao-topo">
          <div>
            <p className="kb-cartao-nome">
              {c.nomeMunicipio}
              {c.uf ? ` / ${c.uf}` : ""}
            </p>
            <p className="kb-sub">{c.casaComAta ? "Já contratou esta categoria" : "Município"}</p>
            {mostrarOrigem && (
              <p className="kb-origem">
                Ata {c.ataNumero} · {c.vendedorNome}
              </p>
            )}
          </div>
          {aberto && <Badge tom={TOM_URGENCIA[c.urgencia.nivel]}>{c.urgencia.rotulo}</Badge>}
          {c.estagio === "aderiu" && <Badge tom="marca">Aderiu</Badge>}
          {c.estagio === "recusado" && <Badge tom="critico">Recusou</Badge>}
        </div>

        {c.estagio === "aderiu" ? (
          <ResumoAderido c={c} />
        ) : (
          <>
            {p && !c.semCanal ? (
              <div className="kb-decisor" onClick={(e) => e.stopPropagation()}>
                <div className="kb-avatar">{iniciais(p.nomeContato)}</div>
                <div className="kb-decisor-texto">
                  <b>{p.cargo}</b>
                  <span>{p.nomeContato}</span>
                </div>
                <div className="kb-acoes">
                  <AcoesContato telefone={p.telefone} email={p.email} />
                </div>
              </div>
            ) : (
              <div className="kb-sem-canal">
                {p ? `${p.cargo} sem telefone nem e-mail.` : "Nenhum decisor levantado."}{" "}
                <b style={{ color: "var(--cor-texto)" }}>Buscar contato</b>
              </div>
            )}

            {c.porQueAgora && (
              <p className="kb-agora">
                <Icone nome="bolt" />
                <span>{c.porQueAgora}</span>
              </p>
            )}

            <div className="kb-rodape">
              <span>
                {p ? (
                  <>
                    <span className="kb-frescor" data-nivel={nivelFrescor(c.frescorDias)}>
                      <i />
                      <i />
                      <i />
                    </span>
                    {c.semCanal
                      ? "só o nome, sem canal"
                      : p.verificadoEm
                        ? `contato verificado ${haQuantoTempo(p.verificadoEm)}`
                        : `contato levantado ${haQuantoTempo(p.atualizadoEm)}`}
                  </>
                ) : (
                  "sem contato levantado"
                )}
              </span>
              <span className="numero kb-valor">
                {c.proximoContatoEm
                  ? `retorno ${dataCurtaUtc(c.proximoContatoEm).slice(0, 5)}`
                  : c.valorEstimado != null
                    ? `~${moedaCurta(c.valorEstimado)}`
                    : "—"}
              </span>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

function AcoesContato({ telefone, email }: { telefone: string | null; email: string | null }) {
  const wa = linkWhatsapp(telefone);
  const tel = linkTelefone(telefone);
  const mail = linkEmail(email);
  return (
    <>
      {wa && (
        <a className="kb-icone-link" data-tipo="whatsapp" href={wa} target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp">
          <Icone nome="chat" />
        </a>
      )}
      {tel && (
        <a className="kb-icone-link" href={tel} aria-label="Ligar">
          <Icone nome="tel" />
        </a>
      )}
      {mail && (
        <a className="kb-icone-link" href={mail} aria-label="Enviar e-mail">
          <Icone nome="mail" />
        </a>
      )}
    </>
  );
}

function ResumoAderido({ c }: { c: CartaoView }) {
  const aderido = c.valorAderido ?? 0;
  const pct = aderido > 0 ? Math.min(100, Math.round((c.liquidado / aderido) * 100)) : 0;
  return (
    <>
      <div className="kb-fatos">
        <div className="kb-fato">
          <p className="eyebrow">Aderido</p>
          <p className="valor numero">{moedaCurta(aderido)}</p>
        </div>
        <div className="kb-fato">
          <p className="eyebrow">Liquidado</p>
          <p className="valor numero">{moedaCurta(c.liquidado)}</p>
        </div>
      </div>
      <div className="kb-progresso" aria-label={`${pct}% do valor aderido já liquidado`}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="kb-rodape">
        <span>
          comissão devida <span className="numero kb-valor">{moedaCurta(c.comissaoDevida)}</span>
        </span>
        <span>{c.liquidado === 0 ? "aguardando 1ª nota fiscal" : `${pct}% liquidado`}</span>
      </div>
    </>
  );
}
