/**
 * Conferência do ambiente na partida do servidor em produção (14/11/2026). Regras puras: quem
 * chama (src/instrumentation.ts) passa as variáveis de ambiente. Um erro derruba a partida com a
 * mensagem do que falta, em vez de deixar o sistema subir quebrado e falhar no primeiro login;
 * um aviso só aparece no log. Existe porque o sistema vai ser publicado por quem não o escreveu.
 */
export interface ProblemaDeAmbiente {
  variavel: string;
  gravidade: "erro" | "aviso";
  mensagem: string;
}

type Ambiente = Record<string, string | undefined>;

export const TAMANHO_MINIMO_DO_SEGREDO = 32;

export function verificarAmbiente(env: Ambiente): ProblemaDeAmbiente[] {
  const problemas: ProblemaDeAmbiente[] = [];
  const erro = (variavel: string, mensagem: string) => problemas.push({ variavel, gravidade: "erro", mensagem });
  const aviso = (variavel: string, mensagem: string) => problemas.push({ variavel, gravidade: "aviso", mensagem });

  // --- Sem isto o sistema não funciona -----------------------------------------------------
  if (!env.DATABASE_URL) {
    erro("DATABASE_URL", "Falta a string de conexão do PostgreSQL (postgresql://usuario:senha@servidor:5432/banco).");
  } else if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
    erro("DATABASE_URL", "A string de conexão precisa começar com postgresql://");
  }

  if (!env.SESSION_SECRET) {
    erro("SESSION_SECRET", `Falta o segredo que assina as sessões (string aleatória de ao menos ${TAMANHO_MINIMO_DO_SEGREDO} caracteres).`);
  } else if (env.SESSION_SECRET.length < TAMANHO_MINIMO_DO_SEGREDO) {
    erro("SESSION_SECRET", `O segredo das sessões é curto demais: use ao menos ${TAMANHO_MINIMO_DO_SEGREDO} caracteres aleatórios.`);
  }

  // --- Funciona, mas não deveria ir ao ar assim --------------------------------------------
  if (!env.CRON_SECRET) {
    aviso("CRON_SECRET", "Sem CRON_SECRET, as rotinas automáticas (rastreadores do PNCP e do Compras.gov) recusam toda chamada.");
  }
  if (!env.TOTP_ENCRYPTION_KEY) {
    aviso(
      "TOTP_ENCRYPTION_KEY",
      "Sem TOTP_ENCRYPTION_KEY, o segredo do 2FA é cifrado com o SESSION_SECRET: trocar o SESSION_SECRET depois obrigaria todos a recadastrar o 2FA.",
    );
  }
  if (!env.NEXT_PUBLIC_SITE_URL) {
    aviso("NEXT_PUBLIC_SITE_URL", "Falta o endereço público do sistema (ex.: https://atas.exemplo.com.br).");
  } else if (!env.NEXT_PUBLIC_SITE_URL.startsWith("https://")) {
    aviso("NEXT_PUBLIC_SITE_URL", "O endereço público deveria ser https://: os cookies de sessão só trafegam em conexão segura.");
  }
  if (env.AMBIENTE_DEMONSTRACAO === "true") {
    aviso("AMBIENTE_DEMONSTRACAO", "O modo de demonstração mostra dados fictícios no catálogo. Não use em produção.");
  }
  if (env.RENATA_API_ATIVA === "sim") {
    aviso("RENATA_API_ATIVA", "A leitura para a Renata está LIGADA. Confirme que a ARCA autorizou por escrito (NDA do Projeto RNA).");
  }

  return problemas;
}

/** Texto para o log: um problema por linha. */
export function descreverProblemas(problemas: readonly ProblemaDeAmbiente[]): string {
  return problemas.map((p) => `  - [${p.gravidade}] ${p.variavel}: ${p.mensagem}`).join("\n");
}
