import { lerEquipeInicial } from "@/lib/equipe-inicial";
import { validarSenhaNova } from "@/lib/senha";

/**
 * Implantação em um comando só (16/11/2026, pedido de Carlos: "deixar pronto para ele subir tudo e eu só
 * logar"). As senhas e a lista da equipe NÃO ficam no git (o repositório é público): vêm de variáveis de
 * ambiente, que quem implanta cola do arquivo de variáveis que a coordenação entrega. Este módulo só
 * decide, sem tocar no banco, o que o comando vai fazer e o que está errado ou faltando. A execução
 * está em prisma/implantar.ts.
 */

export type Ambiente = Record<string, string | undefined>;

export interface PlanoDeImplantacao {
  /** Passos que o comando vai executar, em ordem. */
  passos: ("administrador" | "equipe")[];
  /** Quantas pessoas da equipe entram (só quando há o passo da equipe). */
  pessoasDaEquipe: number;
  /** Coisas que impedem de seguir. Com qualquer erro, nada é executado. */
  erros: string[];
  /** Coisas que não impedem, mas merecem atenção. */
  avisos: string[];
}

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function preenchida(valor: string | undefined): valor is string {
  return typeof valor === "string" && valor.trim() !== "";
}

/** O JSON da equipe pode vir direto ou em base64 (mais fácil de colar em painel de hospedagem). */
export function lerJsonDaEquipe(bruto: string): unknown {
  const texto = bruto.trim();
  try {
    return JSON.parse(texto);
  } catch {
    return JSON.parse(Buffer.from(texto, "base64").toString("utf8"));
  }
}

export function planejarImplantacao(env: Ambiente): PlanoDeImplantacao {
  const erros: string[] = [];
  const avisos: string[] = [];
  const passos: PlanoDeImplantacao["passos"] = [];
  let pessoasDaEquipe = 0;

  if (!preenchida(env.DATABASE_URL)) {
    erros.push("Falta DATABASE_URL (a string do Session pooler do Supabase, porta 5432, para criar as tabelas).");
  }
  if (env.AMBIENTE_DEMONSTRACAO === "true") {
    erros.push("AMBIENTE_DEMONSTRACAO está ligado. Nunca implante com os dados de demonstração.");
  }

  // Primeiro administrador.
  const temEmail = preenchida(env.ADMIN_EMAIL);
  const temSenha = preenchida(env.ADMIN_SENHA);
  if (temEmail || temSenha) {
    if (!temEmail || !temSenha) {
      erros.push("Informe ADMIN_EMAIL e ADMIN_SENHA juntos (ou nenhum dos dois).");
    } else if (!FORMATO_EMAIL.test(env.ADMIN_EMAIL!.trim())) {
      erros.push("ADMIN_EMAIL não é um e-mail válido.");
    } else {
      const erroSenha = validarSenhaNova(env.ADMIN_SENHA!, env.ADMIN_EMAIL!.trim());
      if (erroSenha) erros.push(`ADMIN_SENHA não vale: ${erroSenha}`);
      else passos.push("administrador");
    }
  }

  // Equipe.
  const temJson = preenchida(env.EQUIPE_JSON);
  const temArquivo = preenchida(env.EQUIPE_ARQUIVO);
  if (temJson || temArquivo) {
    if (!preenchida(env.SENHA_PROVISORIA)) {
      erros.push("Informe SENHA_PROVISORIA, a senha inicial que a equipe vai trocar no primeiro acesso.");
    } else if (temJson) {
      try {
        const { contas, problemas } = lerEquipeInicial(lerJsonDaEquipe(env.EQUIPE_JSON!));
        if (problemas.length > 0) erros.push(`EQUIPE_JSON tem problemas: ${problemas.join(" ")}`);
        else {
          pessoasDaEquipe = contas.length;
          passos.push("equipe");
        }
      } catch {
        erros.push("EQUIPE_JSON não é um JSON válido (nem JSON em base64).");
      }
    } else {
      // EQUIPE_ARQUIVO: quem lê e valida é o próprio script da equipe.
      passos.push("equipe");
    }
  }

  if (passos.length === 0 && erros.length === 0) {
    erros.push("Nada a implantar: informe ADMIN_EMAIL e ADMIN_SENHA e/ou EQUIPE_JSON e SENHA_PROVISORIA.");
  }
  if (!preenchida(env.SESSION_SECRET) || env.SESSION_SECRET!.length < 32) {
    avisos.push("SESSION_SECRET ausente ou curta (32 caracteres ou mais): o site recusa subir sem ela.");
  }
  if (!preenchida(env.TOTP_ENCRYPTION_KEY)) {
    avisos.push("TOTP_ENCRYPTION_KEY ausente: defina antes do primeiro uso do 2FA e nunca troque.");
  }
  if (!preenchida(env.CRON_SECRET)) {
    avisos.push("CRON_SECRET ausente: as rotinas automáticas (rastreadores) vão recusar todas as chamadas.");
  }

  return { passos, pessoasDaEquipe, erros, avisos };
}
