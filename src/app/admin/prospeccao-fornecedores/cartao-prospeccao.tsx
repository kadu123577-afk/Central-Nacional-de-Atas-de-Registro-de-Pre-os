import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SeloCategoria } from "@/components/ui/selo-categoria";
import { dataSoDia, nomeFornecedorParaTela } from "@/lib/acompanhamento-view";
import { rotuloDaCategoria } from "@/lib/categorias";
import { estagiosPermitidos, normalizarCnpj, ROTULO_ESTAGIO_PROSPECCAO } from "@/lib/radar-atas";
import {
  cartaoComContatoVencido,
  cnpjParaTela,
  cortarTexto,
  dataParaCampo,
  hrefRadar,
  limitarLista,
} from "@/lib/radar-atas-view";
import { FormularioAnotacao, FormularioMoverEstagio, type DestinoEstagio } from "./formularios-cartao";

/** Quantas categorias e UFs o cartão mostra antes do "+N". */
const MAX_CATEGORIAS = 3;
const MAX_UFS = 6;
/** Observações no cartão são um resumo; o texto inteiro está no formulário. */
const MAX_OBSERVACOES_NO_CARTAO = 140;

export interface DadosCartaoProspeccao {
  id: string;
  cnpj: string;
  razaoSocial: string;
  estagio: string;
  atasVigentes: number;
  pontuacao: number;
  categorias: string[];
  ufs: string[];
  proximoContatoEm: Date | null;
  observacoes: string | null;
}

const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;

/** A cor da borda do cartão comunica pressa: contato vencido = crítico; credenciado = verde. */
function urgenciaDoCartao(estagio: string, vencido: boolean): string {
  if (vencido) return "critico";
  if (estagio === "credenciado") return "ok";
  return "sem_prazo";
}

/**
 * Cartão de um fornecedor no funil: quem é (razão social e CNPJ, dado público
 * de empresa), o que ele tem de interessante (atas vigentes, pontuação,
 * categorias e UFs), quando falar de novo e o que já se anotou. Os formulários
 * ficam recolhidos para o quadro ler bem com muitos cartões.
 */
export function CartaoProspeccao({ fornecedor: f, agora }: { fornecedor: DadosCartaoProspeccao; agora: Date }) {
  // Mesma regra da faixa de números e da fila do painel: só contatado ou interessado.
  const vencido = cartaoComContatoVencido(f.estagio, f.proximoContatoEm, agora);
  const categorias = limitarLista(f.categorias, MAX_CATEGORIAS);
  const ufs = limitarLista(f.ufs, MAX_UFS);
  const destinos: DestinoEstagio[] = estagiosPermitidos(f.estagio).map((valor) => ({
    valor,
    rotulo: ROTULO_ESTAGIO_PROSPECCAO[valor],
  }));
  const cnpj = cnpjParaTela(f.cnpj);
  // Sem nome na coleta, a razão social guardada é o próprio CNPJ: não repete. O nome sai sem CPF de MEI.
  const nome = normalizarCnpj(f.razaoSocial) ? null : nomeFornecedorParaTela(f.razaoSocial);

  return (
    <li>
      <article
        className="kb-cartao"
        data-urgencia={urgenciaDoCartao(f.estagio, vencido)}
        // O cartão inteiro não é um botão: o cursor padrão evita sugerir um clique que não existe.
        style={{ cursor: "default" }}
      >
        <div className="kb-cartao-topo">
          <div className="min-w-0">
            <h3 className="kb-cartao-nome break-words">{nome ?? cnpj ?? "Fornecedor sem nome"}</h3>
            {nome && cnpj && <p className="kb-sub codigo">{cnpj}</p>}
          </div>
        </div>

        <div className="kb-fatos">
          <div className="kb-fato">
            <span className="eyebrow">Atas vigentes</span>
            <p className="valor numero">{f.atasVigentes}</p>
          </div>
          <div className="kb-fato">
            <span className="eyebrow">Pontuação</span>
            <p className="valor numero">{f.pontuacao}</p>
          </div>
        </div>

        {(categorias.mostrar.length > 0 || ufs.mostrar.length > 0) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {categorias.mostrar.map((c) => (
              <SeloCategoria key={c} categoria={rotuloDaCategoria(c)} />
            ))}
            {categorias.resto > 0 && (
              <span className="text-xs" style={COR_SECUNDARIA}>
                +{categorias.resto}
              </span>
            )}
            {ufs.mostrar.map((uf) => (
              <span key={uf} className="selo-uf">
                {uf}
              </span>
            ))}
            {ufs.resto > 0 && (
              <span className="text-xs" style={COR_SECUNDARIA}>
                +{ufs.resto}
              </span>
            )}
          </div>
        )}

        <p
          className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
          style={{ color: vencido ? "var(--cor-critico)" : "var(--cor-texto-2)" }}
        >
          <span>Próximo contato:</span>
          {f.proximoContatoEm ? (
            <b className="numero">{dataSoDia(f.proximoContatoEm)}</b>
          ) : (
            <span style={COR_SECUNDARIA}>não marcado</span>
          )}
          {vencido && <Badge tom="critico">Vencido</Badge>}
        </p>

        {f.observacoes && (
          <p className="mt-2 whitespace-pre-line break-words text-xs leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
            {cortarTexto(f.observacoes, MAX_OBSERVACOES_NO_CARTAO)}
          </p>
        )}

        <div className="kb-rodape">
          <Link href={hrefRadar({ fornecedor: f.cnpj })} className="botao-atas link text-[12.5px]">
            Ver atas no radar →
          </Link>
        </div>

        <details className="mt-3 border-t pt-3" style={{ borderColor: "var(--cor-borda)" }}>
          <summary className="cursor-pointer text-[12.5px] font-semibold" style={{ color: "var(--cor-marca-clara)" }}>
            Mover ou anotar
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            <FormularioMoverEstagio id={f.id} destinos={destinos} />
            <FormularioAnotacao
              id={f.id}
              proximoContatoEm={dataParaCampo(f.proximoContatoEm)}
              observacoes={f.observacoes ?? ""}
            />
          </div>
        </details>
      </article>
    </li>
  );
}
