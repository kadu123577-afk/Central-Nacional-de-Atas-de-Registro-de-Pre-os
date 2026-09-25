/**
 * Histórico de contratos por órgão no PNCP — raio-X de consumo
 * (2026-09-25): "quanto tempo tem que eles não fazem um pregão de
 * contratação de gráfica, de equipamento hospitalar, de kit escolar..."
 *
 * Endpoint `/v1/contratos` (base `.../api/consulta`, mesma base pública
 * de src/lib/pncp.ts), verificado ao vivo em 2026-09-25 — nesta sessão o
 * PNCP passou a responder (antes disso nunca tinha sido possível testar
 * ao vivo). Parâmetros confirmados via `/v3/api-docs`: `dataInicial`,
 * `dataFinal` (AAAAMMDD, obrigatórios), `cnpjOrgao` (opcional, é o que
 * filtra por município), `pagina` (obrigatório), `tamanhoPagina`.
 *
 * Limite real confirmado por um erro 422 ao vivo: **o período entre
 * dataInicial e dataFinal não pode passar de 365 dias** — por isso
 * `buscarHistoricoContratos` (rastreador-consumo-municipio.ts) quebra a
 * janela pedida em blocos de 1 ano e faz uma chamada por bloco.
 */

const BASE_URL_CONSULTA = "https://pncp.gov.br/api/consulta";
export const TAMANHO_PAGINA_PADRAO = 100;
export const JANELA_MAXIMA_DIAS = 365;

export interface ContratoPncpBruto {
  numeroControlePNCP: string;
  objetoContrato: string;
  dataAssinatura: string;
  valorGlobal: number;
  orgaoEntidade: { cnpj: string; razaoSocial: string };
}

export interface RespostaContratosPncp {
  data: ContratoPncpBruto[];
  totalRegistros: number;
  totalPaginas: number;
  numeroPagina: number;
}

export interface ContratoImportado {
  numeroControlePncp: string;
  objeto: string;
  dataAssinatura: Date;
  valorGlobal: number;
}

function formatarDataPncp(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}${mes}${dia}`;
}

export function montarUrlContratosOrgao(params: {
  cnpjOrgao: string;
  dataInicial: Date;
  dataFinal: Date;
  pagina: number;
  tamanhoPagina?: number;
}): string {
  const busca = new URLSearchParams({
    cnpjOrgao: params.cnpjOrgao,
    dataInicial: formatarDataPncp(params.dataInicial),
    dataFinal: formatarDataPncp(params.dataFinal),
    pagina: String(params.pagina),
    tamanhoPagina: String(params.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO),
  });
  return `${BASE_URL_CONSULTA}/v1/contratos?${busca.toString()}`;
}

export function mapearContratoPncp(bruto: ContratoPncpBruto): ContratoImportado {
  return {
    numeroControlePncp: bruto.numeroControlePNCP,
    objeto: bruto.objetoContrato,
    dataAssinatura: new Date(bruto.dataAssinatura),
    valorGlobal: bruto.valorGlobal,
  };
}

/** Quebra um intervalo [inicio, fim] em blocos de no máximo
 * `JANELA_MAXIMA_DIAS` dias — o PNCP rejeita (422) qualquer consulta com
 * período maior que isso. */
export function quebrarEmJanelasAnuais(inicio: Date, fim: Date): { inicio: Date; fim: Date }[] {
  const janelas: { inicio: Date; fim: Date }[] = [];
  let cursor = new Date(inicio);

  while (cursor < fim) {
    const fimJanela = new Date(cursor);
    fimJanela.setDate(fimJanela.getDate() + JANELA_MAXIMA_DIAS - 1);
    janelas.push({
      inicio: new Date(cursor),
      fim: fimJanela > fim ? new Date(fim) : fimJanela,
    });
    cursor = new Date(fimJanela);
    cursor.setDate(cursor.getDate() + 1);
  }

  return janelas;
}
