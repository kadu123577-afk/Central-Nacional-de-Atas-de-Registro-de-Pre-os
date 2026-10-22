import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SeloCategoria } from "@/components/ui/selo-categoria";
import { dataSoDia } from "@/lib/acompanhamento-view";
import { rotuloDaCategoria } from "@/lib/categorias";
import {
  diasRestantesBrasilia,
  fornecedorParaTela,
  hrefRadar,
  rotuloAtaPncp,
  textoDiasRestantes,
  tomDiasRestantes,
  urlAtaPncp,
} from "@/lib/radar-atas-view";
import { resumir } from "@/lib/sinais-preditivos";

/** Uma ata do radar como a tela a mostra. */
export interface DadosAtaRadar {
  id: string;
  numeroControlePncpAta: string;
  orgaoNome: string;
  uf: string | null;
  municipioNome: string | null;
  objeto: string;
  categoria: string | null;
  vigenciaFim: Date;
  fornecedorCnpj: string | null;
  fornecedorNome: string | null;
  municipiosComDemanda: number;
  pontuacao: number;
}

const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;
const MAX_OBJETO = 150;

/** A ata no PNCP: link para a página pública, ou só o número quando ele não tem a forma esperada. */
function LinkAta({ numeroControle }: { numeroControle: string }) {
  const url = urlAtaPncp(numeroControle);
  const rotulo = rotuloAtaPncp(numeroControle);
  if (!url) {
    return (
      <span className="codigo break-all text-[13px]" style={{ color: "var(--cor-texto)" }}>
        {rotulo}
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="botao-atas link text-[13px]">
      <span className="codigo">{rotulo}</span> →<span className="sr-only"> (abre a ata no PNCP em nova aba)</span>
    </a>
  );
}

/**
 * Tabela do radar. Fornecedor: nome já sem dado pessoal e CNPJ só quando é
 * empresa; o nome leva ao radar filtrado por aquele fornecedor.
 */
export function TabelaAtasRadar({ atas, agora }: { atas: DadosAtaRadar[]; agora: Date }) {
  return (
    <div className="moldura-tabela">
      <table className="tabela-atas min-w-[1040px]">
        <thead>
          <tr>
            <th>Ata</th>
            <th>Objeto</th>
            <th>Categoria</th>
            <th>Órgão gerenciador</th>
            <th>Vigência até</th>
            <th>Fornecedor</th>
            <th>Municípios com demanda</th>
            <th>Pontuação</th>
          </tr>
        </thead>
        <tbody>
          {atas.map((a) => {
            const dias = diasRestantesBrasilia(a.vigenciaFim, agora);
            const fornecedor = fornecedorParaTela(a.fornecedorNome, a.fornecedorCnpj);
            return (
              <tr key={a.id}>
                <td className="align-top">
                  <LinkAta numeroControle={a.numeroControlePncpAta} />
                </td>
                <td className="min-w-[16rem] max-w-[24rem] align-top">
                  <span className="titulo-linha block text-[13.5px] leading-snug" title={a.objeto}>
                    {a.objeto ? resumir(a.objeto, MAX_OBJETO) : "Objeto não informado"}
                  </span>
                </td>
                <td className="align-top">
                  {a.categoria ? (
                    <SeloCategoria categoria={rotuloDaCategoria(a.categoria)} />
                  ) : (
                    <span className="text-xs" style={COR_SECUNDARIA}>
                      Não classificada
                    </span>
                  )}
                </td>
                <td className="min-w-[12rem] align-top">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="titulo-linha text-[13.5px]">{a.orgaoNome}</span>
                    {a.uf && <span className="selo-uf">{a.uf}</span>}
                  </span>
                  {a.municipioNome && (
                    <span className="mt-0.5 block text-xs" style={COR_SECUNDARIA}>
                      {a.municipioNome}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap align-top">
                  <span className="numero block">{dataSoDia(a.vigenciaFim)}</span>
                  <span className="mt-1 block">
                    <Badge tom={tomDiasRestantes(dias)}>{textoDiasRestantes(dias)}</Badge>
                  </span>
                </td>
                <td className="min-w-[12rem] align-top">
                  {fornecedor.nome || fornecedor.cnpj ? (
                    <>
                      {a.fornecedorCnpj && fornecedor.cnpj ? (
                        <Link
                          href={hrefRadar({ fornecedor: a.fornecedorCnpj })}
                          className="titulo-linha text-[13.5px] hover:text-[var(--cor-marca-clara)]"
                          title="Ver só as atas deste fornecedor"
                        >
                          {fornecedor.nome ?? fornecedor.cnpj}
                        </Link>
                      ) : (
                        <span className="titulo-linha text-[13.5px]">{fornecedor.nome}</span>
                      )}
                      {fornecedor.nome && fornecedor.cnpj && (
                        <span className="codigo mt-0.5 block text-xs" style={COR_SECUNDARIA}>
                          {fornecedor.cnpj}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs" style={COR_SECUNDARIA}>
                      Não identificado
                    </span>
                  )}
                </td>
                <td className="numero align-top">{a.municipiosComDemanda}</td>
                <td className="numero align-top text-[15px] font-extrabold" style={{ color: "var(--cor-texto)" }}>
                  {a.pontuacao}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
