import { prisma } from "@/lib/prisma";
import {
  mapearAtaComprasGov,
  mapearItensDaCompra,
  montarUrlConsultarArp,
  montarUrlConsultarArpItem,
  TAMANHO_PAGINA_PADRAO,
  type AtaComprasGovBruta,
  type ItemComprasGovBruto,
  type ItemImportadoComprasGov,
  type RespostaConsultarArp,
  type RespostaConsultarArpItem,
} from "@/lib/compras-gov";

// Mesmo valor usado em src/lib/rastreador-pncp.ts — mesma tabela de
// fornecedores, então reaproveitar o placeholder deixa as duas fontes
// consistentes entre si (uma única linha "a confirmar", não uma por fonte).
const CNPJ_FORNECEDOR_A_CONFIRMAR = "00000000000000";
const TIMEOUT_MS = 20_000;

export interface ResultadoRastreamentoComprasGov {
  encontradas: number;
  importadasComItens: number;
  importadasSemItens: number;
  ignoradasCanceladas: number;
  ignoradasJaExistentes: number;
  ignoradasSemCnpjOrgao: number;
  erro?: string;
}

async function buscarJson<T>(url: string): Promise<T | null> {
  const resposta = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resposta.ok) return null;
  return (await resposta.json()) as T;
}

interface ItensComFornecedor {
  itens: ItemImportadoComprasGov[];
  fornecedor: { cnpj: string; razaoSocial: string };
}

/**
 * Busca os itens da ata — diferente do PNCP, um único endpoint já traz
 * descrição, quantidade, valor unitário E o fornecedor junto, sem precisar
 * de uma segunda chamada por item. `2_consultarARPItem` não filtra por
 * `numeroAtaRegistroPreco` (checado ao vivo contra a API — só aceita
 * `numeroCompra` + `codigoUnidadeGerenciadora`, e uma compra pode ter
 * gerado mais de uma ata), então a busca é pela compra de origem e o
 * resultado é filtrado pela ata específica em `mapearItensDaCompra`. Se a
 * chamada falhar ou não vier nenhum item com CNPJ válido, retorna `null` e
 * o chamador cai para a importação só com metadados — nunca derruba o
 * restante do lote por causa de uma ata.
 */
async function buscarItensComFornecedor(
  ata: AtaComprasGovBruta,
  janela: { min: Date; max: Date },
): Promise<ItensComFornecedor | null> {
  try {
    const url = montarUrlConsultarArpItem({
      dataVigenciaInicialMin: janela.min,
      dataVigenciaInicialMax: janela.max,
      numeroCompra: ata.numeroCompra,
      codigoUnidadeGerenciadora: ata.codigoUnidadeGerenciadora,
      tamanhoPagina: TAMANHO_PAGINA_PADRAO,
    });
    const resposta = await buscarJson<RespostaConsultarArpItem | ItemComprasGovBruto[]>(url);
    const itensBrutos = Array.isArray(resposta) ? resposta : resposta?.resultado;
    if (!itensBrutos || itensBrutos.length === 0) return null;

    const itensImportados = mapearItensDaCompra(itensBrutos, ata.numeroAtaRegistroPreco);
    if (itensImportados.length === 0) return null;

    // O primeiro item com CNPJ de fornecedor preenchido vira o fornecedor
    // da ata inteira — mesma limitação conhecida do rastreador do PNCP
    // (nosso cadastro associa um único fornecedor por ata).
    const primeiroComFornecedor = itensImportados.find((item) => item.fornecedor.cnpj);
    if (!primeiroComFornecedor) return null;

    return { itens: itensImportados, fornecedor: primeiroComFornecedor.fornecedor };
  } catch {
    return null;
  }
}

/**
 * Busca atas de registro de preços no Compras.gov.br num intervalo de
 * vigência e cadastra as que ainda não existem no sistema, como PENDENTE
 * (fila de moderação, igual ao rastreador do PNCP). Roda em paralelo com
 * `executarRastreamentoPncp` — mesma chave de deduplicação
 * (`Ata.numeroControlePncp`, único), então uma ata que já veio pelo PNCP
 * não é importada de novo por aqui, e vice-versa.
 */
export async function executarRastreamentoComprasGov(params: {
  dataVigenciaInicialMin: Date;
  dataVigenciaInicialMax: Date;
}): Promise<ResultadoRastreamentoComprasGov> {
  const resultado: ResultadoRastreamentoComprasGov = {
    encontradas: 0,
    importadasComItens: 0,
    importadasSemItens: 0,
    ignoradasCanceladas: 0,
    ignoradasJaExistentes: 0,
    ignoradasSemCnpjOrgao: 0,
  };

  let pagina = 1;
  let totalPaginas = 1;

  try {
    do {
      const url = montarUrlConsultarArp({
        dataVigenciaInicialMin: params.dataVigenciaInicialMin,
        dataVigenciaInicialMax: params.dataVigenciaInicialMax,
        pagina,
        tamanhoPagina: TAMANHO_PAGINA_PADRAO,
      });

      const resposta = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!resposta.ok) {
        resultado.erro = `Compras.gov.br respondeu ${resposta.status} na página ${pagina}`;
        return resultado;
      }

      const corpo = (await resposta.json()) as RespostaConsultarArp | AtaComprasGovBruta[];
      const registros = Array.isArray(corpo) ? corpo : corpo.resultado;
      totalPaginas = Array.isArray(corpo) ? 1 : corpo.totalPaginas || 1;

      for (const bruta of registros) {
        resultado.encontradas += 1;
        const ataMapeada = mapearAtaComprasGov(bruta);

        if (ataMapeada.cancelada) {
          resultado.ignoradasCanceladas += 1;
          continue;
        }

        if (!ataMapeada.orgaoGerenciador.cnpj) {
          // Sem o número de controle PNCP não dá pra extrair o CNPJ do
          // órgão gerenciador (nenhum outro campo desta API traz isso
          // direto) — não dá pra cadastrar o órgão sem um CNPJ, então pula
          // essa ata específica sem derrubar o lote.
          resultado.ignoradasSemCnpjOrgao += 1;
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

        const enriquecimento = await buscarItensComFornecedor(bruta, {
          min: params.dataVigenciaInicialMin,
          max: params.dataVigenciaInicialMax,
        });

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
                email: `${enriquecimento.fornecedor.cnpj}@comprasgov.importado`,
              }
            : {
                cnpj: CNPJ_FORNECEDOR_A_CONFIRMAR,
                razaoSocial: "Fornecedor a confirmar (importado do Compras.gov.br)",
                email: "fornecedor-a-confirmar@comprasgov.importado",
              },
        });

        const orgaoGerenciador = await prisma.orgao.upsert({
          where: { cnpj: ataMapeada.orgaoGerenciador.cnpj },
          update: { nome: ataMapeada.orgaoGerenciador.nome },
          create: {
            nome: ataMapeada.orgaoGerenciador.nome,
            cnpj: ataMapeada.orgaoGerenciador.cnpj,
            uf: "NI",
            municipio: "Não informado (importado do Compras.gov.br)",
            esfera: "não informada",
          },
        });

        try {
          await prisma.ata.create({
            data: {
              numero: ataMapeada.numero,
              objeto: ataMapeada.objeto,
              status: "PENDENTE",
              origem: "COMPRAS_GOV",
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
                        // /modulo-arp/2_consultarARPItem não traz unidade de
                        // medida (confirmado no schema real) — diferente do
                        // PNCP. "UN" genérico até existir um campo próprio
                        // pra revisão manual, se isso incomodar na prática.
                        unidade: "UN",
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
          // já cadastrada manualmente antes de o Compras.gov.br publicar)
          // — pula sem derrubar o lote inteiro.
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
