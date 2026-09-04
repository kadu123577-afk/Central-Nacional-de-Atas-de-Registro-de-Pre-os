/**
 * Elegibilidade de adesão por esfera federativa — art. 86, §§ 3º e 8º da
 * Lei 14.133/2021 (achado da revisão de 2026-09-04). Texto literal
 * (confirmado pelo usuário, 2026-09-04 — a primeira implementação tinha
 * a direção invertida, corrigida depois de conferir o texto exato):
 *
 *   § 3º A faculdade de aderir à ata de registro de preços na condição de
 *   não participante poderá ser exercida:
 *     I – por órgãos e entidades da Administração Pública federal,
 *     estadual, distrital e municipal, relativamente a ata de registro de
 *     preços de órgão ou entidade gerenciadora federal, estadual ou
 *     distrital; ou
 *     II – por órgãos e entidades da Administração Pública municipal,
 *     relativamente a ata de registro de preços de órgão ou entidade
 *     gerenciadora municipal, desde que o sistema de registro de preços
 *     tenha sido formalizado mediante licitação.
 *
 *   § 8º Será vedada aos órgãos e entidades da Administração Pública
 *   federal a adesão à ata de registro de preços gerenciada por órgão ou
 *   entidade estadual, distrital ou municipal.
 *
 * Lendo os dois juntos: ata gerenciada por federal/estadual/distrital
 * aceita aderente de QUALQUER esfera (inciso I) — inclusive município
 * aderindo a ata estadual, que é o uso mais comum de "carona" na
 * prática (município pequeno sem estrutura própria aproveitando o
 * processo de um governo maior). Ata gerenciada por município só aceita
 * aderente municipal (inciso II). A única mão vedada é a contrária: ente
 * federal não pode aderir a ata gerenciada por estadual, distrital ou
 * municipal (§8º) — só essa direção é bloqueada.
 *
 * Tabela de elegibilidade (aderente -> gerenciadores aceitos):
 *   federal   -> só federal (§8º veda o resto)
 *   estadual  -> federal, estadual, distrital (inciso I; não cobre
 *                aderir a ata municipal — só o inciso II cobre isso, e é
 *                exclusivo pra aderente municipal)
 *   distrital -> idem estadual
 *   municipal -> federal, estadual, distrital (inciso I) + municipal
 *                (inciso II) = qualquer esfera
 *
 * NÃO cobre (ainda não implementado, exige campo novo no schema — ver
 * ESCOPO-DO-PROJETO.md):
 *   § 6º — exceção ao teto de 200% (§5º) pra adesão a ata federal de
 *   programa de transferência voluntária;
 *   § 7º — exceção ao teto de 200% pra adesão emergencial a ata de
 *   medicamentos/material médico-hospitalar gerenciada especificamente
 *   pelo Ministério da Saúde.
 *
 * A condição do §3º de que o SRP tenha sido "formalizado por licitação"
 * é assumida sempre verdadeira neste sistema — toda ata aqui nasce de
 * cadastro manual (por trás de um processo de licitação real) ou de
 * importação do PNCP (que só lista instrumentos formais de licitação);
 * não existe fluxo de registro de preços fora de licitação nesta
 * plataforma.
 */

export const ESFERAS_ORGAO = ["federal", "estadual", "distrital", "municipal"] as const;
export type Esfera = (typeof ESFERAS_ORGAO)[number];

const NIVEIS_PERMITIDOS_POR_ADERENTE: Record<Esfera, readonly Esfera[]> = {
  federal: ["federal"],
  estadual: ["federal", "estadual", "distrital"],
  distrital: ["federal", "estadual", "distrital"],
  municipal: ["federal", "estadual", "distrital", "municipal"],
};

export function esferaValida(valor: string): valor is Esfera {
  return (ESFERAS_ORGAO as readonly string[]).includes(valor);
}

export interface ResultadoElegibilidadeEsfera {
  permitido: boolean;
  motivo?: "ESFERA_NAO_CONFIRMADA" | "NIVEL_NAO_PERMITIDO";
}

/**
 * Verifica se um órgão aderente de uma dada esfera pode aderir a uma ata
 * gerenciada por órgão de outra esfera, conforme art. 86 §§ 3º e 8º.
 *
 * Esferas fora do vocabulário fixo (ex.: "não informada", usada pelo
 * rastreador do PNCP quando a esfera do órgão gerenciador não vem na
 * resposta da API) são tratadas como não confirmadas — a adesão é
 * recusada em vez de assumir que a regra foi cumprida.
 */
export function verificarElegibilidadeEsfera(
  esferaAderente: string,
  esferaGerenciador: string,
): ResultadoElegibilidadeEsfera {
  if (!esferaValida(esferaAderente) || !esferaValida(esferaGerenciador)) {
    return { permitido: false, motivo: "ESFERA_NAO_CONFIRMADA" };
  }
  const permitido = NIVEIS_PERMITIDOS_POR_ADERENTE[esferaAderente].includes(esferaGerenciador);
  return permitido ? { permitido: true } : { permitido: false, motivo: "NIVEL_NAO_PERMITIDO" };
}
