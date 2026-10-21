import { Badge } from "@/components/ui/badge";
import {
  dataHoraBrasilia,
  moedaReais,
  rotuloDoNivel,
  rotuloStatusVinculo,
  tomDoNivel,
  tomDoStatusVinculo,
} from "@/lib/acompanhamento-view";
import { resumir } from "@/lib/sinais-preditivos";
import { LinkContratoPncp, NomeMunicipio, type DadosMunicipio } from "./bloco-contrato";

export interface DadosVinculoDecidido {
  id: string;
  nivel: string;
  status: string;
  decididoPorNome: string | null;
  decididoEm: Date | null;
  contrato: {
    numeroControlePncp: string;
    orgaoNome: string;
    objeto: string;
    valorGlobal: number | null;
  };
  municipio: DadosMunicipio | null;
}

const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;

/** Últimas decisões já tomadas, só leitura; rola na horizontal dentro da moldura em tela estreita. */
export function TabelaDecididos({ decididos }: { decididos: DadosVinculoDecidido[] }) {
  return (
    <div className="moldura-tabela">
      <table className="tabela-atas min-w-[780px]">
        <thead>
          <tr>
            <th>Município</th>
            <th>Contrato</th>
            <th>Nível</th>
            <th>Decisão</th>
            <th>Decidido por</th>
          </tr>
        </thead>
        <tbody>
          {decididos.map((d) => (
            <tr key={d.id}>
              <td className="align-top">
                <NomeMunicipio municipio={d.municipio} />
              </td>
              <td className="min-w-[14rem] max-w-[22rem] align-top">
                <span className="titulo-linha block text-[13.5px] leading-snug">
                  {d.contrato.objeto ? resumir(d.contrato.objeto, 100) : "Objeto não informado"}
                </span>
                <span className="mt-0.5 block text-xs" style={COR_SECUNDARIA}>
                  {d.contrato.orgaoNome || "—"} · <span className="numero">{moedaReais(d.contrato.valorGlobal)}</span>
                </span>
                <span className="mt-1 block">
                  <LinkContratoPncp numeroControle={d.contrato.numeroControlePncp} />
                </span>
              </td>
              <td className="align-top">
                <Badge tom={tomDoNivel(d.nivel)}>{rotuloDoNivel(d.nivel)}</Badge>
              </td>
              <td className="align-top">
                <Badge tom={tomDoStatusVinculo(d.status)}>{rotuloStatusVinculo(d.status)}</Badge>
              </td>
              <td className="align-top">
                <span className="block text-[13.5px]">{d.decididoPorNome ?? "—"}</span>
                <span className="numero mt-0.5 block text-xs" style={COR_SECUNDARIA}>
                  {dataHoraBrasilia(d.decididoEm)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
