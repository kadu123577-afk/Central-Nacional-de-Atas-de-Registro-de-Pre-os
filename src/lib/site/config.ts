/**
 * Configuração do site público (vitrine). Dados institucionais vêm do
 * pacote do designer (marca ARCA Capital); o que muda por ambiente vem de
 * variáveis de ambiente.
 */

export const SITE = {
  nome: "Central Nacional de Atas de Registro de Preços",
  nomeCurto: "Central de Atas",
  operadora: "ARCA Capital",
  razaoSocial: "Arca Capital Investimentos e Participações Ltda",
  cnpj: "66.103.397/0001-55",
  enderecoLinha1: "Edifício Eldorado Business Tower, Av. C-255, nº 400",
  enderecoLinha2: "Setor Nova Suíça, Goiânia/GO · CEP 74280-010",
  telefone: "(62) 3636-2671",
  telefoneLink: "tel:+556236362671",
  email: "contato@arcacapital.com.br",
  agencia: { nome: "Is' Art - Agência de Marketing", url: "https://isart.agency" },
  /** Endereço público do site (usado em metadados, sitemap e JSON-LD). */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://atas.arcacapital.com.br").replace(/\/$/, ""),
  /** WhatsApp oficial, só dígitos com DDI (ex.: 5562900000000). Vazio = links viram e-mail. */
  whatsapp: (process.env.WHATSAPP_OFICIAL ?? "").replace(/\D/g, ""),
  /** Mostra a faixa "ambiente de demonstração" no topo. */
  demonstracao: process.env.AMBIENTE_DEMONSTRACAO === "true",
  /** Só liga a indexação no Google quando houver dados reais publicados. */
  indexar: process.env.INDEXAR_SITE === "true",
} as const;

/** Link de contato com a equipe: WhatsApp se configurado, senão e-mail. */
export function linkContato(texto: string, assunto = "Central Nacional de Atas"): string {
  if (SITE.whatsapp) {
    return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(texto)}`;
  }
  return `mailto:${SITE.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;
}
