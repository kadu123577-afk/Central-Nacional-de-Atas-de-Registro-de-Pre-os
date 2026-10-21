import { Badge } from "@/components/ui/badge";
import { dataHoraBrasilia, dataSoDia, moedaReais, rotuloTipoTermo } from "@/lib/acompanhamento-view";
import { resumir } from "@/lib/sinais-preditivos";
import { marcarTermoLancado, marcarTermoSemComissao } from "./actions";
import { LinkContratoPncp, NomeMunicipio, type DadosMunicipio } from "./bloco-contrato";

export interface DadosAditivo {
  id: string;
  tipo: string;
  descricao: string | null;
  valorAcrescido: number | null;
  novaVigenciaFim: Date | null;
  detectadoEm: Date;
  contrato: {
    numeroControlePncp: string;
    orgaoNome: string;
    objeto: string;
    valorGlobal: number | null;
  };
  municipio: DadosMunicipio | null;
  /** Vendedor da negociação ligada ao contrato; null quando o vínculo não tem negociação. */
  vendedorNome: string | null;
}

const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;

/** Aditivos de contratos com vínculo confirmado que ainda esperam a decisão sobre a comissão. */
export function TabelaAditivos({ aditivos }: { aditivos: DadosAditivo[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabela-atas">
        <thead>
          <tr>
            <th>Aditivo</th>
            <th>Contrato</th>
            <th>Município</th>
            <th>Comissão</th>
          </tr>
        </thead>
        <tbody>
          {aditivos.map((a) => (
            <tr key={a.id}>
              <td className="align-top">
                <Badge tom={a.tipo === "aditivo_valor" ? "marca" : "neutro"}>{rotuloTipoTermo(a.tipo)}</Badge>
                {a.valorAcrescido !== null && (
                  <span className="mt-1.5 block text-[13px]">
                    Acréscimo{" "}
                    <b className="numero" style={{ color: "var(--cor-texto)" }}>
                      {moedaReais(a.valorAcrescido)}
                    </b>
                  </span>
                )}
                {a.novaVigenciaFim && (
                  <span className="mt-1.5 block text-[13px]">
                    Nova vigência até{" "}
                    <b className="numero" style={{ color: "var(--cor-texto)" }}>
                      {dataSoDia(a.novaVigenciaFim)}
                    </b>
                  </span>
                )}
                {a.descricao && (
                  <span className="mt-1.5 block max-w-[16rem] text-xs" style={COR_SECUNDARIA}>
                    {a.descricao}
                  </span>
                )}
                <span className="mt-1.5 block text-xs" style={COR_SECUNDARIA}>
                  Detectado em <span className="numero">{dataHoraBrasilia(a.detectadoEm)}</span>
                </span>
              </td>
              <td className="max-w-[22rem] align-top">
                <span className="titulo-linha block text-[13.5px] leading-snug">
                  {a.contrato.objeto ? resumir(a.contrato.objeto, 120) : "Objeto não informado"}
                </span>
                <span className="mt-0.5 block text-xs" style={COR_SECUNDARIA}>
                  {a.contrato.orgaoNome || "—"} · <span className="numero">{moedaReais(a.contrato.valorGlobal)}</span>
                </span>
                <span className="mt-0.5 block text-xs" style={COR_SECUNDARIA}>
                  {a.vendedorNome ? `Negociação de ${a.vendedorNome}` : "Sem negociação ligada ao contrato"}
                </span>
                <span className="mt-1 block">
                  <LinkContratoPncp numeroControle={a.contrato.numeroControlePncp} />
                </span>
              </td>
              <td className="align-top">
                <NomeMunicipio municipio={a.municipio} />
              </td>
              <td className="align-top">
                <div className="flex min-w-44 flex-col gap-2">
                  <form action={marcarTermoLancado}>
                    <input type="hidden" name="termoId" value={a.id} />
                    <button type="submit" className="botao-atas pequeno w-full">
                      Marcar como lançado
                    </button>
                  </form>
                  <form action={marcarTermoSemComissao}>
                    <input type="hidden" name="termoId" value={a.id} />
                    <button type="submit" className="botao-atas pequeno secundario w-full">
                      Marcar sem comissão
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
