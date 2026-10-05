import { Badge } from "@/components/ui/badge";
import { Icone } from "@/components/ui/icones";
import { linkEmail, linkTelefone, linkWhatsapp } from "@/lib/contato-links";
import { iniciais } from "@/lib/formato";
import { haQuantoTempo, type ContatoView } from "@/lib/kanban-view";

const ROTULO_PAPEL = { principal: "Principal", aprovacao: "Aprovação final", apoio: "Apoio" } as const;
const ROTULO_CONFIANCA: Record<number, string> = { 1: "baixa", 2: "média", 3: "alta" };


/**
 * Contato de um decisor, só leitura (fase 2 de design, 2026-10-05): usado no
 * dossiê do município fora do Kanban. Mesmo visual da gaveta, sem os botões
 * de editar — canais clicáveis, fonte, confiança e quando foi verificado.
 */
export function ContatoCard({ p }: { p: ContatoView }) {
  const wa = linkWhatsapp(p.telefone);
  const tel = linkTelefone(p.telefone);
  const mail = linkEmail(p.email);
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
      </div>
    </div>
  );
}
