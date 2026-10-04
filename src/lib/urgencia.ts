/**
 * Urgência de um município no Kanban (2026-10-04, fase 2 de design) — lê o
 * prazo de negociação (OportunidadeVenda.prazoEm) e diz o que o vendedor
 * precisa fazer agora, no estilo do "rotting" do Pipedrive: a cor do card
 * comunica a pressa, sem precisar ler a data.
 */
export type NivelUrgencia = "critico" | "atencao" | "ok" | "sem_prazo";

export interface Urgencia {
  nivel: NivelUrgencia;
  /** Dias inteiros restantes (arredondado pra cima); nulo sem prazo. */
  dias: number | null;
  rotulo: string;
}

const MS_DIA = 24 * 60 * 60 * 1000;
const LIMITE_CRITICO_DIAS = 3;
const LIMITE_ATENCAO_DIAS = 7;

export function calcularUrgencia(prazoEm: Date | null, agora: Date = new Date()): Urgencia {
  if (!prazoEm) return { nivel: "sem_prazo", dias: null, rotulo: "Sem prazo" };

  const dias = Math.ceil((prazoEm.getTime() - agora.getTime()) / MS_DIA);
  if (dias <= 0) return { nivel: "critico", dias: 0, rotulo: "Prazo hoje" };

  const rotulo = dias === 1 ? "Prazo 1 dia" : `Prazo ${dias} dias`;
  if (dias <= LIMITE_CRITICO_DIAS) return { nivel: "critico", dias, rotulo };
  if (dias <= LIMITE_ATENCAO_DIAS) return { nivel: "atencao", dias, rotulo };
  return { nivel: "ok", dias, rotulo };
}
