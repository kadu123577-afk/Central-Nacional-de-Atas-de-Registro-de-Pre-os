import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { rotuloDoNivel, tomDoNivel } from "@/lib/acompanhamento-view";
import { ROTULO_ESTAGIO_OPORTUNIDADE, estagioOportunidadeValido } from "@/lib/oportunidades";
import { confirmarVinculoContrato, descartarVinculoContrato } from "./actions";
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

/**
 * Uma linha da fila "A confirmar": o que o PNCP publicou, por que o sistema
 * ligou ao funil e os dois botões. Cada botão é um formulário com o id do
 * vínculo em campo oculto; a action só muda o que ainda está "sugerido".
 */
export function LinhaVinculoSugerido({ vinculo }: { vinculo: DadosVinculoSugerido }) {
  const { negociacao, ata } = vinculo;
  const estagio = negociacao
    ? estagioOportunidadeValido(negociacao.estagio)
      ? ROTULO_ESTAGIO_OPORTUNIDADE[negociacao.estagio]
      : negociacao.estagio
    : null;

  return (
    <li className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <NomeMunicipio municipio={vinculo.municipio} />
          <Badge tom={tomDoNivel(vinculo.nivel)}>{rotuloDoNivel(vinculo.nivel)}</Badge>
        </div>

        <DadosDoContrato contrato={vinculo.contrato} />

        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
          <span style={{ color: "var(--cor-texto-3)" }}>Motivo: </span>
          {vinculo.motivo}
        </p>
        <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
          {ata || negociacao ? (
            <>
              {ata && (
                <>
                  <span style={{ color: "var(--cor-texto-3)" }}>Ata: </span>
                  <Link
                    href={`/admin/atas/${ata.id}/municipios`}
                    className="font-semibold hover:underline"
                    style={{ color: "var(--cor-marca-clara)" }}
                  >
                    Nº <span className="codigo">{ata.numero}</span>
                  </Link>
                </>
              )}
              {ata && negociacao && <span style={{ color: "var(--cor-texto-3)" }}> · </span>}
              {negociacao && (
                <>
                  <span style={{ color: "var(--cor-texto-3)" }}>Negociação: </span>
                  {negociacao.vendedorNome} ({estagio})
                </>
              )}
            </>
          ) : (
            <span style={{ color: "var(--cor-texto-3)" }}>Sem ata nem negociação ligadas na rede.</span>
          )}
        </p>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-2 lg:w-60">
        <form action={confirmarVinculoContrato}>
          <input type="hidden" name="vinculoId" value={vinculo.id} />
          <button type="submit" className="botao-atas pequeno w-full">
            Confirmar vínculo
          </button>
        </form>
        <form action={descartarVinculoContrato} className="flex flex-col gap-2">
          <input type="hidden" name="vinculoId" value={vinculo.id} />
          <input
            name="motivo"
            maxLength={200}
            className="campo-atas"
            placeholder="Motivo do descarte (opcional)"
            aria-label="Motivo do descarte (opcional)"
          />
          <button type="submit" className="botao-atas pequeno secundario w-full">
            Descartar
          </button>
        </form>
      </div>
    </li>
  );
}
