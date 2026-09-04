import type { EstagioAdesao } from "@/generated/prisma/enums";

/**
 * Os 8 estágios da esteira de adesão, na ordem fixa definida pelo plano
 * comercial. `avancar` sempre move para o próximo da lista — não existe
 * pular etapa nem voltar.
 */
export const ORDEM_ESTAGIOS: EstagioAdesao[] = [
  "MAPEADA",
  "CONTATO_FORNECEDOR",
  "APRESENTADA_ORGAO",
  "OFICIO_EMITIDO",
  "AGUARDANDO_GERENCIADOR",
  "ACEITE_FORNECEDOR",
  "EMPENHADA",
  "FATURADA",
];

export const ROTULO_ESTAGIO: Record<EstagioAdesao, string> = {
  MAPEADA: "Mapeada",
  CONTATO_FORNECEDOR: "Contato com o fornecedor",
  APRESENTADA_ORGAO: "Apresentada ao órgão",
  OFICIO_EMITIDO: "Ofício emitido",
  AGUARDANDO_GERENCIADOR: "Aguardando gerenciador",
  ACEITE_FORNECEDOR: "Aceite do fornecedor",
  EMPENHADA: "Empenhada",
  FATURADA: "Faturada",
};

export function proximoEstagio(atual: EstagioAdesao): EstagioAdesao | null {
  const indice = ORDEM_ESTAGIOS.indexOf(atual);
  if (indice === -1 || indice === ORDEM_ESTAGIOS.length - 1) return null;
  return ORDEM_ESTAGIOS[indice + 1];
}

export function estagioConcluido(estagio: EstagioAdesao): boolean {
  return estagio === "FATURADA";
}

export type AtorEsperado = "orgao" | "fornecedor" | "terceiros" | "concluido";

/**
 * "De quem é a vez" num estágio, só como rótulo informativo pra tela do
 * órgão — inferido do nome/sentido de cada estágio, não uma trava de
 * verdade. `avancarEstagioAdesao` (src/app/adesoes/actions.ts) continua
 * deixando fornecedor OU órgão avançar qualquer estágio; mudar isso pra
 * uma trava de permissão de fato é uma decisão de processo/auditoria
 * separada, ainda não tomada.
 */
export function atorEsperado(estagio: EstagioAdesao): AtorEsperado {
  switch (estagio) {
    case "MAPEADA":
    case "CONTATO_FORNECEDOR":
    case "ACEITE_FORNECEDOR":
      return "fornecedor";
    case "APRESENTADA_ORGAO":
      return "orgao";
    case "OFICIO_EMITIDO":
    case "AGUARDANDO_GERENCIADOR":
      return "terceiros";
    case "EMPENHADA":
    case "FATURADA":
      return "concluido";
  }
}
