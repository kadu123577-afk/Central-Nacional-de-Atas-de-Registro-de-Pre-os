/**
 * Elegibilidade de adesão por esfera federativa — art. 86, §§ 3º e 8º da
 * Lei 14.133/2021 (achado da revisão de 2026-09-04, a partir do texto
 * comentado da lei — confirmado pelo usuário, com citação exata dos
 * parágrafos):
 *
 *   § 3º — a adesão só ocorre entre entes do mesmo nível ou abaixo: um
 *   órgão aderente federal/estadual/distrital pode aderir a uma ata
 *   gerenciada por ente federal/estadual/distrital; um órgão aderente
 *   municipal só pode aderir a ata gerenciada por outro município.
 *
 *   § 8º — é vedado a órgão federal aderir a ata gerenciada por órgão
 *   estadual, distrital ou municipal (via de mão única: isso restringe o
 *   §3º pro lado federal — union de "federal/estadual/distrital" não
 *   inclui municipal pra aderente federal nem estadual/distrital pra
 *   aderente federal).
 *
 * Combinando os dois parágrafos, a tabela de elegibilidade fica:
 *   aderente federal   -> só pode aderir a ata gerenciada por federal
 *   aderente estadual/distrital -> pode aderir a federal, estadual ou distrital
 *   aderente municipal -> só pode aderir a ata gerenciada por município
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
  municipal: ["municipal"],
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
