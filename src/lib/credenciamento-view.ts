/**
 * Apoio das telas e das ações do credenciamento do consultor (2026-10-23,
 * Projeto RNA etapa 6). Funções puras — sem banco, sem rede, sem relógio — que
 * ficam fora de src/lib/credenciamento.ts (regras do modelo) para não misturar
 * vocabulário de status com texto de tela. Não importe o Prisma aqui: os
 * componentes de formulário (que rodam no navegador) usam este arquivo.
 */
import {
  normalizarStatusCredenciamento,
  type AcaoCredenciamento,
  type StatusCredenciamento,
} from "./credenciamento";

/** Tela do consultor onde ele aceita o compromisso e acompanha a liberação. */
export const CAMINHO_CREDENCIAMENTO = "/vendedor/credenciamento";

/** Limite técnico do motivo de suspensão (cabe na auditoria, que corta em 500 caracteres). */
export const LIMITE_MOTIVO_SUSPENSAO = 300;

/** Mensagem de quando o status mudou entre a tela e a gravação (outra aba, outro administrador). */
export const ERRO_CONFLITO_CREDENCIAMENTO =
  "O credenciamento mudou enquanto você olhava a tela. Atualize a página e confira o status atual.";

/**
 * Estágios do Kanban que só um consultor credenciado pode escolher (tomar
 * trabalho novo). Os demais (a contatar, recusado) e o registro de contato
 * continuam livres: sair de uma negociação nunca depende de credenciamento.
 */
export const ESTAGIOS_QUE_EXIGEM_CREDENCIAMENTO: readonly string[] = ["em_negociacao", "aderiu"];

export function estagioExigeCredenciamento(estagio: string): boolean {
  return ESTAGIOS_QUE_EXIGEM_CREDENCIAMENTO.includes(estagio);
}

/**
 * Motivo digitado pelo administrador: uma linha só, sem caracteres de controle
 * nem os que invertem o sentido do texto, espaços repetidos viram um.
 */
export function normalizarMotivo(texto: string): string {
  return texto
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mensagem de bloqueio para o consultor, com o caminho da tela de credenciamento. */
export function comLinkDeCredenciamento(mensagem: string): string {
  return `${mensagem} Abra o menu Credenciamento (${CAMINHO_CREDENCIAMENTO}).`;
}

/** Título curto do aviso do painel do consultor, por status. */
export function tituloAvisoCredenciamento(status: unknown): string {
  switch (normalizarStatusCredenciamento(status)) {
    case "pendente":
      return "Falta o seu aceite.";
    case "aceito":
      return "Aguardando a equipe.";
    case "suspenso":
      return "Atuação suspensa.";
    case "credenciado":
      return "Você está credenciado.";
  }
}

/**
 * Por que a ação não vale no status atual, em frase para a tela. Só cobre as
 * recusas que existem na tabela de transições; o resto cai na frase genérica.
 */
export function erroDeTransicao(acao: AcaoCredenciamento, de: string | null | undefined): string {
  const status: StatusCredenciamento = normalizarStatusCredenciamento(de);
  switch (acao) {
    case "aceitar":
      if (status === "aceito") return "Seu aceite já foi registrado. Falta a liberação da equipe da plataforma.";
      if (status === "credenciado") return "Você já está credenciado.";
      break;
    case "credenciar":
      if (status === "pendente") return "Este consultor ainda não aceitou o compromisso de integridade.";
      if (status === "credenciado") return "Este consultor já está credenciado.";
      if (status === "suspenso") {
        return "Este consultor está suspenso. Ele precisa aceitar o compromisso de novo antes de ser credenciado.";
      }
      break;
    case "suspender":
      if (status === "pendente") return "Só dá para suspender quem já aceitou o compromisso de integridade.";
      if (status === "suspenso") return "Este consultor já está suspenso.";
      break;
  }
  return "Essa mudança de status não é permitida.";
}

/**
 * Fecha a frase de um texto digitado por uma pessoa: se ele já termina em
 * ponto, interrogação, exclamação ou reticências, fica como está; senão
 * ganha um ponto. Evita o ".." quando o motivo vem dentro de uma frase.
 */
export function fecharFrase(texto: string): string {
  const limpo = texto.trim();
  if (!limpo) return "";
  return /[.!?…]$/u.test(limpo) ? limpo : `${limpo}.`;
}

/** dd/mm/aaaa no fuso de Brasília; vazio quando não há data. */
export function dataBr(data: Date | string | null | undefined): string {
  if (!data) return "";
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** O que a tela do administrador precisa de um registro de credenciamento. */
export interface RegistroParaResumo {
  status: string;
  integridadeAceitaEm: Date | string | null;
  integridadeVersao: number | null;
  credenciadoEm: Date | string | null;
  suspensoEm: Date | string | null;
  motivo: string | null;
}

/**
 * Frase de apoio sob o selo de status, na lista de vendedores do administrador.
 * Sem registro (nulo) conta como "pendente".
 */
export function resumoParaAdmin(registro: RegistroParaResumo | null | undefined): string {
  const status = normalizarStatusCredenciamento(registro?.status);
  const aceite = registro?.integridadeAceitaEm
    ? `Aceitou em ${dataBr(registro.integridadeAceitaEm)}${
        registro.integridadeVersao ? ` (texto versão ${registro.integridadeVersao})` : ""
      }.`
    : "";
  switch (status) {
    case "pendente":
      return "Ainda não aceitou o compromisso de integridade.";
    case "aceito": {
      // Quem volta de uma suspensão traz a suspensão anterior (a coluna só é
      // limpa quando a equipe credencia de novo): quem decide precisa ver o motivo.
      const suspensaoAnterior = registro?.suspensoEm
        ? `Foi suspenso em ${dataBr(registro.suspensoEm)}.${
            registro.motivo ? ` Motivo: ${fecharFrase(registro.motivo)}` : ""
          }`
        : "";
      return [aceite, suspensaoAnterior, "Aguardando a sua liberação."].filter(Boolean).join(" ");
    }
    case "credenciado": {
      const quando = dataBr(registro?.credenciadoEm);
      return [quando ? `Credenciado em ${quando}.` : "Credenciado.", aceite].filter(Boolean).join(" ");
    }
    case "suspenso": {
      const quando = dataBr(registro?.suspensoEm);
      const motivo = registro?.motivo ? ` Motivo: ${fecharFrase(registro.motivo)}` : "";
      return `${quando ? `Suspenso em ${quando}.` : "Suspenso."}${motivo} Para voltar, o consultor aceita o compromisso de novo e você credencia.`;
    }
  }
}
