import {
  mapearContratoPncp,
  montarUrlContratosOrgao,
  quebrarEmJanelasAnuais,
  TAMANHO_PAGINA_PADRAO,
  type ContratoImportado,
  type ContratoPncpBruto,
  type RespostaContratosPncp,
} from "@/lib/pncp-historico";
import { classificarObjeto } from "@/lib/classificador-objeto";

const TIMEOUT_MS = 40_000;
const ANOS_PADRAO_JANELA = 3;

export interface ResumoConsumoCategoria {
  categoria: string;
  ultimaContratacao: Date;
  valorUltimaContratacao: number;
  quantidadeContratosNaJanela: number;
  objetoUltimaContratacao: string;
}

export interface ResultadoRaioXConsumo {
  contratosEncontrados: number;
  categoriasIdentificadas: ResumoConsumoCategoria[];
  erro?: string;
}

async function buscarContratosDeUmaJanela(
  cnpj: string,
  inicio: Date,
  fim: Date,
): Promise<ContratoImportado[]> {
  const contratos: ContratoImportado[] = [];
  let pagina = 1;
  let totalPaginas = 1;

  do {
    const url = montarUrlContratosOrgao({
      cnpjOrgao: cnpj,
      dataInicial: inicio,
      dataFinal: fim,
      pagina,
      tamanhoPagina: TAMANHO_PAGINA_PADRAO,
    });

    const resposta = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Uma janela sem resultado não é erro — o PNCP responde 204 sem corpo
    // (confirmado ao vivo com uma janela de 1-2 dias, resíduo da quebra em
    // blocos de 365 dias) ou, às vezes, 200 com lista vazia. Nenhum dos
    // dois pode cair no `.json()` de corpo vazio (`Unexpected end of JSON
    // input`) — só falha de verdade (ex.: 5xx) encerra essa janela sem
    // derrubar as outras.
    if (!resposta.ok || resposta.status === 204) {
      return contratos;
    }
    const corpoBruto = await resposta.text();
    if (!corpoBruto) {
      return contratos;
    }

    const corpo = JSON.parse(corpoBruto) as RespostaContratosPncp;
    totalPaginas = corpo.totalPaginas || 1;
    for (const bruto of corpo.data as ContratoPncpBruto[]) {
      contratos.push(mapearContratoPncp(bruto));
    }
    pagina += 1;
  } while (pagina <= totalPaginas);

  return contratos;
}

/**
 * Raio-X de consumo (2026-09-25) — pra um município (pelo CNPJ), busca
 * no PNCP todo contrato assinado nos últimos `anos` anos e classifica
 * por categoria (src/lib/classificador-objeto.ts), guardando a
 * contratação mais recente de cada categoria encontrada. É a resposta
 * pra "quanto tempo tem que eles não fazem um pregão de X".
 *
 * Chamada sob demanda (um município de cada vez, botão na tela da
 * entidade) — não em lote pros 1000+ municípios de uma vez, porque o
 * PNCP limita cada consulta a 365 dias de janela (quebrada em blocos por
 * `quebrarEmJanelasAnuais`), e isso já significa várias chamadas por
 * município.
 */
export async function calcularRaioXConsumo(
  cnpj: string,
  anos: number = ANOS_PADRAO_JANELA,
): Promise<ResultadoRaioXConsumo> {
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setFullYear(inicio.getFullYear() - anos);

  const janelas = quebrarEmJanelasAnuais(inicio, fim);

  try {
    // Sequencial, não Promise.all — disparar as janelas de um município
    // em paralelo, multiplicado por milhares de municípios num lote,
    // sobrecarrega o PNCP (confirmado ao vivo: um lote de 1067
    // municípios teve 307 timeouts, concentrados numa faixa contígua do
    // processamento — sinal de degradação por carga sustentada, não
    // bloqueio pontual).
    const todosContratos: ContratoImportado[] = [];
    for (const j of janelas) {
      const contratos = await buscarContratosDeUmaJanela(cnpj, j.inicio, j.fim);
      todosContratos.push(...contratos);
    }

    const porCategoria = new Map<string, ContratoImportado[]>();
    for (const contrato of todosContratos) {
      const categoria = classificarObjeto(contrato.objeto);
      if (!categoria) continue;
      const lista = porCategoria.get(categoria) ?? [];
      lista.push(contrato);
      porCategoria.set(categoria, lista);
    }

    const categoriasIdentificadas: ResumoConsumoCategoria[] = [];
    for (const [categoria, contratos] of porCategoria) {
      const maisRecente = contratos.reduce((a, b) =>
        a.dataAssinatura > b.dataAssinatura ? a : b,
      );
      categoriasIdentificadas.push({
        categoria,
        ultimaContratacao: maisRecente.dataAssinatura,
        valorUltimaContratacao: maisRecente.valorGlobal,
        quantidadeContratosNaJanela: contratos.length,
        objetoUltimaContratacao: maisRecente.objeto,
      });
    }
    categoriasIdentificadas.sort(
      (a, b) => b.ultimaContratacao.getTime() - a.ultimaContratacao.getTime(),
    );

    return { contratosEncontrados: todosContratos.length, categoriasIdentificadas };
  } catch (erro) {
    return {
      contratosEncontrados: 0,
      categoriasIdentificadas: [],
      erro: erro instanceof Error ? erro.message : "Erro desconhecido ao consultar o PNCP",
    };
  }
}
