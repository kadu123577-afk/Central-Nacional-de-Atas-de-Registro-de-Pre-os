import { diasUteisEntre, somarDiasUteis, type Feriados } from "@/lib/dias-uteis";
import type { Permissao } from "@/lib/permissoes";

/**
 * Ciclo da ata, atividades 1 a 7 do workflow (2026-11-14, passo 5 do plano): da captação até a
 * ata liberada para a equipe de vendas. Regras puras, sem banco e sem relógio. Em que etapa a
 * ata está é DERIVADO dos dados que o sistema já guarda (nada novo para a equipe preencher):
 * a primeira etapa ainda não cumprida é a atual.
 *
 * Os prazos (dias úteis) são os do documento "Workflow principal da Central de Atas" e contam a
 * partir de quando a etapa anterior ficou pronta, o mais próximo que os dados permitem (ver
 * `desdeDaEtapa`). A contagem é aproximada: serve para cobrar, não para multar ninguém.
 */

export type NumeroEtapa = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface EtapaDoCiclo {
  numero: NumeroEtapa;
  titulo: string;
  /** Quem faz, pelo papel (as pessoas mudam; o papel não). */
  papel: string;
  prazoDiasUteis: number;
  /** Permissão de quem trabalha nesta etapa (src/lib/permissoes.ts). */
  permissao: Permissao;
  /** O que a pessoa faz na tela. */
  acao: string;
  /** Caminho da tela onde a etapa se resolve, dada a ata. */
  caminho: (ataId: string) => string;
}

export const ETAPAS_DO_CICLO: readonly EtapaDoCiclo[] = [
  {
    numero: 1,
    titulo: "Mapear a ata",
    papel: "Captação",
    prazoDiasUteis: 2,
    permissao: "atas.captar",
    acao: "Cadastrar a ata",
    caminho: () => "/admin/atas/nova",
  },
  {
    numero: 2,
    titulo: "Fechar com a empresa prestadora",
    papel: "Captação",
    prazoDiasUteis: 5,
    permissao: "atas.captar",
    acao: "Completar os dados do fornecedor",
    caminho: (id) => `/admin/atas/${id}/completar`,
  },
  {
    numero: 3,
    titulo: "Cadastrar itens e saldos",
    papel: "Captação (estagiário)",
    prazoDiasUteis: 1,
    permissao: "atas.captar",
    acao: "Cadastrar ou importar os itens",
    caminho: (id) => `/admin/atas/${id}/itens`,
  },
  {
    numero: 4,
    titulo: "Contrato de intermediação",
    papel: "Jurídico",
    prazoDiasUteis: 5,
    permissao: "atas.contrato",
    acao: "Cadastrar o contrato e a comissão",
    caminho: (id) => `/admin/atas/${id}/contrato`,
  },
  {
    numero: 5,
    titulo: "Conformidade da ata",
    papel: "Jurídico",
    prazoDiasUteis: 3,
    permissao: "atas.conformidade",
    acao: "Conferir o checklist e escrever o parecer",
    caminho: (id) => `/admin/atas/${id}/analise`,
  },
  {
    numero: 6,
    titulo: "Aprovar a ata",
    papel: "Aprovador",
    prazoDiasUteis: 2,
    permissao: "atas.aprovar",
    acao: "Aprovar ou rejeitar",
    caminho: (id) => `/admin/atas/${id}/analise`,
  },
  {
    numero: 7,
    titulo: "Publicar e atribuir à equipe",
    papel: "Administração",
    prazoDiasUteis: 1,
    permissao: "atas.publicar",
    acao: "Definir categoria e título público",
    caminho: (id) => `/admin/atas/${id}/municipios`,
  },
];

export function etapaPorNumero(numero: number): EtapaDoCiclo | undefined {
  return ETAPAS_DO_CICLO.find((e) => e.numero === numero);
}

/** O que o banco sabe da ata, no formato mínimo que o ciclo precisa. */
export interface DadosDoCiclo {
  status: "PENDENTE" | "APROVADA" | "REJEITADA";
  criadaEm: Date;
  atualizadaEm: Date;
  /** CNPJ ainda é o provisório da importação (00000000000000): a empresa não foi confirmada. */
  fornecedorAConfirmar: boolean;
  totalItens: number;
  contratoEm: Date | null;
  conformidadeEm: Date | null;
  categoria: string | null;
}

export interface SituacaoDaEtapa {
  numero: NumeroEtapa;
  feita: boolean;
  atual: boolean;
  /** Desde quando a etapa está esperando (só na etapa atual). */
  desde: Date | null;
}

export interface SituacaoDoCiclo {
  etapas: SituacaoDaEtapa[];
  /** Número da etapa que espera alguém; null se a ata já está liberada ou foi rejeitada. */
  etapaAtual: NumeroEtapa | null;
  concluida: boolean;
  rejeitada: boolean;
}

/**
 * Etapa 1 (mapear) está feita se a ata existe. As demais, pelos dados:
 * 2 fornecedor confirmado · 3 ao menos um item · 4 contrato · 5 conformidade registrada ·
 * 6 ata aprovada · 7 aprovada e com categoria definida. Uma etapa só conta como feita se todas
 * as anteriores estão feitas.
 */
export function situacaoDoCiclo(dados: DadosDoCiclo): SituacaoDoCiclo {
  const rejeitada = dados.status === "REJEITADA";
  const aprovada = dados.status === "APROVADA";
  const cumpridas: Record<NumeroEtapa, boolean> = {
    1: true,
    2: !dados.fornecedorAConfirmar,
    3: dados.totalItens > 0,
    4: dados.contratoEm !== null,
    5: dados.conformidadeEm !== null,
    6: aprovada,
    7: aprovada && dados.categoria !== null && dados.categoria !== "",
  };
  // Cada etapa só vale se todas as anteriores valem (a ordem é regra). Uma ata aprovada antes desta
  // regra, sem o contrato, NÃO tem a aprovação nem a publicação como feitas: espera o contrato.
  const feitas = {} as Record<NumeroEtapa, boolean>;
  let anterioresFeitas = true;
  for (const e of ETAPAS_DO_CICLO) {
    feitas[e.numero] = anterioresFeitas && cumpridas[e.numero];
    anterioresFeitas = feitas[e.numero];
  }

  const primeiraPendente = rejeitada ? undefined : ETAPAS_DO_CICLO.find((e) => !feitas[e.numero]);
  const etapaAtual = primeiraPendente?.numero ?? null;

  return {
    etapas: ETAPAS_DO_CICLO.map((e) => ({
      numero: e.numero,
      feita: feitas[e.numero],
      atual: e.numero === etapaAtual,
      desde: e.numero === etapaAtual ? desdeDaEtapa(e.numero, dados) : null,
    })),
    etapaAtual,
    concluida: !rejeitada && etapaAtual === null,
    rejeitada,
  };
}

/**
 * Desde quando a etapa espera: a data em que a etapa anterior ficou pronta, quando o banco a
 * registra (contrato, conformidade, aprovação); nas demais, a data de cadastro da ata.
 */
export function desdeDaEtapa(numero: NumeroEtapa, dados: DadosDoCiclo): Date {
  switch (numero) {
    case 5:
      return dados.contratoEm ?? dados.criadaEm;
    case 6:
      return dados.conformidadeEm ?? dados.contratoEm ?? dados.criadaEm;
    case 7:
      return dados.atualizadaEm;
    default:
      return dados.criadaEm;
  }
}

export interface SituacaoDoPrazo {
  vencimento: Date;
  tom: "ok" | "hoje" | "atrasado";
  /** Dias úteis até o vencimento; negativo = dias úteis de atraso. */
  diasUteis: number;
}

/** Vencimento da etapa e se está em dia, vence hoje ou atrasou (tudo em dias úteis). */
export function situacaoDoPrazo(
  etapa: Pick<EtapaDoCiclo, "prazoDiasUteis">,
  desde: Date,
  agora: Date,
  feriados?: Feriados,
): SituacaoDoPrazo {
  return situacaoDoVencimento(somarDiasUteis(desde, etapa.prazoDiasUteis, feriados), agora, feriados);
}

/** Em dia, vence hoje ou atrasou, para um vencimento já conhecido (tudo em dias úteis). */
export function situacaoDoVencimento(vencimento: Date, agora: Date, feriados?: Feriados): SituacaoDoPrazo {
  const diasUteis = diasUteisEntre(agora, vencimento, feriados);
  return { vencimento, diasUteis, tom: diasUteis < 0 ? "atrasado" : diasUteis === 0 ? "hoje" : "ok" };
}

export function textoDoPrazo(p: SituacaoDoPrazo): string {
  if (p.tom === "atrasado") return `atrasada ${-p.diasUteis} dia(s) útil(eis)`;
  if (p.tom === "hoje") return "vence hoje";
  return `${p.diasUteis} dia(s) útil(eis) para vencer`;
}

// ---------------------------------------------------------------------------------------------
// Ordem das etapas (2026-11-14): cada etapa só abre depois da anterior
// ---------------------------------------------------------------------------------------------

/** As ações do ciclo que só valem na sua vez. Cada uma corresponde a uma etapa. */
export type AcaoDoCiclo = "contrato" | "conformidade" | "aprovar" | "publicar";

const ETAPA_DA_ACAO: Record<AcaoDoCiclo, NumeroEtapa> = {
  contrato: 4,
  conformidade: 5,
  aprovar: 6,
  publicar: 7,
};

export interface BloqueioDoCiclo {
  /** A primeira etapa anterior ainda não cumprida: é ela que precisa acontecer antes. */
  etapa: EtapaDoCiclo;
  mensagem: string;
}

/**
 * Decisão de Carlos (14/11/2026): o captador mapeia a ata e fecha com a empresa, o estagiário
 * cadastra os itens e o saldo, o jurídico faz o contrato, depois a conformidade, a aprovação e a
 * publicação. Não se pula etapa. Devolve o que falta antes de a ação poder acontecer, ou null se
 * a ata já está na vez dela (ou além). Rejeitar uma ata nunca é bloqueado por esta regra.
 */
export function bloqueioDaAcao(acao: AcaoDoCiclo, dados: DadosDoCiclo): BloqueioDoCiclo | null {
  const numero = ETAPA_DA_ACAO[acao];
  const situacao = situacaoDoCiclo({ ...dados, status: dados.status === "REJEITADA" ? "PENDENTE" : dados.status });
  const pendente = situacao.etapas.find((e) => e.numero < numero && !e.feita);
  if (!pendente) return null;
  const etapa = etapaPorNumero(pendente.numero)!;
  return {
    etapa,
    mensagem: `Ainda não dá: falta a etapa ${etapa.numero} (${etapa.titulo}, a cargo de ${etapa.papel.toLowerCase()}). Cada etapa só abre depois da anterior.`,
  };
}
