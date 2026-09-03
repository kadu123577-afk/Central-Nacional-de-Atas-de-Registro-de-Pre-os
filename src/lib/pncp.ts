/**
 * Integração com a API pública de consulta do PNCP (Portal Nacional de
 * Contratações Públicas) para o rastreador do Sprint 7.
 *
 * Endpoint e campos verificados na documentação oficial em 2026-09-03
 * (https://pncp.gov.br/api/consulta/v1/atas — manual de integração do PNCP
 * e gist de referência da comunidade), mas a chamada de rede em si não pôde
 * ser testada ao vivo nesta sessão porque o sandbox de desenvolvimento não
 * tem saída para pncp.gov.br. As funções puras abaixo (montagem da URL e
 * mapeamento da resposta) têm testes automatizados com uma resposta de
 * exemplo fiel ao formato documentado — a chamada HTTP real precisa ser
 * validada assim que isso rodar num ambiente com acesso à internet
 * (produção na Vercel, ou localmente fora deste sandbox).
 */

const BASE_URL = "https://pncp.gov.br/api/consulta";
export const TAMANHO_PAGINA_PADRAO = 100;

export interface AtaPncpBruta {
  numeroControlePNCPAta: string;
  numeroAtaRegistroPreco: string;
  anoAta: number;
  cnpjOrgao: string;
  nomeOrgao: string;
  objetoContratacao: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  dataAssinatura: string;
  cancelado: boolean;
  dataPublicacaoPncp: string;
}

export interface RespostaConsultaAtasPncp {
  data: AtaPncpBruta[];
  totalRegistros: number;
  totalPaginas: number;
  numeroPagina: number;
}

export interface AtaImportada {
  numeroControlePncp: string;
  numero: string;
  objeto: string;
  dataAssinatura: Date;
  dataVigenciaFim: Date;
  orgaoGerenciador: { nome: string; cnpj: string };
  cancelada: boolean;
}

function formatarDataPncp(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}${mes}${dia}`;
}

export function montarUrlConsultaAtas(params: {
  dataInicial: Date;
  dataFinal: Date;
  pagina: number;
  tamanhoPagina?: number;
}): string {
  const busca = new URLSearchParams({
    dataInicial: formatarDataPncp(params.dataInicial),
    dataFinal: formatarDataPncp(params.dataFinal),
    pagina: String(params.pagina),
    tamanhoPagina: String(params.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO),
  });
  return `${BASE_URL}/v1/atas?${busca.toString()}`;
}

export function mapearAtaPncp(bruta: AtaPncpBruta): AtaImportada {
  return {
    numeroControlePncp: bruta.numeroControlePNCPAta,
    numero: `${bruta.numeroAtaRegistroPreco}/${bruta.anoAta}`,
    objeto: bruta.objetoContratacao,
    dataAssinatura: new Date(bruta.dataAssinatura),
    dataVigenciaFim: new Date(bruta.vigenciaFim),
    orgaoGerenciador: { nome: bruta.nomeOrgao, cnpj: bruta.cnpjOrgao },
    cancelada: bruta.cancelado,
  };
}
