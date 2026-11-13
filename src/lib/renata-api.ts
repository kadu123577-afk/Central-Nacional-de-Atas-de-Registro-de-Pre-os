import { createHash, timingSafeEqual } from "node:crypto";
import { limiteAgregado, limitePorOrgao } from "@/lib/saldo";
import { etapaPorNumero, situacaoDoPrazo } from "@/lib/ciclo-ata";
import type { AtaNoCiclo } from "@/lib/ciclo-ata-db";
import type { Feriados } from "@/lib/dias-uteis";
import { rotuloDaCategoria } from "@/lib/categorias";
import { tituloGenerico } from "@/lib/site/titulo";

/**
 * Leitura para a Renata (2026-11-14, passo 7 do plano do workflow): três consultas SOMENTE de
 * leitura (saldo das atas, vendas por consultor, andamento do ciclo da ata), para a Renata
 * (IA no WhatsApp, a cargo do SERPRO) responder sem ter acesso ao banco.
 *
 * DESLIGADA POR PADRÃO. Só liga com as duas variáveis de ambiente (RENATA_API_ATIVA=sim e
 * RENATA_API_TOKEN com 32 caracteres ou mais). Antes de ligar e de entregar o token a quem
 * quer que seja, é preciso a autorização por escrito da ARCA (NDA do Projeto RNA: dados e
 * sistema só vão ao SERPRO com autorização escrita).
 *
 * O que nunca sai por aqui: contatos de pessoas, CPF, e-mail e telefone, o objeto original da
 * ata, o número da ata, o fornecedor e o órgão gerenciador (o mesmo que a vitrine pública
 * esconde, src/lib/visibilidade.ts). A ata é identificada pelo id interno e pelo título público.
 * Acrescentar um campo novo aqui é decisão que passa pela ARCA.
 */

export const TAMANHO_MINIMO_DO_TOKEN = 32;

type Ambiente = Record<string, string | undefined>;

export function renataApiLigada(env: Ambiente = process.env): boolean {
  return env.RENATA_API_ATIVA === "sim" && (env.RENATA_API_TOKEN ?? "").length >= TAMANHO_MINIMO_DO_TOKEN;
}

export type Autorizacao = { ok: true } | { ok: false; status: 401 | 404 };

/**
 * Desligada: 404, como se a rota não existisse. Ligada e sem o token certo no cabeçalho
 * "Authorization: Bearer <token>": 401. A comparação é de tamanho fixo (hash dos dois lados).
 */
export function autorizarRenata(request: Request, env: Ambiente = process.env): Autorizacao {
  if (!renataApiLigada(env)) return { ok: false, status: 404 };
  const recebido = request.headers.get("authorization") ?? "";
  const hashRecebido = createHash("sha256").update(recebido).digest();
  const hashEsperado = createHash("sha256").update(`Bearer ${env.RENATA_API_TOKEN}`).digest();
  return timingSafeEqual(hashRecebido, hashEsperado) ? { ok: true } : { ok: false, status: 401 };
}

// ---------------------------------------------------------------------------------------------
// Saldo das atas
// ---------------------------------------------------------------------------------------------

export interface AtaParaSaldo {
  id: string;
  tituloPublico: string | null;
  categoria: string | null;
  dataVigenciaFim: Date;
  itens: {
    id: string;
    descricao: string;
    unidade: string;
    valorUnitario: string;
    quantidadeRegistrada: number;
    quantidadeConsumida: number;
  }[];
}

export function montarSaldoDasAtas(atas: readonly AtaParaSaldo[]) {
  return atas.map((a) => ({
    id: a.id,
    titulo: a.tituloPublico?.trim() || tituloGenerico(a.categoria),
    categoria: a.categoria ? { slug: a.categoria, rotulo: rotuloDaCategoria(a.categoria) } : null,
    vigenciaFim: a.dataVigenciaFim.toISOString().slice(0, 10),
    itens: a.itens.map((i) => ({
      id: i.id,
      descricao: i.descricao,
      unidade: i.unidade,
      valorUnitario: Number(i.valorUnitario),
      quantidadeRegistrada: i.quantidadeRegistrada,
      quantidadeAderida: i.quantidadeConsumida,
      /** Quanto um único município pode aderir (50% do registrado, art. 86). */
      maximoPorMunicipio: Math.floor(limitePorOrgao(i.quantidadeRegistrada)),
      /** Quanto ainda cabe no total, somando todos os órgãos (200% do registrado, art. 86). */
      disponivelNoTotal: Math.max(0, Math.floor(limiteAgregado(i.quantidadeRegistrada)) - i.quantidadeConsumida),
    })),
  }));
}

// ---------------------------------------------------------------------------------------------
// Vendas por consultor
// ---------------------------------------------------------------------------------------------

export interface LinhaDeVendas {
  vendedorId: string;
  nome: string;
  estagio: string;
  quantidade: number;
  valorAderido: number;
}

const ESTAGIOS = ["a_contatar", "em_negociacao", "aderiu", "recusado"] as const;

export function montarVendasPorConsultor(linhas: readonly LinhaDeVendas[]) {
  const porConsultor = new Map<string, { id: string; nome: string; estagios: Record<string, number>; totalAderido: number }>();
  for (const l of linhas) {
    const atual = porConsultor.get(l.vendedorId) ?? {
      id: l.vendedorId,
      nome: l.nome,
      estagios: Object.fromEntries(ESTAGIOS.map((e) => [e, 0])),
      totalAderido: 0,
    };
    if (l.estagio in atual.estagios) atual.estagios[l.estagio] += l.quantidade;
    if (l.estagio === "aderiu") atual.totalAderido += l.valorAderido;
    porConsultor.set(l.vendedorId, atual);
  }
  return [...porConsultor.values()].sort((a, b) => b.totalAderido - a.totalAderido || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ---------------------------------------------------------------------------------------------
// Andamento do ciclo da ata
// ---------------------------------------------------------------------------------------------

export function montarAndamentoDoCiclo(atas: readonly AtaNoCiclo[], agora: Date, feriados?: Feriados) {
  const porEtapa: Record<string, number> = {};
  const itens = atas.flatMap((a) => {
    const numero = a.situacao.etapaAtual;
    const etapa = numero ? etapaPorNumero(numero) : undefined;
    const atual = a.situacao.etapas.find((e) => e.atual);
    if (!etapa || !atual?.desde) return [];
    const prazo = situacaoDoPrazo(etapa, atual.desde, agora, feriados);
    porEtapa[etapa.numero] = (porEtapa[etapa.numero] ?? 0) + 1;
    return [
      {
        id: a.id,
        titulo: tituloGenerico(a.dados.categoria),
        etapa: { numero: etapa.numero, titulo: etapa.titulo, papel: etapa.papel },
        esperandoDesde: atual.desde.toISOString().slice(0, 10),
        prazo: { vencimento: prazo.vencimento.toISOString().slice(0, 10), situacao: prazo.tom, diasUteis: prazo.diasUteis },
      },
    ];
  });
  return { total: itens.length, porEtapa, atas: itens };
}
