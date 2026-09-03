import { prisma } from "@/lib/prisma";
import {
  mapearAtaPncp,
  mapearFornecedorVencedor,
  mapearItemPncp,
  montarUrlConsultaAtas,
  montarUrlItensCompra,
  montarUrlResultadosItem,
  parseNumeroControlePncpCompra,
  TAMANHO_PAGINA_PADRAO,
  type ItemCompraPncpBruto,
  type ItemImportado,
  type ResultadoItemPncpBruto,
  type RespostaConsultaAtasPncp,
} from "@/lib/pncp";

const CNPJ_FORNECEDOR_A_CONFIRMAR = "00000000000000";
const TIMEOUT_MS = 20_000;

export interface ResultadoRastreamento {
  encontradas: number;
  importadasComItens: number;
  importadasSemItens: number;
  ignoradasCanceladas: number;
  ignoradasJaExistentes: number;
  erro?: string;
}

function cabecalhos(): HeadersInit {
  const base: Record<string, string> = { accept: "application/json" };
  const token = process.env.PNCP_ACCESS_TOKEN;
  if (token) base.authorization = `Bearer ${token}`;
  return base;
}

async function buscarJson<T>(url: string): Promise<T | null> {
  const resposta = await fetch(url, {
    headers: cabecalhos(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resposta.ok) return null;
  return (await resposta.json()) as T;
}

/**
 * Busca os itens da compra de origem da ata e, para cada item, o fornecedor
 * vencedor — usa a API de órgãos (/v1/orgaos/.../itens e .../resultados),
 * que segundo o manual de integração pode ou não exigir
 * `Authorization: Bearer` dependendo do ambiente (a documentação não é
 * consistente nisso). Se qualquer chamada falhar (401, rede, formato
 * inesperado), retorna `null` e o chamador cai para a importação só com
 * metadados — nunca derruba o restante do lote por causa de uma compra.
 */
async function buscarItensComFornecedor(
  numeroControlePncpCompra: string,
): Promise<ItensComFornecedor | null> {
  const identificador = parseNumeroControlePncpCompra(numeroControlePncpCompra);
  if (!identificador) return null;

  try {
    const urlItens = montarUrlItensCompra(identificador, {
      tamanhoPagina: TAMANHO_PAGINA_PADRAO,
    });
    const itensBrutos = await buscarJson<ItemCompraPncpBruto[]>(urlItens);
    if (!itensBrutos || itensBrutos.length === 0) return null;

    const itensImportados: ItemImportado[] = [];
    let fornecedor: { cnpj: string; razaoSocial: string } | null = null;

    for (const itemBruto of itensBrutos) {
      const urlResultados = montarUrlResultadosItem(identificador, itemBruto.numeroItem);
      const resultados = await buscarJson<ResultadoItemPncpBruto[]>(urlResultados);
      const vencedor = resultados?.[0] ? mapearFornecedorVencedor(resultados[0]) : null;

      // A primeira vitória de pessoa jurídica encontrada vira o fornecedor
      // da ata inteira — nosso cadastro (Sprint 1) associa um único
      // fornecedor por ata, então uma ata com fornecedores diferentes por
      // item fica com o do primeiro item; limitação conhecida.
      if (vencedor && !fornecedor) fornecedor = vencedor;

      itensImportados.push(mapearItemPncp(itemBruto));
    }

    if (!fornecedor) return null;
    return { itens: itensImportados, fornecedor };
  } catch {
    return null;
  }
}

interface ItensComFornecedor {
  itens: ItemImportado[];
  fornecedor: { cnpj: string; razaoSocial: string };
}

/**
 * Busca atas publicadas no PNCP num intervalo de datas e cadastra as que
 * ainda não existem no sistema, como PENDENTE (entram na fila de moderação
 * do Sprint 6 antes de aparecer no catálogo público).
 *
 * Pra cada ata nova, tenta enriquecer com os itens e o fornecedor vencedor
 * da compra de origem (ver buscarItensComFornecedor). Quando isso falha —
 * sem token de acesso configurado, endpoint indisponível, ou formato
 * inesperado — a ata ainda é importada, mas sem itens e associada a um
 * fornecedor "a confirmar", esperando complemento manual.
 */
export async function executarRastreamentoPncp(params: {
  dataInicial: Date;
  dataFinal: Date;
}): Promise<ResultadoRastreamento> {
  const resultado: ResultadoRastreamento = {
    encontradas: 0,
    importadasComItens: 0,
    importadasSemItens: 0,
    ignoradasCanceladas: 0,
    ignoradasJaExistentes: 0,
  };

  let pagina = 1;
  let totalPaginas = 1;

  try {
    do {
      const url = montarUrlConsultaAtas({
        dataInicial: params.dataInicial,
        dataFinal: params.dataFinal,
        pagina,
        tamanhoPagina: TAMANHO_PAGINA_PADRAO,
      });

      const resposta = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!resposta.ok) {
        resultado.erro = `PNCP respondeu ${resposta.status} na página ${pagina}`;
        return resultado;
      }

      const corpo = (await resposta.json()) as RespostaConsultaAtasPncp;
      const registros = Array.isArray(corpo) ? corpo : corpo.data;
      totalPaginas = Array.isArray(corpo) ? 1 : corpo.totalPaginas || 1;

      for (const bruta of registros) {
        resultado.encontradas += 1;
        const ataMapeada = mapearAtaPncp(bruta);

        if (ataMapeada.cancelada) {
          resultado.ignoradasCanceladas += 1;
          continue;
        }

        const jaExiste = await prisma.ata.findUnique({
          where: { numeroControlePncp: ataMapeada.numeroControlePncp },
          select: { id: true },
        });
        if (jaExiste) {
          resultado.ignoradasJaExistentes += 1;
          continue;
        }

        const enriquecimento = await buscarItensComFornecedor(
          ataMapeada.numeroControlePncpCompra,
        );

        const fornecedor = await prisma.fornecedor.upsert({
          where: {
            cnpj: enriquecimento?.fornecedor.cnpj ?? CNPJ_FORNECEDOR_A_CONFIRMAR,
          },
          update: enriquecimento
            ? { razaoSocial: enriquecimento.fornecedor.razaoSocial }
            : {},
          create: enriquecimento
            ? {
                cnpj: enriquecimento.fornecedor.cnpj,
                razaoSocial: enriquecimento.fornecedor.razaoSocial,
                email: `${enriquecimento.fornecedor.cnpj}@pncp.importado`,
              }
            : {
                cnpj: CNPJ_FORNECEDOR_A_CONFIRMAR,
                razaoSocial: "Fornecedor a confirmar (importado do PNCP)",
                email: "fornecedor-a-confirmar@pncp.importado",
              },
        });

        const orgaoGerenciador = await prisma.orgao.upsert({
          where: { cnpj: ataMapeada.orgaoGerenciador.cnpj },
          update: { nome: ataMapeada.orgaoGerenciador.nome },
          create: {
            nome: ataMapeada.orgaoGerenciador.nome,
            cnpj: ataMapeada.orgaoGerenciador.cnpj,
            uf: "NI",
            municipio: "Não informado (importado do PNCP)",
            esfera: "não informada",
          },
        });

        try {
          await prisma.ata.create({
            data: {
              numero: ataMapeada.numero,
              objeto: ataMapeada.objeto,
              status: "PENDENTE",
              origem: "PNCP",
              numeroControlePncp: ataMapeada.numeroControlePncp,
              dataAssinatura: ataMapeada.dataAssinatura,
              dataVigenciaFim: ataMapeada.dataVigenciaFim,
              fornecedorId: fornecedor.id,
              orgaoGerenciadorId: orgaoGerenciador.id,
              ...(enriquecimento
                ? {
                    itens: {
                      create: enriquecimento.itens.map((item) => ({
                        descricao: item.descricao,
                        categoria: item.categoria,
                        unidade: item.unidade,
                        quantidadeRegistrada: item.quantidadeRegistrada,
                        valorUnitario: item.valorUnitario,
                        saldo: { create: {} },
                      })),
                    },
                  }
                : {}),
            },
          });

          if (enriquecimento) {
            resultado.importadasComItens += 1;
          } else {
            resultado.importadasSemItens += 1;
          }
        } catch {
          // Colidiu com a constraint única de número+órgão (provavelmente
          // já cadastrada manualmente antes do PNCP publicar) — pula sem
          // derrubar o lote inteiro.
          resultado.ignoradasJaExistentes += 1;
        }
      }

      pagina += 1;
    } while (pagina <= totalPaginas);
  } catch (erro) {
    resultado.erro = erro instanceof Error ? erro.message : "Erro desconhecido";
  }

  return resultado;
}
