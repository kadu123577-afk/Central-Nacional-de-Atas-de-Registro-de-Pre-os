import Link from "next/link";
import { ROTULO_ESTAGIO_OPORTUNIDADE, estagioOportunidadeValido } from "@/lib/oportunidades";
import { confirmarVinculoContrato, descartarVinculoContrato } from "./actions";
import { BotaoDecisao } from "./botao-decisao";
import { DadosDoContrato, NomeMunicipio, type DadosContrato, type DadosMunicipio } from "./bloco-contrato";

export interface DadosVinculoSugerido {
  id: string;
  nivel: string;
  motivo: string;
  contrato: DadosContrato;
  municipio: DadosMunicipio | null;
  ata: { id: string; numero: string } | null;
  negociacao: { vendedorNome: string; estagio: string } | null;
}

const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;

/**
 * Uma linha da fila "A confirmar": o que o PNCP publicou, por que o sistema
 * ligou ao funil e os dois botões. O nível do vínculo aparece no título do
 * grupo (página), não se repete em cada linha. Cada botão é um formulário com
 * o id do vínculo em campo oculto; a action só muda o que ainda está "sugerido".
 */
export function LinhaVinculoSugerido({ vinculo }: { vinculo: DadosVinculoSugerido }) {
  const { negociacao, ata } = vinculo;
  const estagio = negociacao
    ? estagioOportunidadeValido(negociacao.estagio)
      ? ROTULO_ESTAGIO_OPORTUNIDADE[negociacao.estagio]
      : negociacao.estagio
    : null;
  const idMotivo = `motivo-descarte-${vinculo.id}`;

  return (
    <li className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0 flex-1">
        <NomeMunicipio municipio={vinculo.municipio} />

        <DadosDoContrato contrato={vinculo.contrato} />

        <div
          className="mt-3 rounded-[var(--raio)] px-3 py-2.5 text-[13px] leading-relaxed"
          style={{ background: "var(--cor-superficie-2)", color: "var(--cor-texto-2)" }}
        >
          <p>
            <span style={COR_SECUNDARIA}>Motivo da sugestão: </span>
            {vinculo.motivo}
          </p>
          <p className="mt-0.5">
            {ata || negociacao ? (
              <>
                {ata && (
                  <>
                    <span style={COR_SECUNDARIA}>Ata: </span>
                    <Link
                      href={`/admin/atas/${ata.id}/municipios`}
                      className="font-semibold hover:underline"
                      style={{ color: "var(--cor-marca-clara)" }}
                    >
                      Nº <span className="codigo">{ata.numero}</span>
                    </Link>
                  </>
                )}
                {ata && negociacao && <span style={COR_SECUNDARIA}> · </span>}
                {negociacao && (
                  <>
                    <span style={COR_SECUNDARIA}>Negociação: </span>
                    {negociacao.vendedorNome} ({estagio})
                  </>
                )}
              </>
            ) : (
              <span style={COR_SECUNDARIA}>Sem ata nem negociação ligadas na rede.</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-xs shrink-0 flex-col gap-2 xl:w-60">
        <form action={confirmarVinculoContrato}>
          <input type="hidden" name="vinculoId" value={vinculo.id} />
          <BotaoDecisao className="botao-atas pequeno w-full">Confirmar vínculo</BotaoDecisao>
        </form>
        <form action={descartarVinculoContrato} className="flex flex-col gap-2">
          <input type="hidden" name="vinculoId" value={vinculo.id} />
          <label htmlFor={idMotivo} className="sr-only">
            Motivo do descarte (opcional)
          </label>
          <input
            id={idMotivo}
            name="motivo"
            maxLength={200}
            autoComplete="off"
            className="campo-atas py-2 text-[13px]"
            placeholder="Motivo do descarte (opcional)"
          />
          <BotaoDecisao className="botao-atas pequeno secundario w-full">Descartar</BotaoDecisao>
        </form>
      </div>
    </li>
  );
}
