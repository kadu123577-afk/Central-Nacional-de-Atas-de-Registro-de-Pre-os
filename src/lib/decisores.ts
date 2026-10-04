/**
 * Decisor principal de um município (2026-10-04, fase 2 de design): quem o
 * vendedor deve procurar primeiro depende do que a ata vende — transporte
 * escolar e material didático passam pela Educação, hospitalar pela Saúde,
 * o resto pela Administração/Finanças; o Prefeito(a) é a aprovação final.
 * Vocabulário de cargos = o do importador de contatos
 * (prisma/enriquecer-contatos-prefeituras.ts).
 */
export const CARGO_PREFEITO = "Prefeito(a)";
export const CARGO_ADMINISTRACAO = "Secretário(a) de Administração/Finanças";
export const CARGO_SAUDE = "Secretário(a) de Saúde";
export const CARGO_EDUCACAO = "Secretário(a) de Educação";

const TODOS_OS_CARGOS = [CARGO_ADMINISTRACAO, CARGO_EDUCACAO, CARGO_SAUDE, CARGO_PREFEITO];

/** Ordem de abordagem dos cargos pra uma categoria de ata (slug de src/lib/categorias.ts). */
export function ordemCargos(categoria: string | null): string[] {
  const slug = categoria ?? "";
  let primeiro = CARGO_ADMINISTRACAO;
  if (/escolar|educa|aluno|ingles|uniforme|merenda/.test(slug)) primeiro = CARGO_EDUCACAO;
  else if (/hospitalar|saude|medic|farmac|odont/.test(slug)) primeiro = CARGO_SAUDE;

  // Prefeito(a) sempre por último: é a aprovação final, não o primeiro contato.
  const resto = TODOS_OS_CARGOS.filter((c) => c !== primeiro && c !== CARGO_PREFEITO);
  return [primeiro, ...resto, CARGO_PREFEITO];
}

export interface ContatoOrdenavel {
  cargo: string;
  telefone: string | null;
  email: string | null;
}

export function temCanal(c: ContatoOrdenavel): boolean {
  return Boolean(c.telefone?.trim() || c.email?.trim());
}

/**
 * Ordena os contatos pela ordem de abordagem; entre o mesmo cargo, quem tem
 * canal (telefone/e-mail) vem antes. Cargo desconhecido vai pro fim.
 */
export function ordenarDecisores<T extends ContatoOrdenavel>(contatos: T[], categoria: string | null): T[] {
  const ordem = ordemCargos(categoria);
  const posicao = (c: T) => {
    const i = ordem.indexOf(c.cargo);
    return i === -1 ? ordem.length : i;
  };
  return [...contatos].sort((a, b) => {
    const porCargo = posicao(a) - posicao(b);
    if (porCargo !== 0) return porCargo;
    return Number(temCanal(b)) - Number(temCanal(a));
  });
}

/**
 * Principal = o primeiro, na ordem de abordagem, que tem canal. Se ninguém
 * tem canal, devolve o primeiro da ordem marcado `semCanal` (o card mostra
 * "Buscar contato" em vez de botões).
 */
export function escolherDecisorPrincipal<T extends ContatoOrdenavel>(
  contatos: T[],
  categoria: string | null,
): { principal: T | null; semCanal: boolean } {
  if (contatos.length === 0) return { principal: null, semCanal: true };
  const ordenados = ordenarDecisores(contatos, categoria);
  const comCanal = ordenados.find(temCanal);
  if (comCanal) return { principal: comCanal, semCanal: false };
  return { principal: ordenados[0], semCanal: true };
}

/** Papel do contato na gaveta (Prefeito = aprovação final; 1º = principal). */
export function papelDoContato(cargo: string, ehPrincipal: boolean): "principal" | "aprovacao" | "apoio" {
  if (ehPrincipal) return "principal";
  if (cargo === CARGO_PREFEITO) return "aprovacao";
  return "apoio";
}
