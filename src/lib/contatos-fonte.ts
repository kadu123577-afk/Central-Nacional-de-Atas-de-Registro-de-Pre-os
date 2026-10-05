/**
 * Extração de fonte e confiança de contatos (fase 2 de design, etapa 4,
 * 2026-10-05). O levantamento original gravou tudo em texto livre dentro de
 * `particularidades` ("Fonte: site oficial; G1. Confiança: Alta (prefeito) /
 * Média (saúde).") e anotações no nome ("(méd. conf.)"). Aqui isso vira
 * campos estruturados — sem mexer no texto original.
 */
export type NivelConfianca = 1 | 2 | 3;

export function nivelConfiancaPorRotulo(rotulo: string): NivelConfianca | null {
  const r = rotulo.trim().toLowerCase();
  if (r.startsWith("alta")) return 3;
  if (r.startsWith("m")) return 2; // média / media
  if (r.startsWith("baixa")) return 1;
  return null;
}

export function extrairFonte(particularidades: string | null): { fonte: string | null; fonteUrl: string | null } {
  if (!particularidades) return { fonte: null, fonteUrl: null };

  const m = /Fonte:\s*([\s\S]+?)(?:\.\s*Confian[çc]a:|\.?\s*$)/i.exec(particularidades);
  const fonte = m ? m[1].trim().replace(/\s+/g, " ").slice(0, 300) : null;

  const site = /Site oficial:\s*([^\s;,]+)/i.exec(particularidades);
  let fonteUrl: string | null = null;
  if (site) {
    const dominio = site[1].replace(/[.)]+$/, "").replace(/^https?:\/\//i, "");
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(dominio)) fonteUrl = `https://${dominio}`;
  }
  return { fonte: fonte || null, fonteUrl };
}

type ClasseCargo = "prefeito" | "saude" | "educacao" | "adm" | "outro";

function classeDoCargo(cargo: string): ClasseCargo {
  const c = cargo.toLowerCase();
  if (c.includes("prefeit")) return "prefeito";
  if (c.includes("saúde") || c.includes("saude")) return "saude";
  if (c.includes("educa")) return "educacao";
  if (c.includes("admin") || c.includes("financ")) return "adm";
  return "outro";
}

function qualificadorCasa(qualificador: string, classe: ClasseCargo): boolean {
  const q = qualificador.toLowerCase();
  if (classe === "prefeito") return /prefeit/.test(q);
  if (classe === "saude") return /sa[uú]de/.test(q) || /demais|secret[aá]rios/.test(q);
  if (classe === "educacao") return /educa/.test(q) || /demais|secret[aá]rios/.test(q);
  if (classe === "adm") return /adm|finan/.test(q) || /demais|secret[aá]rios/.test(q);
  return /demais|secret[aá]rios/.test(q);
}

/**
 * Confiança do contato (1 baixa, 2 média, 3 alta). O texto às vezes dá níveis
 * por cargo ("Alta (prefeito) / Média (saúde)"): pega o do cargo do contato;
 * se nenhum qualificador casa, usa o grupo sem qualificador ou o mais baixo.
 */
export function extrairConfianca(particularidades: string | null, cargo: string): NivelConfianca | null {
  if (!particularidades) return null;
  const m = /Confian[çc]a:\s*([\s\S]+)$/i.exec(particularidades);
  if (!m) return null;

  const grupos: { nivel: NivelConfianca; qualificador: string | null }[] = [];
  const re = /(Alta|M[ée]dia|Baixa)\s*(?:\(([^)]*)\)?)?/gi;
  let achado: RegExpExecArray | null;
  while ((achado = re.exec(m[1])) !== null) {
    const nivel = nivelConfiancaPorRotulo(achado[1]);
    if (nivel) grupos.push({ nivel, qualificador: achado[2]?.trim() || null });
  }
  if (grupos.length === 0) return null;

  const classe = classeDoCargo(cargo);
  const casado = grupos.find((g) => g.qualificador && qualificadorCasa(g.qualificador, classe));
  if (casado) return casado.nivel;
  const semQualificador = grupos.find((g) => !g.qualificador);
  if (semQualificador) return semQualificador.nivel;
  return Math.min(...grupos.map((g) => g.nivel)) as NivelConfianca;
}

/**
 * Tira do nome as anotações de qualidade do dado ("(méd. conf.)", "(dado 1
 * ano)") e as devolve como nota. Anotações de área, como "(Adm. e
 * Planejamento)", ficam no nome.
 */
export function limparNomeContato(nome: string): { nome: string; nota: string | null } {
  const notas: string[] = [];
  const limpo = nome
    .replace(/\s*\(([^)]*(?:conf\.?|confian|dado|desatualiz)[^)]*)\)/gi, (_, nota: string) => {
      notas.push(nota.trim());
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { nome: limpo || nome.trim(), nota: notas.length ? notas.join("; ") : null };
}
