import { prisma } from "@/lib/prisma";
import {
  mapearAtaPncp,
  montarUrlConsultaAtas,
  TAMANHO_PAGINA_PADRAO,
  type RespostaConsultaAtasPncp,
} from "@/lib/pncp";

const CNPJ_FORNECEDOR_A_CONFIRMAR = "00000000000000";

export interface ResultadoRastreamento {
  encontradas: number;
  importadas: number;
  ignoradasCanceladas: number;
  ignoradasJaExistentes: number;
  erro?: string;
}

/**
 * Busca atas publicadas no PNCP num intervalo de datas e cadastra as que
 * ainda não existem no sistema, como PENDENTE (entram na fila de moderação
 * do Sprint 6 antes de aparecer no catálogo público).
 *
 * Como o endpoint de listagem do PNCP não traz o CNPJ do fornecedor nem os
 * itens/quantitativos da ata (só metadados: número, objeto, órgão,
 * vigência), a ata importada nasce sem itens e associada a um fornecedor
 * "a confirmar" — um consultor precisa completar esses dados manualmente
 * antes de aprovar. Isso é uma limitação conhecida a resolver quando o
 * mapeamento da API de itens da compra for implementado.
 */
export async function executarRastreamentoPncp(params: {
  dataInicial: Date;
  dataFinal: Date;
}): Promise<ResultadoRastreamento> {
  const resultado: ResultadoRastreamento = {
    encontradas: 0,
    importadas: 0,
    ignoradasCanceladas: 0,
    ignoradasJaExistentes: 0,
  };

  const fornecedorAConfirmar = await prisma.fornecedor.upsert({
    where: { cnpj: CNPJ_FORNECEDOR_A_CONFIRMAR },
    update: {},
    create: {
      cnpj: CNPJ_FORNECEDOR_A_CONFIRMAR,
      razaoSocial: "Fornecedor a confirmar (importado do PNCP)",
      email: "fornecedor-a-confirmar@pncp.importado",
    },
  });

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
        signal: AbortSignal.timeout(20_000),
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
              fornecedorId: fornecedorAConfirmar.id,
              orgaoGerenciadorId: orgaoGerenciador.id,
            },
          });
          resultado.importadas += 1;
        } catch {
          // Colidiu com a constraint única de número+órgão (provavelmente já
          // cadastrada manualmente antes do PNCP publicar) — pula sem
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
