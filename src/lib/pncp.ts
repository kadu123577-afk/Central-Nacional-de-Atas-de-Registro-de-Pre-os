/**
 * Integração com as APIs do PNCP (Portal Nacional de Contratações Públicas)
 * para o rastreador do Sprint 7.
 *
 * Duas famílias de endpoint, verificadas em 2026-09-03 no manual oficial de
 * integração (economia.gov.br) e na documentação pública de consulta:
 *
 * 1. Busca de atas por período — `/v1/atas` (base `.../api/consulta`,
 *    confirmado público, sem token) — encontra atas novas e traz, entre
 *    outros campos, `numeroControlePNCPCompra`, que é a chave para a compra
 *    de origem.
 * 2. Itens e resultado (fornecedor vencedor) dessa compra —
 *    `/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens` e
 *    `.../itens/{numeroItem}/resultados` (base `.../api/pncp`) — é aqui que
 *    vem a quantidade, o valor unitário e o fornecedor vencedor de cada
 *    item. O manual mostra exemplos de leitura (GET) tanto com quanto sem o
 *    header `Authorization: Bearer`, então o cliente tenta sem token
 *    primeiro e só anexa `PNCP_ACCESS_TOKEN` (se configurado) — quando
 *    nenhum dos dois funciona (401), o rastreador cai para a importação
 *    só com metadados, sem travar o restante do lote.
 *
 * A chamada de rede em si não pôde ser testada ao vivo nesta sessão porque
 * o sandbox de desenvolvimento não tem saída para pncp.gov.br — só as
 * funções puras abaixo (montagem de URL, parsing do número de controle e
 * mapeamento das respostas) têm testes automatizados, com exemplos fiéis
 * aos campos documentados. A chamada real precisa ser validada assim que
 * isso rodar num ambiente com internet (produção na Vercel, ou localmente
 * fora deste sandbox).
 */

const BASE_URL_CONSULTA = "https://pncp.gov.br/api/consulta";
const BASE_URL_ORGAOS = "https://pncp.gov.br/api/pncp";
export const TAMANHO_PAGINA_PADRAO = 100;

export interface AtaPncpBruta {
  numeroControlePNCPAta: string;
  numeroControlePNCPCompra: string;
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
  numeroControlePncpCompra: string;
  numero: string;
  objeto: string;
  dataAssinatura: Date;
  dataVigenciaFim: Date;
  orgaoGerenciador: { nome: string; cnpj: string };
  cancelada: boolean;
}

/** Item de uma compra — GET /v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens */
export interface ItemCompraPncpBruto {
  numeroItem: number;
  materialOuServico: "M" | "S";
  descricao: string;
  quantidade: number;
  unidadeMedida: string;
  valorUnitarioEstimado: number;
}

/** Resultado (fornecedor vencedor) — .../itens/{numeroItem}/resultados */
export interface ResultadoItemPncpBruto {
  numeroItem: number;
  quantidadeHomologada: number;
  valorUnitarioHomologado: number;
  tipoPessoa: "PJ" | "PF" | "PE";
  niFornecedor: string;
  nomeRazaoSocialFornecedor: string;
}

export interface ItemImportado {
  numeroItem: number;
  descricao: string;
  categoria: string;
  unidade: string;
  quantidadeRegistrada: number;
  valorUnitario: number;
}

export interface FornecedorVencedor {
  cnpj: string;
  razaoSocial: string;
}

export interface IdentificadorCompraPncp {
  cnpj: string;
  ano: number;
  sequencialCompra: number;
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
  return `${BASE_URL_CONSULTA}/v1/atas?${busca.toString()}`;
}

export function mapearAtaPncp(bruta: AtaPncpBruta): AtaImportada {
  return {
    numeroControlePncp: bruta.numeroControlePNCPAta,
    numeroControlePncpCompra: bruta.numeroControlePNCPCompra,
    numero: `${bruta.numeroAtaRegistroPreco}/${bruta.anoAta}`,
    objeto: bruta.objetoContratacao,
    dataAssinatura: new Date(bruta.dataAssinatura),
    dataVigenciaFim: new Date(bruta.vigenciaFim),
    orgaoGerenciador: { nome: bruta.nomeOrgao, cnpj: bruta.cnpjOrgao },
    cancelada: bruta.cancelado,
  };
}

/**
 * O número de controle PNCP da compra segue o padrão
 * `{cnpj:14}-{tipoInstrumento}-{sequencial}/{ano}` (ex.:
 * "12345678000199-1-000042/2026"). Extrai as três partes que identificam a
 * compra na API de órgãos (`/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}`).
 */
export function parseNumeroControlePncpCompra(
  numeroControle: string,
): IdentificadorCompraPncp | null {
  const casado = numeroControle.match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/);
  if (!casado) return null;

  const [, cnpj, sequencial, ano] = casado;
  return { cnpj, sequencialCompra: Number(sequencial), ano: Number(ano) };
}

export function montarUrlItensCompra(
  identificador: IdentificadorCompraPncp,
  params?: { pagina?: number; tamanhoPagina?: number },
): string {
  const { cnpj, ano, sequencialCompra } = identificador;
  const busca = new URLSearchParams({
    pagina: String(params?.pagina ?? 1),
    tamanhoPagina: String(params?.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO),
  });
  return `${BASE_URL_ORGAOS}/v1/orgaos/${cnpj}/compras/${ano}/${sequencialCompra}/itens?${busca.toString()}`;
}

export function montarUrlResultadosItem(
  identificador: IdentificadorCompraPncp,
  numeroItem: number,
): string {
  const { cnpj, ano, sequencialCompra } = identificador;
  return `${BASE_URL_ORGAOS}/v1/orgaos/${cnpj}/compras/${ano}/${sequencialCompra}/itens/${numeroItem}/resultados`;
}

/**
 * Muita descrição de item do PNCP vem com um código numérico solto colado
 * no final (ex.: "Máscara cirúrgica descartável 75336346") — resíduo de
 * como o campo de texto livre foi preenchido por quem publicou, não faz
 * parte do nome do item. Remove só esse sufixo (6+ dígitos, separado por
 * espaço) — números curtos que fazem parte do nome de verdade (ex.:
 * "Parafuso M6", "Cabo 10mm") não batem no padrão e ficam intactos.
 */
export function limparDescricaoPncp(descricaoBruta: string): string {
  const semSufixoNumerico = descricaoBruta.trim().replace(/\s+\d{6,}$/, "");
  return semSufixoNumerico.length > 0 ? semSufixoNumerico : descricaoBruta.trim();
}

export function mapearItemPncp(bruta: ItemCompraPncpBruto): ItemImportado {
  return {
    numeroItem: bruta.numeroItem,
    descricao: limparDescricaoPncp(bruta.descricao),
    categoria: bruta.materialOuServico === "S" ? "Serviço" : "Material",
    unidade: bruta.unidadeMedida,
    quantidadeRegistrada: bruta.quantidade,
    valorUnitario: bruta.valorUnitarioEstimado,
  };
}

/** `null` quando o fornecedor vencedor não é pessoa jurídica (CPF/estrangeiro
 * sem CNPJ) — nosso cadastro de fornecedor exige CNPJ (Sprint 1). */
export function mapearFornecedorVencedor(
  bruta: ResultadoItemPncpBruto,
): FornecedorVencedor | null {
  if (bruta.tipoPessoa !== "PJ") return null;
  return { cnpj: bruta.niFornecedor, razaoSocial: bruta.nomeRazaoSocialFornecedor };
}
