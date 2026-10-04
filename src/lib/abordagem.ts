import { rotuloDaCategoria } from "./categorias";
import {
  CARGO_ADMINISTRACAO,
  CARGO_EDUCACAO,
  CARGO_PREFEITO,
  CARGO_SAUDE,
} from "./decisores";

/**
 * "Abordagem sugerida" da gaveta do município (2026-10-04, fase 2 de
 * design). Modelos de texto fixos por cargo — sem IA nesta fase. Tom do
 * Projeto RNA §4: apresentação técnica e documental, nunca promessa de
 * vantagem; o argumento é prazo (sem novo certame), preço já pesquisado e
 * os limites do art. 86 da Lei 14.133/2021.
 */
export function abordagemSugerida(
  cargo: string | null,
  categoria: string | null,
  porQueAgora: string | null,
): { titulo: string; texto: string } {
  const objeto = categoria ? rotuloDaCategoria(categoria).toLowerCase() : "o objeto desta ata";
  const gancho = porQueAgora ? `${porQueAgora}. ` : "";
  const comum =
    "Mostre que a ata permite contratar sem um novo certame, com preço já pesquisado em bases oficiais e dentro dos limites do art. 86 da Lei 14.133/2021.";

  switch (cargo) {
    case CARGO_EDUCACAO:
      return {
        titulo: "Abordagem sugerida · Secretário(a) de Educação",
        texto: `${gancho}Abra pela necessidade da rede de ensino em ${objeto}. ${comum}`,
      };
    case CARGO_SAUDE:
      return {
        titulo: "Abordagem sugerida · Secretário(a) de Saúde",
        texto: `${gancho}Abra pela continuidade do atendimento e pela urgência de ${objeto}. ${comum}`,
      };
    case CARGO_ADMINISTRACAO:
      return {
        titulo: "Abordagem sugerida · Secretário(a) de Administração/Finanças",
        texto: `${gancho}Fale de processo e prazo: ${objeto} sem abrir uma nova licitação. ${comum}`,
      };
    case CARGO_PREFEITO:
      return {
        titulo: "Abordagem sugerida · Prefeito(a)",
        texto: `${gancho}Apresente o ganho para o município em ${objeto}: entrega mais rápida e economia comprovada. ${comum}`,
      };
    default:
      return {
        titulo: "Abordagem sugerida",
        texto: `${gancho}Identifique quem decide sobre ${objeto} no município. ${comum}`,
      };
  }
}
