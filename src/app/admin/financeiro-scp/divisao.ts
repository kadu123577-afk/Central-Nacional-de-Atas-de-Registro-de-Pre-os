import {
  participacoesVigentesEm,
  validarParticipacoes,
  validarSemSobreposicao,
  type ParticipacaoPercentual,
  type ParticipacaoVigencia,
} from "@/lib/financeiro-scp";
import { diaTexto } from "./leitura";

/**
 * Planejamento de uma NOVA DIVISÃO da partilha (2026-10-26, Projeto RNA etapa 7):
 * a partir de uma data, cada sócio passa a ter um percentual (ou sai da partilha).
 * Função pura, sem banco: recebe o que está cadastrado e devolve o que fechar e o
 * que abrir, ou o erro. A server action só grava o plano, numa transação.
 *
 * Por que todos os sócios de uma vez: os percentuais vigentes numa data têm de
 * somar exatamente 100%. Se a tela mudasse um sócio por vez, nenhuma mudança
 * passaria (60/40 → 50/50 deixaria 50/40 no meio do caminho). Então a divisão é
 * definida inteira, e o que não muda fica como está.
 *
 * Regras:
 * - A data começa DEPOIS da divisão mais recente (nada se apaga nem se reescreve:
 *   o histórico das partilhas continua reconstituível; erro de digitação se
 *   corrige com uma nova divisão).
 * - A participação vigente que muda é ENCERRADA no dia anterior (vigenteAte) e
 *   outra é aberta; a que não muda (mesmo percentual, ainda em aberto) não é tocada.
 * - Sócio com percentual em branco sai da partilha a partir da data.
 * - Sócio inativo não ganha participação nova.
 * - Sócio que não veio no formulário mantém o que tem (a soma de 100% pega o esquecimento).
 * - O resultado precisa fechar 100% e não pode sobrepor vigências de um mesmo sócio.
 */

export interface EntradaDivisao {
  socioId: string;
  /** Fração (0.6 = 60%) ou nulo = sem participação a partir da data. */
  fracao: number | null;
}

export interface SocioParaDivisao {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface ParticipacaoCadastrada extends ParticipacaoVigencia {
  id: string;
}

export interface MudancaDeParticipacao {
  socioId: string;
  /** Fração vigente antes (nulo = não tinha). */
  antes: number | null;
  /** Fração depois (nulo = saiu da partilha). */
  depois: number | null;
}

export type PlanoDivisao =
  | { ok: false; erro: string }
  | {
      ok: true;
      /** Participações vigentes que terminam no dia anterior ao início da divisão. */
      encerrar: { id: string; vigenteAte: Date }[];
      /** Participações novas, em aberto, a partir do início da divisão. */
      abrir: { socioId: string; fracao: number }[];
      /** O que mudou, sócio a sócio (vazio = nada mudou). */
      mudancas: MudancaDeParticipacao[];
    };

const DIA_MS = 86_400_000;

function diaMs(data: Date): number {
  return Math.floor(data.getTime() / DIA_MS) * DIA_MS;
}

function mesmoPercentual(a: number, b: number): boolean {
  return Math.round(a * 10_000) === Math.round(b * 10_000);
}

export function planejarDivisao(entrada: {
  /** Dia só-data (meia-noite UTC) em que a nova divisão começa. */
  desde: Date;
  entradas: readonly EntradaDivisao[];
  socios: readonly SocioParaDivisao[];
  /** Todas as participações já cadastradas, de todos os sócios. */
  participacoes: readonly ParticipacaoCadastrada[];
}): PlanoDivisao {
  const { entradas, socios, participacoes } = entrada;
  const desde = diaMs(entrada.desde);
  if (Number.isNaN(desde)) return { ok: false, erro: "Informe a data em que a nova divisão começa." };

  const consistente = validarSemSobreposicao(participacoes);
  if (!consistente.ok) return { ok: false, erro: consistente.erro };

  if (participacoes.length > 0) {
    const ultimoInicio = Math.max(...participacoes.map((p) => diaMs(p.vigenteDesde)));
    if (desde <= ultimoInicio) {
      return {
        ok: false,
        erro: `A nova divisão precisa começar depois de ${diaTexto(new Date(ultimoInicio))}, quando começou a divisão mais recente.`,
      };
    }
  }

  const porId = new Map(socios.map((s) => [s.id, s]));
  const vistos = new Set<string>();
  const vigentes = participacoesVigentesEm(new Date(desde), participacoes);
  const vigentePorSocio = new Map(vigentes.map((p) => [p.socioId, p]));
  const ate = new Date(desde - DIA_MS);

  const encerrar: { id: string; vigenteAte: Date }[] = [];
  const abrir: { socioId: string; fracao: number }[] = [];
  const mudancas: MudancaDeParticipacao[] = [];

  for (const e of entradas) {
    const socio = porId.get(e.socioId);
    if (!socio) return { ok: false, erro: "Sócio não encontrado. Atualize a página e tente de novo." };
    if (vistos.has(e.socioId)) return { ok: false, erro: "O mesmo sócio aparece mais de uma vez no formulário." };
    vistos.add(e.socioId);

    const atual = vigentePorSocio.get(e.socioId);
    if (e.fracao === null) {
      if (atual) {
        encerrar.push({ id: atual.id, vigenteAte: ate });
        mudancas.push({ socioId: e.socioId, antes: atual.percentual, depois: null });
      }
      continue;
    }

    if (atual && atual.vigenteAte == null && mesmoPercentual(atual.percentual, e.fracao)) continue;
    if (!socio.ativo) {
      return { ok: false, erro: `${socio.nome} está inativo. Reative o sócio antes de dar participação a ele.` };
    }
    if (atual) encerrar.push({ id: atual.id, vigenteAte: ate });
    abrir.push({ socioId: e.socioId, fracao: e.fracao });
    mudancas.push({ socioId: e.socioId, antes: atual?.percentual ?? null, depois: e.fracao });
  }

  // Como ficam as participações vigentes na data, com o que foi encerrado e aberto.
  const encerradas = new Set(encerrar.map((x) => x.id));
  const finais: ParticipacaoPercentual[] = [
    ...vigentes.filter((p) => !encerradas.has(p.id)).map((p) => ({ socioId: p.socioId, percentual: p.percentual })),
    ...abrir.map((a) => ({ socioId: a.socioId, percentual: a.fracao })),
  ];
  const fecha100 = validarParticipacoes(finais);
  if (!fecha100.ok) return { ok: false, erro: fecha100.erro };

  const depois: ParticipacaoVigencia[] = [
    ...participacoes.map((p) => {
      const fim = encerrar.find((x) => x.id === p.id);
      return fim ? { ...p, vigenteAte: fim.vigenteAte } : p;
    }),
    ...abrir.map((a) => ({
      socioId: a.socioId,
      percentual: a.fracao,
      vigenteDesde: new Date(desde),
      vigenteAte: null,
    })),
  ];
  const semSobreposicao = validarSemSobreposicao(depois);
  if (!semSobreposicao.ok) return { ok: false, erro: semSobreposicao.erro };

  return { ok: true, encerrar, abrir, mudancas };
}
