/**
 * Acompanhamento de contratos públicos no PNCP (Projeto RNA §2 e honorários
 * em cascata) — 2026-10-21. Regras puras, sem banco nem rede, para poder
 * testar. O script scripts/inteligencia/acompanhar-contratos.ts lê os dados
 * coletados, aplica estas regras e grava ContratoPublico, TermoContratoPublico
 * e VinculoContrato.
 *
 * O PNCP é público: aqui não se descobre nada que não esteja lá. O que a
 * plataforma ganha é ligar um contrato publicado ao funil comercial para
 * (1) saber que uma negociação virou contrato, (2) acompanhar aditivos e
 * prorrogações, que geram comissão em cascata, e (3) perceber desvios: o
 * município fechou com o fornecedor parceiro sem passar pela rede.
 *
 * Três níveis de vínculo (do mais firme ao mais fraco):
 *  - certo:  o contrato cita a ata da rede (numeroControlePncpAta);
 *  - forte:  fornecedor parceiro + município com negociação ativa daquele
 *            fornecedor + contrato assinado depois de a negociação abrir;
 *  - desvio: contrato do fornecedor parceiro com município-alvo, fruto de
 *            adesão ou de ata, mas SEM negociação nenhuma no funil.
 * O script nunca decide: grava como "sugerido" e o gestor confirma ou descarta.
 */

export const NIVEIS_VINCULO = ["certo", "forte", "desvio"] as const;
export type NivelVinculo = (typeof NIVEIS_VINCULO)[number];

export const ROTULO_NIVEL_VINCULO: Record<NivelVinculo, string> = {
  certo: "Cita a ata da rede",
  forte: "Fornecedor parceiro em negociação",
  desvio: "Possível desvio do funil",
};

export const STATUS_VINCULO = ["sugerido", "confirmado", "descartado"] as const;
export type StatusVinculo = (typeof STATUS_VINCULO)[number];

export const STATUS_TERMO = ["a_acompanhar", "lancado", "sem_comissao"] as const;
export type StatusTermo = (typeof STATUS_TERMO)[number];

export const ROTULO_STATUS_TERMO: Record<StatusTermo, string> = {
  a_acompanhar: "A acompanhar",
  lancado: "Comissão lançada",
  sem_comissao: "Sem comissão",
};

export function statusVinculoValido(valor: string): valor is StatusVinculo {
  return (STATUS_VINCULO as readonly string[]).includes(valor);
}

export function statusTermoValido(valor: string): valor is StatusTermo {
  return (STATUS_TERMO as readonly string[]).includes(valor);
}

/** Campos do contrato como o PNCP publica (só os que as regras usam). */
export interface ContratoParaAcompanhar {
  numeroControlePNCP: string;
  numeroControlePncpAta?: string | null;
  numeroControlePncpCompra?: string | null;
  frutoAdesao?: boolean | null;
  niFornecedor?: string | null;
  nomeRazaoSocialFornecedor?: string | null;
  tipoPessoa?: string | null;
  orgaoEntidade?: { cnpj?: string | null; razaoSocial?: string | null } | null;
  tipoContrato?: { nome?: string | null } | null;
  objetoContrato?: string | null;
  valorInicial?: number | null;
  valorGlobal?: number | null;
  valorAcumulado?: number | null;
  dataAssinatura?: string | null;
  dataVigenciaInicio?: string | null;
  dataVigenciaFim?: string | null;
  dataAtualizacao?: string | null;
  numeroRetificacao?: number | null;
}

export interface OportunidadeDoFunil {
  id: string;
  ataId: string;
  /** CNPJ (só dígitos) do fornecedor da ata da oportunidade. */
  fornecedorCnpj: string;
  entidadeAlvoId: string;
  /** Negociação em andamento (não recusada nem expirada). */
  ativa: boolean;
  criadoEm: Date;
}

export interface RedeParaAcompanhar {
  /** numeroControlePncp da ata (como o PNCP publica) → ata da rede. */
  atasPorControle: Map<string, { ataId: string }>;
  /** CNPJs (só dígitos) dos fornecedores cadastrados na plataforma. */
  parceiros: Set<string>;
  oportunidades: OportunidadeDoFunil[];
}

export interface VinculoSugerido {
  nivel: NivelVinculo;
  motivo: string;
  ataId: string | null;
  oportunidadeId: string | null;
}

export function soDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

function dia(texto: string | null | undefined): Date | null {
  if (!texto) return null;
  const d = new Date(texto.length === 10 ? `${texto}T00:00:00Z` : texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Início do dia em UTC, para comparar "assinado depois de abrir a negociação" sem fuso. */
function inicioDoDia(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Decide se um contrato de um município-alvo deve ser ligado ao funil.
 * Devolve null quando não há relação (a imensa maioria dos contratos).
 */
export function classificarVinculo(
  contrato: ContratoParaAcompanhar,
  entidadeAlvoId: string,
  rede: RedeParaAcompanhar,
): VinculoSugerido | null {
  const oportunidadesDoMunicipio = rede.oportunidades.filter((o) => o.entidadeAlvoId === entidadeAlvoId);

  // 1) certo: cita a ata da rede.
  const controleAta = contrato.numeroControlePncpAta?.trim();
  if (controleAta) {
    const ata = rede.atasPorControle.get(controleAta);
    if (ata) {
      const oportunidade = oportunidadesDoMunicipio.find((o) => o.ataId === ata.ataId);
      return {
        nivel: "certo",
        motivo: `O contrato cita a ata ${controleAta}, que está na rede.${oportunidade ? "" : " O município não tinha negociação aberta nessa ata."}`,
        ataId: ata.ataId,
        oportunidadeId: oportunidade?.id ?? null,
      };
    }
  }

  const fornecedor = soDigitos(contrato.niFornecedor);
  if (!fornecedor || !rede.parceiros.has(fornecedor)) return null;

  // 2) forte: parceiro + negociação ativa do mesmo fornecedor + assinatura depois de abrir.
  const assinatura = dia(contrato.dataAssinatura);
  const forte = oportunidadesDoMunicipio.find(
    (o) =>
      o.ativa &&
      o.fornecedorCnpj === fornecedor &&
      (assinatura === null || inicioDoDia(assinatura) >= inicioDoDia(o.criadoEm)),
  );
  if (forte) {
    return {
      nivel: "forte",
      motivo: "Contrato do fornecedor da ata com município que está em negociação dessa ata.",
      ataId: forte.ataId,
      oportunidadeId: forte.id,
    };
  }

  // 3) desvio: parceiro + (adesão ou ata) + nenhuma negociação desse fornecedor no município.
  const temNegociacaoDoFornecedor = oportunidadesDoMunicipio.some((o) => o.fornecedorCnpj === fornecedor);
  const veioDeAdesaoOuAta = contrato.frutoAdesao === true || Boolean(controleAta);
  if (veioDeAdesaoOuAta && !temNegociacaoDoFornecedor) {
    return {
      nivel: "desvio",
      motivo: contrato.frutoAdesao === true
        ? "Contrato fruto de adesão a ata, com fornecedor parceiro, em município sem negociação no funil."
        : "Contrato com fornecedor parceiro a partir de ata, em município sem negociação no funil.",
      ataId: null,
      oportunidadeId: null,
    };
  }

  return null;
}

// ----------------------------------------------------------------- aditivos

export interface FotoDoContrato {
  valorGlobal: number | null;
  vigenciaFim: Date | null;
}

export interface TermoDetectado {
  chave: string;
  tipo: "aditivo_valor" | "aditivo_prazo";
  descricao: string;
  valorAcrescido: number | null;
  novaVigenciaFim: Date | null;
}

/**
 * O endpoint de termos do PNCP falhou (504) nos testes de 12/10/2026; o plano
 * B é perceber o aditivo pela mudança do contrato entre duas coletas. Só
 * aumento conta (valor maior ou vigência mais longa): redução não gera
 * comissão. A chave é derivada do valor novo, então rodar de novo não duplica.
 */
export function detectarTermos(
  numeroControle: string,
  anterior: FotoDoContrato,
  novo: FotoDoContrato,
): TermoDetectado[] {
  const termos: TermoDetectado[] = [];

  if (anterior.valorGlobal !== null && novo.valorGlobal !== null && novo.valorGlobal - anterior.valorGlobal > 0.009) {
    const acrescimo = Math.round((novo.valorGlobal - anterior.valorGlobal) * 100) / 100;
    termos.push({
      chave: `${numeroControle}:valor:${novo.valorGlobal.toFixed(2)}`,
      tipo: "aditivo_valor",
      descricao: `Valor global subiu de ${anterior.valorGlobal.toFixed(2)} para ${novo.valorGlobal.toFixed(2)}.`,
      valorAcrescido: acrescimo,
      novaVigenciaFim: null,
    });
  }

  if (anterior.vigenciaFim && novo.vigenciaFim && novo.vigenciaFim.getTime() > anterior.vigenciaFim.getTime()) {
    const fim = novo.vigenciaFim.toISOString().slice(0, 10);
    termos.push({
      chave: `${numeroControle}:prazo:${fim}`,
      tipo: "aditivo_prazo",
      descricao: `Vigência prorrogada de ${anterior.vigenciaFim.toISOString().slice(0, 10)} para ${fim}.`,
      valorAcrescido: null,
      novaVigenciaFim: novo.vigenciaFim,
    });
  }

  return termos;
}

/**
 * A comissão só vence depois que o ente liquidou E pagou o fornecedor
 * (honorários do Projeto RNA). Sem a data de pagamento, a cobrança fica
 * "aguardando pagamento do ente" e não aparece como a cobrar.
 */
export function cobrancaLiberada(liquidacao: { dataPagamentoEnte: Date | string | null | undefined }): boolean {
  return Boolean(liquidacao.dataPagamentoEnte);
}
