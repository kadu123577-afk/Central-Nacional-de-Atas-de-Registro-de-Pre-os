/**
 * Integração com a API de dados abertos do Compras.gov.br
 * (dadosabertos.compras.gov.br) — segunda fonte de rastreamento de atas,
 * rodando em paralelo com o PNCP (src/lib/pncp.ts), não em substituição a
 * ele (decisão explícita: "a gente pode as duas fontes ao invés de ter só
 * uma", 2026-09-04).
 *
 * Verificada ao vivo nesta sessão (curl direto, 2026-09-04) contra o
 * Swagger (`/v3/api-docs`) e as respostas reais dos dois endpoints usados:
 *
 * 1. `/modulo-arp/1_consultarARP` — lista atas de registro de preços por
 *    período de vigência. Exige `dataVigenciaInicialMin`/`Max`
 *    (formato AAAA-MM-DD, confirmado por um erro 400 quando omitidos).
 *    `tamanhoPagina` precisa estar entre 10 e 500 (confirmado por um erro
 *    400: "Informe um número de paginação no intervalo de 10 a 500").
 * 2. `/modulo-arp/2_consultarARPItem` — itens de uma compra, já vindo com
 *    descrição, fornecedor (CNPJ/nome) e valor unitário juntos numa única
 *    chamada — diferente do PNCP, que exige duas chamadas separadas
 *    (itens, depois resultados) pra montar a mesma informação. **Não**
 *    aceita `numeroAtaRegistroPreco` como filtro (checado contra o
 *    `/v3/api-docs` ao vivo — só existe nesse endpoint pra `1_consultarARP`
 *    e pro `numeroControlePncpAta` do `2.1_consultarARPItem_Id`, não
 *    aqui); os filtros de escopo aceitos são `numeroCompra` +
 *    `codigoUnidadeGerenciadora` (mais o mesmo par
 *    `dataVigenciaInicialMin`/`Max`, também obrigatório aqui). Uma compra
 *    pode gerar várias atas (um pregão com vários grupos/lotes cada um
 *    virando uma ata separada, confirmado ao vivo: numeroCompra "90005" da
 *    PMSP gerou as atas 00010, 00011 e 00014/2026), então o item retornado
 *    precisa ser filtrado por `numeroAtaRegistroPreco` no lado do cliente
 *    — é o que `mapearItensDaCompra` faz.
 *
 * Público, sem autenticação — nenhuma chamada de teste precisou de chave de
 * API. Dados confirmados como multi-esfera (uma mesma consulta sem filtro
 * trouxe Polícia Federal, Secretaria de Saúde do ES e Prefeitura de
 * Aquiraz/CE) e atuais (atualizações datadas de 2026) — não é o mesmo
 * "Painel de Preços" visual que parou de atualizar em julho/2025, é a base
 * de dados por trás dele.
 *
 * O identificador de controle PNCP (`numeroControlePncpAta`/
 * `numeroControlePncpCompra`) segue o mesmo formato já tratado em
 * src/lib/pncp.ts (`{cnpj:14}-{tipo}-{sequencial}/{ano}`) — é o mesmo
 * espaço de identificadores, por isso a deduplicação contra o campo único
 * `Ata.numeroControlePncp` funciona igual para as duas fontes. Nenhum dos
 * dois endpoints traz o CNPJ do órgão gerenciador direto (só um código
 * interno SIASG, `codigoUnidadeGerenciadora`) — por isso o CNPJ é extraído
 * do prefixo de 14 dígitos do número de controle, com uma regex própria
 * (mantida separada da de pncp.ts por design: os módulos de integração
 * externa deste projeto são intencionalmente independentes entre si, sem
 * import cruzado, aceitando essa pequena duplicação em troca de
 * desacoplamento).
 *
 * Nenhum dos dois endpoints informa a esfera federativa do órgão
 * (federal/estadual/distrital/municipal) — inferir isso a partir do nome
 * do órgão seria arriscado demais (essa informação alimenta direto a trava
 * de elegibilidade do art. 86, ver src/lib/esferas.ts), então todo órgão
 * novo criado por este importador entra com `esfera: "não informada"`,
 * igual ao rastreador do PNCP — o padrão já existente de "esfera
 * desconhecida bloqueia adesão" (verificarElegibilidadeEsfera) cobre esse
 * caso com segurança, até que um admin confirme manualmente.
 */

const BASE_URL = "https://dadosabertos.compras.gov.br";
export const TAMANHO_PAGINA_MINIMO = 10;
export const TAMANHO_PAGINA_MAXIMO = 500;
export const TAMANHO_PAGINA_PADRAO = 100;

/** Item de `resultado` em GET /modulo-arp/1_consultarARP. Vários campos
 * numéricos na API real vêm como string (confirmado ao vivo em
 * 2026-09-04: `codigoUnidadeGerenciadora: "925000"`, `anoCompra: "2026"`),
 * então tipamos como string aqui — o cliente nunca faz aritmética com
 * eles, só usa em URL/comparação. */
export interface AtaComprasGovBruta {
  numeroAtaRegistroPreco: string;
  codigoUnidadeGerenciadora: string;
  nomeUnidadeGerenciadora: string;
  codigoOrgao: number;
  nomeOrgao: string;
  numeroCompra: string;
  anoCompra: string;
  dataAssinatura: string;
  dataVigenciaInicial: string;
  dataVigenciaFinal: string;
  valorTotal: number;
  statusAta: string;
  objeto: string;
  quantidadeItens: number;
  ataExcluido: boolean;
  numeroControlePncpAta: string;
  numeroControlePncpCompra: string;
  idCompra: string;
}

export interface RespostaConsultarArp {
  resultado: AtaComprasGovBruta[];
  totalPaginas?: number;
  totalRegistros?: number;
}

/** Item de `resultado` em GET /modulo-arp/2_consultarARPItem — já vem com
 * fornecedor e valor juntos, sem precisar de uma segunda chamada.
 * `numeroItem` também vem como string na API real (ex.: "00024"). */
export interface ItemComprasGovBruto {
  numeroAtaRegistroPreco: string;
  numeroItem: string;
  codigoItem: number;
  descricaoItem: string;
  tipoItem: "Material" | "Serviço";
  quantidadeHomologadaItem: number;
  niFornecedor: string;
  nomeRazaoSocialFornecedor: string;
  valorUnitario: number;
  valorTotal: number;
  codigoPdm?: number;
  nomePdm?: string;
}

export interface RespostaConsultarArpItem {
  resultado: ItemComprasGovBruto[];
  totalPaginas?: number;
  totalRegistros?: number;
}

export interface AtaImportadaComprasGov {
  numeroControlePncp: string;
  numeroControlePncpCompra: string;
  numero: string;
  objeto: string;
  dataAssinatura: Date;
  dataVigenciaFim: Date;
  orgaoGerenciador: { nome: string; cnpj: string | null };
  cancelada: boolean;
}

export interface ItemImportadoComprasGov {
  numeroAtaRegistroPreco: string;
  numeroItem: string;
  descricao: string;
  categoria: string;
  quantidadeRegistrada: number;
  valorUnitario: number;
  fornecedor: { cnpj: string; razaoSocial: string };
}

function formatarDataComprasGov(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function clampTamanhoPagina(tamanhoPagina?: number): number {
  const valor = tamanhoPagina ?? TAMANHO_PAGINA_PADRAO;
  return Math.min(TAMANHO_PAGINA_MAXIMO, Math.max(TAMANHO_PAGINA_MINIMO, valor));
}

export function montarUrlConsultarArp(params: {
  dataVigenciaInicialMin: Date;
  dataVigenciaInicialMax: Date;
  pagina: number;
  tamanhoPagina?: number;
}): string {
  const busca = new URLSearchParams({
    dataVigenciaInicialMin: formatarDataComprasGov(params.dataVigenciaInicialMin),
    dataVigenciaInicialMax: formatarDataComprasGov(params.dataVigenciaInicialMax),
    pagina: String(params.pagina),
    tamanhoPagina: String(clampTamanhoPagina(params.tamanhoPagina)),
  });
  return `${BASE_URL}/modulo-arp/1_consultarARP?${busca.toString()}`;
}

/**
 * `2_consultarARPItem` não filtra por `numeroAtaRegistroPreco` — só pela
 * compra de origem (`numeroCompra` + `codigoUnidadeGerenciadora`) dentro
 * da mesma janela de vigência obrigatória do endpoint de listagem. Uma
 * compra pode ter virado mais de uma ata (um grupo/lote por ata), então o
 * retorno traz itens de todas elas juntos — o chamador ainda precisa
 * filtrar por `numeroAtaRegistroPreco` (ver `mapearItensDaCompra`).
 */
export function montarUrlConsultarArpItem(params: {
  dataVigenciaInicialMin: Date;
  dataVigenciaInicialMax: Date;
  numeroCompra: string;
  codigoUnidadeGerenciadora: string;
  pagina?: number;
  tamanhoPagina?: number;
}): string {
  const busca = new URLSearchParams({
    dataVigenciaInicialMin: formatarDataComprasGov(params.dataVigenciaInicialMin),
    dataVigenciaInicialMax: formatarDataComprasGov(params.dataVigenciaInicialMax),
    numeroCompra: params.numeroCompra,
    codigoUnidadeGerenciadora: params.codigoUnidadeGerenciadora,
    pagina: String(params.pagina ?? 1),
    tamanhoPagina: String(clampTamanhoPagina(params.tamanhoPagina)),
  });
  return `${BASE_URL}/modulo-arp/2_consultarARPItem?${busca.toString()}`;
}

/**
 * O número de controle PNCP embute o CNPJ do órgão nos 14 primeiros
 * dígitos (mesmo formato tratado em parseNumeroControlePncpCompra de
 * src/lib/pncp.ts, mantido como uma regex própria por design — ver
 * cabeçalho do arquivo). Retorna `null` quando o formato não bate, o que
 * pode acontecer legitimamente nesta fonte (nem toda ata antiga tem esse
 * campo preenchido).
 */
export function extrairCnpjDoNumeroControlePncp(numeroControle: string | null | undefined): string | null {
  if (!numeroControle) return null;
  const casado = numeroControle.match(/^(\d{14})-/);
  return casado ? casado[1] : null;
}

export function mapearAtaComprasGov(bruta: AtaComprasGovBruta): AtaImportadaComprasGov {
  return {
    numeroControlePncp: bruta.numeroControlePncpAta,
    numeroControlePncpCompra: bruta.numeroControlePncpCompra,
    numero: `${bruta.numeroAtaRegistroPreco}/${bruta.anoCompra}`,
    objeto: bruta.objeto,
    dataAssinatura: new Date(bruta.dataAssinatura),
    dataVigenciaFim: new Date(bruta.dataVigenciaFinal),
    orgaoGerenciador: {
      nome: bruta.nomeOrgao || bruta.nomeUnidadeGerenciadora,
      cnpj: extrairCnpjDoNumeroControlePncp(bruta.numeroControlePncpAta),
    },
    cancelada: bruta.ataExcluido,
  };
}

export function mapearItemComprasGov(bruta: ItemComprasGovBruto): ItemImportadoComprasGov {
  return {
    numeroAtaRegistroPreco: bruta.numeroAtaRegistroPreco,
    numeroItem: bruta.numeroItem,
    descricao: bruta.descricaoItem.trim(),
    categoria: bruta.tipoItem,
    quantidadeRegistrada: bruta.quantidadeHomologadaItem,
    valorUnitario: bruta.valorUnitario,
    fornecedor: {
      cnpj: bruta.niFornecedor,
      razaoSocial: bruta.nomeRazaoSocialFornecedor,
    },
  };
}

/**
 * Filtra e mapeia só os itens de `2_consultarARPItem` que pertencem à ata
 * pedida — necessário porque o endpoint filtra só pela compra de origem,
 * que pode ter gerado mais de uma ata (ver montarUrlConsultarArpItem).
 */
export function mapearItensDaCompra(
  itensBrutos: ItemComprasGovBruto[],
  numeroAtaRegistroPreco: string,
): ItemImportadoComprasGov[] {
  return itensBrutos
    .filter((item) => item.numeroAtaRegistroPreco === numeroAtaRegistroPreco)
    .map(mapearItemComprasGov);
}
