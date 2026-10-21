import {
  dataSoDia,
  formatarCnpj,
  moedaReais,
  nomeFornecedorParaTela,
  textoVigencia,
} from "@/lib/acompanhamento-view";
import { resumir, urlContratoPncp } from "@/lib/sinais-preditivos";

/** Dados de um contrato público como a tela os mostra (valores já em número). */
export interface DadosContrato {
  numeroControlePncp: string;
  orgaoNome: string;
  fornecedorNome: string | null;
  fornecedorCnpj: string | null;
  objeto: string;
  valorGlobal: number | null;
  dataAssinatura: Date | null;
  vigenciaInicio: Date | null;
  vigenciaFim: Date | null;
}

export interface DadosMunicipio {
  nome: string;
  uf: string | null;
}

const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;
const COR_CORPO = { color: "var(--cor-texto-2)" } as const;

export function NomeMunicipio({ municipio }: { municipio: DadosMunicipio | null }) {
  if (!municipio) {
    return (
      <span className="titulo-linha" style={COR_SECUNDARIA}>
        Município não identificado
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="titulo-linha">{municipio.nome}</span>
      {municipio.uf && <span className="selo-uf">{municipio.uf}</span>}
    </span>
  );
}

/** Link para a página pública do contrato no PNCP; sem URL possível, mostra o número de controle. */
export function LinkContratoPncp({ numeroControle }: { numeroControle: string }) {
  const url = urlContratoPncp(numeroControle);
  if (!url) {
    return (
      <span className="codigo text-xs" style={COR_SECUNDARIA}>
        {numeroControle}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[13px] font-bold hover:underline"
      style={{ color: "var(--cor-marca-clara)" }}
    >
      Ver no PNCP →
    </a>
  );
}

/** Órgão, fornecedor, objeto resumido, valor, vigência e link do contrato. */
export function DadosDoContrato({ contrato, objetoMax = 200 }: { contrato: DadosContrato; objetoMax?: number }) {
  const fornecedor = nomeFornecedorParaTela(contrato.fornecedorNome);
  const cnpj = formatarCnpj(contrato.fornecedorCnpj);
  return (
    <>
      <p className="mt-1 text-[13px] leading-relaxed" style={COR_CORPO}>
        <span style={COR_SECUNDARIA}>Órgão contratante: </span>
        {contrato.orgaoNome || "—"}
      </p>
      <p className="text-[13px] leading-relaxed" style={COR_CORPO}>
        <span style={COR_SECUNDARIA}>Fornecedor: </span>
        {fornecedor ?? "—"}
        {cnpj && <span className="codigo" style={COR_SECUNDARIA}> · {cnpj}</span>}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed" style={COR_CORPO}>
        {contrato.objeto ? resumir(contrato.objeto, objetoMax) : "Objeto não informado"}
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={COR_SECUNDARIA}>
        <span>
          Valor global{" "}
          <b className="numero" style={{ color: "var(--cor-texto)" }}>
            {moedaReais(contrato.valorGlobal)}
          </b>
        </span>
        <span>
          Vigência <span className="numero">{textoVigencia(contrato.vigenciaInicio, contrato.vigenciaFim)}</span>
        </span>
        {contrato.dataAssinatura && (
          <span>
            Assinado em <span className="numero">{dataSoDia(contrato.dataAssinatura)}</span>
          </span>
        )}
        <LinkContratoPncp numeroControle={contrato.numeroControlePncp} />
      </p>
    </>
  );
}
