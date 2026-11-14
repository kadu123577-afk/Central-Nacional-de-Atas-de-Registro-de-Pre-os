import {
  TAMANHO_PAGINA_PADRAO,
  mapearItemPncp,
  montarUrlItensCompra,
  montarUrlResultadosItem,
  parseNumeroControlePncpCompra,
  type IdentificadorCompraPncp,
  type ItemCompraPncpBruto,
  type ItemImportado,
  type ResultadoItemPncpBruto,
} from "@/lib/pncp";
import { normalizarCnpj } from "@/lib/radar-atas";
import { temMaisDeQuatroCasas } from "@/lib/valor-unitario";

/**
 * Itens de uma ata a partir do PNCP (14/11/2026): o estagiário, em vez de digitar ou importar, pede "Buscar os
 * itens no PNCP" e confere o que veio. A API pública do PNCP não lista os itens da ata em si; lista os da COMPRA
 * de origem e, por item, o resultado (quem ganhou, com a quantidade e o valor HOMOLOGADOS). A ata de uma empresa
 * leva só os itens que ELA ganhou, ao valor homologado, e não o estimado do edital.
 *
 * O texto que sai é o mesmo texto de planilha do importador: volta ao campo, a pessoa confere e corrige, e só
 * então grava. Nada é gravado aqui.
 */

const CNPJ_A_CONFIRMAR = "00000000000000";
const TIMEOUT_MS = 20_000;
/** Teto de itens lidos por busca (cada item é mais uma consulta ao PNCP). */
export const MAX_ITENS_DO_PNCP = 300;
const CONSULTAS_SIMULTANEAS = 6;

/** Resultado do item como a API devolve; só o que usamos, mais a data de cancelamento do resultado. */
type ResultadoComCancelamento = ResultadoItemPncpBruto & { dataCancelamento?: string | null };

/**
 * A compra de origem, pelo link da ata no PNCP (.../app/atas/{cnpj}/{ano}/{compra}/{ata}) ou pelo número de
 * controle (da ata, "cnpj-1-000075/2024-000001", ou da compra, "cnpj-1-000075/2024").
 */
export function compraDaAtaNoPncp(entrada: {
  linkPncp?: string | null;
  numeroControlePncp?: string | null;
}): IdentificadorCompraPncp | null {
  const link = entrada.linkPncp?.match(/\/app\/atas\/(\d{14})\/(\d{4})\/(\d+)\/\d+/);
  if (link) return { cnpj: link[1], ano: Number(link[2]), sequencialCompra: Number(link[3]) };

  const numero = entrada.numeroControlePncp?.trim();
  if (numero) {
    const daAta = numero.match(/^(\d{14})-\d+-(\d+)\/(\d{4})-\d+$/);
    if (daAta) return { cnpj: daAta[1], sequencialCompra: Number(daAta[2]), ano: Number(daAta[3]) };
    return parseNumeroControlePncpCompra(numero);
  }
  return null;
}

export interface ItensDoPncp {
  itens: ItemImportado[];
  /** Itens da compra que ninguém ganhou (sem resultado): não fazem parte de nenhuma ata. */
  semResultado: number;
  /** Itens ganhos por OUTRA empresa: ficam fora da ata desta. */
  deOutraEmpresa: number;
  /** Itens com preço de mais de quatro casas decimais (o sistema guarda até quatro). */
  comMaisDeQuatroCasas: number;
  /** A compra tem mais itens que o teto desta busca. */
  truncado: boolean;
  /** Sem CNPJ confirmado da empresa não dá para separar os itens dela: entraram os do primeiro resultado de cada item. */
  empresaNaoConfirmada: boolean;
}

export type BuscaNoPncp = ({ ok: true } & ItensDoPncp) | { ok: false; erro: string };

export type BuscarJson = (url: string) => Promise<unknown | null>;

function cabecalhos(): HeadersInit {
  const base: Record<string, string> = { accept: "application/json" };
  const token = process.env.PNCP_ACCESS_TOKEN;
  if (token) base.authorization = `Bearer ${token}`;
  return base;
}

/**
 * O JSON da resposta, ou null quando não há o que ler: resposta que não é 2xx, "204 sem conteúdo" (é o que o PNCP
 * devolve para o item que ninguém ganhou; conferido na API em 14/11/2026) ou corpo vazio ou que não é JSON.
 * Ler esse corpo com .json() lançaria erro e derrubaria a busca inteira por causa de um item.
 */
export async function jsonOuNull(resposta: Response): Promise<unknown | null> {
  if (!resposta.ok || resposta.status === 204) return null;
  const texto = await resposta.text();
  if (!texto.trim()) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/** GET no PNCP: o JSON, ou null se não houver (ver jsonOuNull). Erro de rede continua lançando. */
const buscarJsonDoPncp: BuscarJson = async (url) => {
  const resposta = await fetch(url, { headers: cabecalhos(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  return jsonOuNull(resposta);
};

/** Roda `fazer` sobre a lista com no máximo `n` chamadas ao mesmo tempo, mantendo a ordem do resultado. */
async function emParalelo<T, R>(lista: T[], n: number, fazer: (item: T) => Promise<R>): Promise<R[]> {
  const saida = new Array<R>(lista.length);
  let proximo = 0;
  async function trabalhador() {
    while (proximo < lista.length) {
      const i = proximo;
      proximo += 1;
      saida[i] = await fazer(lista[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, trabalhador));
  return saida;
}

/**
 * Busca no PNCP os itens da compra e, para cada um, o resultado; devolve os itens da empresa da ata, ao valor
 * homologado. `fornecedorCnpj` é o CNPJ da empresa da ata (com ou sem máscara; o provisório da importação não vale).
 */
export async function buscarItensDaAtaNoPncp(
  compra: IdentificadorCompraPncp,
  opcoes: { fornecedorCnpj?: string | null; buscarJson?: BuscarJson } = {},
): Promise<BuscaNoPncp> {
  const buscar = opcoes.buscarJson ?? buscarJsonDoPncp;
  const cnpjDaEmpresa = normalizarCnpj(opcoes.fornecedorCnpj ?? "");
  const empresa = cnpjDaEmpresa && cnpjDaEmpresa !== CNPJ_A_CONFIRMAR ? cnpjDaEmpresa : null;

  let brutos: ItemCompraPncpBruto[] = [];
  let truncado = false;
  try {
    for (let pagina = 1; ; pagina += 1) {
      const url = montarUrlItensCompra(compra, { pagina, tamanhoPagina: TAMANHO_PAGINA_PADRAO });
      const lote = (await buscar(url)) as ItemCompraPncpBruto[] | null;
      if (!Array.isArray(lote)) {
        if (pagina === 1) {
          return { ok: false, erro: "Não consegui consultar o PNCP agora (ou a compra não existe lá). Tente de novo em instantes ou use o PDF e o Excel." };
        }
        break;
      }
      brutos = brutos.concat(lote);
      if (brutos.length >= MAX_ITENS_DO_PNCP) {
        truncado = brutos.length > MAX_ITENS_DO_PNCP || lote.length === TAMANHO_PAGINA_PADRAO;
        brutos = brutos.slice(0, MAX_ITENS_DO_PNCP);
        break;
      }
      if (lote.length < TAMANHO_PAGINA_PADRAO) break;
    }
  } catch {
    return { ok: false, erro: "Não consegui consultar o PNCP agora. Tente de novo em instantes ou use o PDF e o Excel." };
  }
  if (brutos.length === 0) return { ok: false, erro: "O PNCP não trouxe nenhum item para esta compra." };

  let resultadosPorItem: (ResultadoComCancelamento[] | null)[];
  try {
    resultadosPorItem = await emParalelo(brutos, CONSULTAS_SIMULTANEAS, async (item) => {
      const r = (await buscar(montarUrlResultadosItem(compra, item.numeroItem))) as ResultadoComCancelamento[] | null;
      return Array.isArray(r) ? r : null;
    });
  } catch {
    return { ok: false, erro: "A consulta ao PNCP foi interrompida no meio. Tente de novo em instantes ou use o PDF e o Excel." };
  }

  const itens: ItemImportado[] = [];
  let semResultado = 0;
  let deOutraEmpresa = 0;
  brutos.forEach((bruto, i) => {
    const vigentes = (resultadosPorItem[i] ?? []).filter((r) => !r.dataCancelamento);
    if (vigentes.length === 0) {
      semResultado += 1;
      return;
    }
    const doFornecedor = empresa ? vigentes.find((r) => normalizarCnpj(r.niFornecedor) === empresa) : vigentes[0];
    if (!doFornecedor) {
      deOutraEmpresa += 1;
      return;
    }
    itens.push(mapearItemPncp(bruto, doFornecedor));
  });

  if (itens.length === 0) {
    return {
      ok: false,
      erro: empresa
        ? "Nenhum item desta compra foi ganho pela empresa da ata no PNCP. Confira o CNPJ da empresa ou use o PDF e o Excel."
        : "Nenhum item desta compra tem resultado (vencedor) no PNCP ainda. Use o PDF e o Excel.",
    };
  }

  return {
    ok: true,
    itens,
    semResultado,
    deOutraEmpresa,
    comMaisDeQuatroCasas: itens.filter((i) => temMaisDeQuatroCasas(i.valorUnitario)).length,
    truncado,
    empresaNaoConfirmada: empresa === null,
  };
}

/** Os itens no texto de planilha do importador (valor com vírgula decimal). */
export function itensDoPncpParaTexto(itens: ItemImportado[]): string {
  const campo = (c: string) => (c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c);
  const cabecalho = ["Descrição", "Unidade", "Quantidade", "Valor unitário"].join("\t");
  const linhas = itens.map((i) =>
    [campo(i.descricao.replace(/\s+/g, " ").trim()), campo(i.unidade), String(i.quantidadeRegistrada), String(i.valorUnitario).replace(".", ",")].join("\t"),
  );
  return [cabecalho, ...linhas].join("\n");
}

/** O recado que acompanha a lista vinda do PNCP: o que entrou e o que ficou de fora, e por quê. */
export function avisoDoPncp(r: ItensDoPncp): string {
  const partes = [`Li ${r.itens.length} item(ns) no PNCP, ao valor homologado. Confira antes de gravar: o PNCP é a fonte oficial, mas a lista pode estar incompleta ou diferente do que a empresa registrou.`];
  if (r.deOutraEmpresa > 0) partes.push(`${r.deOutraEmpresa} item(ns) da compra foram ganhos por outra empresa e ficaram de fora.`);
  if (r.semResultado > 0) partes.push(`${r.semResultado} item(ns) não têm resultado no PNCP (ninguém ganhou) e ficaram de fora.`);
  if (r.empresaNaoConfirmada) partes.push("A empresa da ata ainda não está confirmada, então não deu para separar os itens dela: entrou o primeiro resultado de cada item.");
  if (r.comMaisDeQuatroCasas > 0) {
    partes.push(`${r.comMaisDeQuatroCasas} item(ns) têm preço com mais de quatro casas decimais (ex.: 0,10055): o sistema guarda quatro, então o valor será arredondado. Confira.`);
  }
  if (r.truncado) partes.push(`A compra tem mais de ${MAX_ITENS_DO_PNCP} itens: só os primeiros ${MAX_ITENS_DO_PNCP} foram lidos.`);
  return partes.join(" ");
}
