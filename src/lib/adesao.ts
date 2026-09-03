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
