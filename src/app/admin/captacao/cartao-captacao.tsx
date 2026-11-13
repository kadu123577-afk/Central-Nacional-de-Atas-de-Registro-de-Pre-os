import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SeloCategoria } from "@/components/ui/selo-categoria";
import { dataSoDia } from "@/lib/acompanhamento-view";
import { rotuloDaCategoria } from "@/lib/categorias";
import {
  captacaoComContatoVencido,
  ESTAGIOS_ABERTOS_CAPTACAO,
  nomeProprioParaTela,
  ROTULO_ORIGEM_CAPTACAO,
  rotuloMotivoPerda,
} from "@/lib/captacao";
import {
  cnpjParaTela,
  cortarTexto,
  diasRestantesBrasilia,
  textoDiasRestantes,
  tomDiasRestantes,
} from "@/lib/radar-atas-view";

/** Um cartão do Kanban como a tela o mostra. */
export interface DadosCartaoCaptacao {
  id: string;
  nome: string;
  origem: string;
  estagio: string;
  fornecedorCnpj: string | null;
  fornecedorNome: string | null;
  orgaoNome: string | null;
  uf: string | null;
  municipioNome: string | null;
  categoria: string | null;
  vigenciaFim: Date | null;
  responsavelNome: string | null;
  proximoContatoEm: Date | null;
  observacoes: string | null;
  motivoPerda: string | null;
}

const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;
const MAX_OBSERVACOES_NO_CARTAO = 110;

/** A cor da borda comunica pressa: contato vencido = crítico; fechada = verde. */
function urgenciaDoCartao(estagio: string, vencido: boolean): string {
  if (vencido) return "critico";
  if (estagio === "fechada") return "ok";
  return "sem_prazo";
}

/**
 * Cartão de uma ata na Captação: o nome que a equipe reconhece, a empresa (ou o aviso de que ainda
 * falta identificá-la), o órgão, quanto tempo a ata ainda tem, quem cuida e quando falar de novo.
 * Tudo se faz na tela do cartão (o clique no nome abre).
 */
export function CartaoCaptacao({ cartao: c, agora }: { cartao: DadosCartaoCaptacao; agora: Date }) {
  const vencido = captacaoComContatoVencido(c.estagio, c.proximoContatoEm, agora);
  const aberto = (ESTAGIOS_ABERTOS_CAPTACAO as readonly string[]).includes(c.estagio);
  const cnpj = cnpjParaTela(c.fornecedorCnpj);
  const dias = c.vigenciaFim ? diasRestantesBrasilia(c.vigenciaFim, agora) : null;
  const local = [
    nomeProprioParaTela(c.orgaoNome),
    c.municipioNome && c.municipioNome !== c.orgaoNome ? nomeProprioParaTela(c.municipioNome) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      <article className="kb-cartao" data-urgencia={urgenciaDoCartao(c.estagio, vencido)} style={{ cursor: "default" }}>
        <div className="kb-cartao-topo">
          <div className="min-w-0">
            <h3 className="kb-cartao-nome break-words">
              <Link href={`/admin/captacao/${c.id}`} className="hover:text-[var(--cor-marca-clara)]">
                {c.nome}
              </Link>
            </h3>
            {c.fornecedorNome || cnpj ? (
              <p className="kb-sub">
                {c.fornecedorNome}
                {cnpj && <span className="codigo"> · {cnpj}</span>}
              </p>
            ) : (
              <p className="kb-sub">
                <Badge tom="atencao">Empresa a identificar</Badge>
              </p>
            )}
          </div>
        </div>

        {(local || c.uf) && (
          <p className="mt-2 text-xs leading-snug" style={{ color: "var(--cor-texto-2)" }}>
            {local}
            {c.uf && <span className="selo-uf ml-1.5">{c.uf}</span>}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {c.categoria && <SeloCategoria categoria={rotuloDaCategoria(c.categoria)} />}
          {c.vigenciaFim && dias !== null && (
            <Badge tom={tomDiasRestantes(dias)}>
              vence {dataSoDia(c.vigenciaFim)} · {textoDiasRestantes(dias)}
            </Badge>
          )}
        </div>

        <p className="mt-2.5 text-xs" style={COR_SECUNDARIA}>
          {ROTULO_ORIGEM_CAPTACAO[c.origem] ?? c.origem} ·{" "}
          {c.responsavelNome ? <b style={{ color: "var(--cor-texto-2)" }}>{c.responsavelNome}</b> : "sem responsável"}
        </p>

        {aberto && (
          <p
            className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
            style={{ color: vencido ? "var(--cor-critico)" : "var(--cor-texto-2)" }}
          >
            <span>Próximo contato:</span>
            {c.proximoContatoEm ? (
              <b className="numero">{dataSoDia(c.proximoContatoEm)}</b>
            ) : (
              <span style={COR_SECUNDARIA}>não marcado</span>
            )}
            {vencido && <Badge tom="critico">Vencido</Badge>}
          </p>
        )}

        {c.estagio === "perdida" && c.motivoPerda && (
          <p className="mt-1.5 text-xs" style={COR_SECUNDARIA}>
            {rotuloMotivoPerda(c.motivoPerda)}
          </p>
        )}

        {c.observacoes && (
          <p className="mt-2 whitespace-pre-line break-words text-xs leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
            {cortarTexto(c.observacoes, MAX_OBSERVACOES_NO_CARTAO)}
          </p>
        )}

        <div className="kb-rodape">
          <Link href={`/admin/captacao/${c.id}`} className="botao-atas link text-[12.5px]">
            Abrir →
          </Link>
        </div>
      </article>
    </li>
  );
}
