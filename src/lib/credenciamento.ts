/**
 * Credenciamento do consultor comercial (2026-10-23, Projeto RNA etapa 6).
 * Regras puras — sem banco, sem rede, sem relógio. O armazenamento fica em
 * CredenciamentoConsultor (um por vendedor); aqui estão o vocabulário de
 * status, as transições permitidas e o texto do compromisso de integridade.
 *
 * Fluxo: o consultor aceita o compromisso de integridade (pendente →
 * aceito) e a equipe da plataforma libera para atuar (aceito → credenciado).
 * A equipe pode suspender (aceito ou credenciado → suspenso); o consultor
 * suspenso só volta a "aceito" por um NOVO aceite dele, e depois precisa de
 * nova liberação. Só "credenciado" atua (podeAtuar).
 *
 * ATENÇÃO — MINUTA: o texto de integridade abaixo (TITULO_INTEGRIDADE e
 * COMPROMISSOS_INTEGRIDADE) é uma minuta de trabalho, escrita em linguagem
 * simples, e DEVE SER REVISADO POR ADVOGADO antes do uso real. Ao mudar o
 * texto, aumente VERSAO_INTEGRIDADE: o aceite guarda a versão que o consultor
 * leu (CredenciamentoConsultor.integridadeVersao).
 */
import type { Tom } from "@/components/ui/badge";

// ───────────────────────── Status ─────────────────────────

/** Ordem do fluxo: do cadastro à liberação; "suspenso" fica fora da fila. */
export const STATUS_CREDENCIAMENTO = ["pendente", "aceito", "credenciado", "suspenso"] as const;

export type StatusCredenciamento = (typeof STATUS_CREDENCIAMENTO)[number];

export const ROTULO_STATUS_CREDENCIAMENTO: Record<StatusCredenciamento, string> = {
  pendente: "Aceite pendente",
  aceito: "Aguardando liberação",
  credenciado: "Credenciado",
  suspenso: "Suspenso",
};

/** Uma frase sobre o que cada status significa, para a tela do consultor e do admin. */
export const DESCRICAO_STATUS_CREDENCIAMENTO: Record<StatusCredenciamento, string> = {
  pendente: "O consultor ainda não aceitou o compromisso de integridade.",
  aceito: "O consultor aceitou o compromisso e aguarda a liberação da equipe da plataforma.",
  credenciado: "Liberado pela equipe da plataforma para atuar nas oportunidades.",
  suspenso: "Atuação suspensa pela equipe da plataforma.",
};

/**
 * Tom do selo (escala do Badge). "marca" é estrutural e nunca indica risco;
 * "aceito" usa "atencao" porque fica esperando a equipe; "suspenso" usa
 * "alerta" só para se destacar na lista.
 */
export const TOM_STATUS_CREDENCIAMENTO: Record<StatusCredenciamento, Tom> = {
  pendente: "neutro",
  aceito: "atencao",
  credenciado: "marca",
  suspenso: "alerta",
};

export function statusCredenciamentoValido(valor: unknown): valor is StatusCredenciamento {
  return typeof valor === "string" && (STATUS_CREDENCIAMENTO as readonly string[]).includes(valor);
}

/**
 * Status usável a partir do que veio do banco: sem registro (nulo) ou valor
 * desconhecido contam como "pendente", o lado seguro (não atua).
 */
export function normalizarStatusCredenciamento(valor: unknown): StatusCredenciamento {
  return statusCredenciamentoValido(valor) ? valor : "pendente";
}

/** Rótulo para a tela; sem registro ou valor desconhecido mostra o de "pendente". */
export function rotuloStatusCredenciamento(valor: unknown): string {
  return ROTULO_STATUS_CREDENCIAMENTO[normalizarStatusCredenciamento(valor)];
}

export function tomStatusCredenciamento(valor: unknown): Tom {
  return TOM_STATUS_CREDENCIAMENTO[normalizarStatusCredenciamento(valor)];
}

// ───────────────────────── Compromisso de integridade (MINUTA) ─────────────────────────

/** Versão do texto abaixo; sobe quando o texto muda. */
export const VERSAO_INTEGRIDADE = 1;

export const TITULO_INTEGRIDADE = "Compromisso de integridade do consultor";

/** Aviso para telas internas (admin): o texto ainda é minuta. */
export const AVISO_MINUTA_INTEGRIDADE =
  "Texto em minuta: precisa de revisão de advogado antes do uso real.";

/** Frase ao lado da caixa de confirmação do aceite. */
export const TEXTO_CONFIRMACAO_ACEITE = "Li e aceito o compromisso de integridade.";

/**
 * Compromissos que o consultor assume, na ordem da tela, escritos em primeira
 * pessoa. MINUTA — ver o aviso no alto do arquivo.
 */
export const COMPROMISSOS_INTEGRIDADE: readonly string[] = [
  "Vou atuar com honestidade e não vou oferecer nem pagar dinheiro, favor ou qualquer vantagem indevida a agente público, nem a quem agir em nome dele.",
  "Não vou prometer resultado, preço, economia nem dispensa de licitação. A adesão a uma ata depende da decisão do órgão e das regras da Lei 14.133/2021.",
  "Vou deixar claro, em todo contato, que a Central de Atas é uma plataforma privada: não é órgão público nem o PNCP.",
  "Vou tratar os dados de contato de agentes públicos somente por causa da função pública deles e para o fim da negociação, como manda a LGPD (Lei 13.709/2018).",
  "Vou manter em sigilo as informações das atas e dos fornecedores a que tiver acesso, usando-as só para o trabalho na plataforma.",
  "Vou declarar à equipe, antes de atuar, qualquer conflito de interesse que eu tenha com um órgão, um agente público ou um fornecedor.",
  "Não vou deixar a plataforma de lado para fechar negócio de uma ata intermediada por ela.",
  "Vou respeitar a decisão do órgão sobre aderir ou não, sem pressão e sem tentar decidir no lugar dele.",
  "Vou avisar a equipe se alguém me pedir algo indevido, como pagamento, favor ou informação que não deveria ser dada.",
  "Aceito que os registros que eu fizer na plataforma sejam conferidos pela equipe, para auditoria.",
];

// ───────────────────────── Quem pode atuar ─────────────────────────

/** Só "credenciado" atua; sem registro (nulo), valor desconhecido e os demais status não. */
export function podeAtuar(status: string | null | undefined): boolean {
  return status === "credenciado";
}

/**
 * Mensagem, em português, do motivo de o consultor ainda não poder atuar.
 * Para "credenciado" (que atua) devolve uma frase neutra: quem chama usa a
 * mensagem só quando podeAtuar é falso.
 */
export function mensagemBloqueio(status: string | null | undefined): string {
  switch (normalizarStatusCredenciamento(status)) {
    case "pendente":
      return "Para atuar, aceite primeiro o compromisso de integridade.";
    case "aceito":
      return "Seu aceite foi registrado. Falta a liberação da equipe da plataforma para você atuar.";
    case "suspenso":
      return "Sua atuação está suspensa. Para voltar, aceite o compromisso de integridade de novo e aguarde a liberação da equipe da plataforma.";
    case "credenciado":
      return "Você está credenciado e pode atuar.";
  }
}

// ───────────────────────── Transições ─────────────────────────

/** Quem faz a mudança: o próprio consultor (aceite) ou o administrador. */
export type AtorCredenciamento = "consultor" | "admin";

/** O que se faz: o consultor aceita; o administrador credencia ou suspende. */
export type AcaoCredenciamento = "aceitar" | "credenciar" | "suspender";

type Transicao = {
  de: StatusCredenciamento;
  acao: AcaoCredenciamento;
  ator: AtorCredenciamento;
  para: StatusCredenciamento;
};

/** Todas as transições permitidas; qualquer outra é recusada. */
const TRANSICOES: readonly Transicao[] = [
  { de: "pendente", acao: "aceitar", ator: "consultor", para: "aceito" },
  { de: "aceito", acao: "credenciar", ator: "admin", para: "credenciado" },
  { de: "aceito", acao: "suspender", ator: "admin", para: "suspenso" },
  { de: "credenciado", acao: "suspender", ator: "admin", para: "suspenso" },
  // Volta de suspenso: só por novo aceite do consultor, nunca direto pelo admin.
  { de: "suspenso", acao: "aceitar", ator: "consultor", para: "aceito" },
];

/** Ator que executa cada ação. */
export function atorDaAcao(acao: AcaoCredenciamento): AtorCredenciamento {
  return acao === "aceitar" ? "consultor" : "admin";
}

/**
 * Status resultante de aplicar `acao` a partir de `de`, ou null se a ação não
 * vale nesse status (ex.: credenciar quem ainda não aceitou, aceitar de novo
 * quem já está credenciado). `de` nulo ou desconhecido conta como "pendente".
 */
export function proximoStatus(de: string | null | undefined, acao: AcaoCredenciamento): StatusCredenciamento | null {
  const origem = normalizarStatusCredenciamento(de);
  const t = TRANSICOES.find((x) => x.de === origem && x.acao === acao);
  return t ? t.para : null;
}

/** Ações que `ator` pode executar a partir de `de`, na ordem da tabela de transições. */
export function acoesDisponiveis(de: string | null | undefined, ator: AtorCredenciamento): AcaoCredenciamento[] {
  const origem = normalizarStatusCredenciamento(de);
  return TRANSICOES.filter((t) => t.de === origem && t.ator === ator).map((t) => t.acao);
}

/**
 * A mudança de `de` para `para` é permitida para esse ator? Para a mesma
 * origem e destino, vale se existir alguma ação do ator que a produza.
 * Origem nula ou desconhecida conta como "pendente"; destino desconhecido
 * nunca é válido.
 */
export function transicaoValida(
  de: string | null | undefined,
  para: string,
  ator: AtorCredenciamento,
): boolean {
  if (!statusCredenciamentoValido(para)) return false;
  const origem = normalizarStatusCredenciamento(de);
  return TRANSICOES.some((t) => t.de === origem && t.para === para && t.ator === ator);
}
