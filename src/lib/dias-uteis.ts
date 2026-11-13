/**
 * Dias úteis (2026-11-14, passo 4 do plano do workflow). Regras puras, sem banco e sem relógio:
 * quem chama passa o instante e, se tiver, os feriados extras que a equipe cadastrou
 * (src/lib/feriados-db.ts).
 *
 * Conta como Lei 14.133/2021, art. 183: exclui o dia do começo e inclui o do vencimento, e o
 * vencimento nunca cai em dia sem expediente. Sem expediente: sábado, domingo, os feriados
 * nacionais e os pontos facultativos de todo ano (Carnaval e Corpus Christi, decisão de Carlos em
 * 14/11/2026) calculados abaixo, e os extras cadastrados (feriado estadual ou municipal).
 *
 * O dia é o dia de Brasília (UTC-3, sem horário de verão desde 2019): um instante às 22h de
 * sexta em Brasília já é sábado em UTC, e não pode virar fim de semana por isso.
 */

/** Datas "AAAA-MM-DD" (dia de Brasília). */
export type Feriados = ReadonlySet<string>;

const BRASILIA_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** "AAAA-MM-DD" do dia de Brasília em que o instante cai. */
export function dataIso(instante: Date): string {
  const local = new Date(instante.getTime() - BRASILIA_MS);
  return `${local.getUTCFullYear()}-${doisDigitos(local.getUTCMonth() + 1)}-${doisDigitos(local.getUTCDate())}`;
}

/** 0 = domingo … 6 = sábado, no dia de Brasília. */
function diaDaSemana(instante: Date): number {
  return new Date(instante.getTime() - BRASILIA_MS).getUTCDay();
}

/** Domingo de Páscoa (calendário gregoriano, algoritmo de Meeus/Jones/Butcher): mês 1-12 e dia. */
function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

function isoDeAno(ano: number, mes: number, dia: number): string {
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

export interface FeriadoNacional {
  data: string;
  nome: string;
  /** Feriado por lei ou ponto facultativo que a Central trata como dia sem expediente. */
  tipo: "feriado" | "ponto_facultativo";
}

const cacheNacionais = new Map<number, FeriadoNacional[]>();

/**
 * Dias sem expediente de todo ano: os feriados nacionais (os fixos e a Sexta-feira Santa) e os
 * pontos facultativos que a Central trata do mesmo jeito: segunda e terça de Carnaval e Corpus
 * Christi. O Dia da Consciência Negra (20/11) é feriado nacional desde 2024 (Lei 14.759/2023).
 * Outros pontos facultativos, e feriados estaduais e municipais, a equipe cadastra.
 */
export function feriadosNacionais(ano: number): FeriadoNacional[] {
  const guardado = cacheNacionais.get(ano);
  if (guardado) return guardado;

  const { mes, dia } = pascoa(ano);
  /** Dia da Páscoa deslocado em `dias` (negativo = antes). */
  const aPartirDaPascoa = (dias: number) => {
    const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
    return isoDeAno(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  };
  const feriado = (data: string, nome: string): FeriadoNacional => ({ data, nome, tipo: "feriado" });
  const facultativo = (data: string, nome: string): FeriadoNacional => ({ data, nome, tipo: "ponto_facultativo" });
  const lista: FeriadoNacional[] = [
    feriado(isoDeAno(ano, 1, 1), "Confraternização Universal"),
    facultativo(aPartirDaPascoa(-48), "Carnaval (segunda-feira)"),
    facultativo(aPartirDaPascoa(-47), "Carnaval (terça-feira)"),
    feriado(aPartirDaPascoa(-2), "Sexta-feira Santa"),
    feriado(isoDeAno(ano, 4, 21), "Tiradentes"),
    feriado(isoDeAno(ano, 5, 1), "Dia do Trabalho"),
    facultativo(aPartirDaPascoa(60), "Corpus Christi"),
    feriado(isoDeAno(ano, 9, 7), "Independência do Brasil"),
    feriado(isoDeAno(ano, 10, 12), "Nossa Senhora Aparecida"),
    feriado(isoDeAno(ano, 11, 2), "Finados"),
    feriado(isoDeAno(ano, 11, 15), "Proclamação da República"),
    ...(ano >= 2024 ? [feriado(isoDeAno(ano, 11, 20), "Dia da Consciência Negra")] : []),
    feriado(isoDeAno(ano, 12, 25), "Natal"),
  ].sort((x, y) => x.data.localeCompare(y.data));
  cacheNacionais.set(ano, lista);
  return lista;
}

const VAZIO: Feriados = new Set();

/** Dia com expediente: não é fim de semana, feriado nacional nem feriado extra cadastrado. */
export function ehDiaUtil(instante: Date, extras: Feriados = VAZIO): boolean {
  const dia = diaDaSemana(instante);
  if (dia === 0 || dia === 6) return false;
  const iso = dataIso(instante);
  if (extras.has(iso)) return false;
  return !feriadosNacionais(Number(iso.slice(0, 4))).some((f) => f.data === iso);
}

/**
 * Soma dias úteis ao instante, mantendo a hora. O dia do começo não conta; o resultado é sempre um
 * dia útil (com 0 dias devolve o próprio instante, mesmo que seja dia sem expediente).
 */
export function somarDiasUteis(inicio: Date, dias: number, extras: Feriados = VAZIO): Date {
  if (!Number.isInteger(dias) || dias < 0) throw new RangeError("dias deve ser um inteiro maior ou igual a zero");
  let cursor = new Date(inicio.getTime());
  let restantes = dias;
  while (restantes > 0) {
    cursor = new Date(cursor.getTime() + DIA_MS);
    if (ehDiaUtil(cursor, extras)) restantes -= 1;
  }
  return cursor;
}

/**
 * Quantos dias úteis faltam do início até o fim (o dia do começo não conta, o do fim conta).
 * Negativo quando o fim já passou.
 */
export function diasUteisEntre(inicio: Date, fim: Date, extras: Feriados = VAZIO): number {
  if (fim.getTime() < inicio.getTime()) return -diasUteisEntre(fim, inicio, extras);
  let total = 0;
  let cursor = new Date(inicio.getTime());
  while (dataIso(cursor) < dataIso(fim)) {
    cursor = new Date(cursor.getTime() + DIA_MS);
    if (ehDiaUtil(cursor, extras)) total += 1;
  }
  return total;
}
