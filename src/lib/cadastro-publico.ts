import { cnpjValido, normalizarCnpj } from "@/lib/radar-atas";
import { cnpjParaTela } from "@/lib/radar-atas-view";

/**
 * Cadastro público de órgão e fornecedor (14/11/2026): quem se cadastra sozinho NÃO entra na hora. A
 * conta nasce inativa e marcada "aguardando liberação"; a equipe confere os dados e libera em
 * Equipe e conta > Usuários. Antes a conta nascia ativa, sem conferir o CNPJ, e já entrava no sistema.
 */

export const MENSAGEM_CADASTRO_RECEBIDO =
  "A equipe da ARCA Capital confere os dados e libera o acesso. Por segurança, até lá a tela de entrada responde " +
  "“e-mail ou senha inválidos”. Se precisar de pressa, escreva para contato@arcacapital.com.br.";

export const MENSAGEM_AGUARDANDO_LIBERACAO =
  "Seu cadastro ainda está aguardando a liberação da equipe da ARCA Capital. Assim que for liberado, você consegue entrar.";

export const MENSAGEM_CONTA_DESATIVADA = "Esta conta foi desativada. Fale com a ARCA Capital para reativar o acesso.";

/** O que dizer a quem tenta entrar com a conta inativa (só nas telas de entrada antigas; a de /entrar nunca revela). */
export function mensagemDeContaInativa(aguardaLiberacao: boolean): string {
  return aguardaLiberacao ? MENSAGEM_AGUARDANDO_LIBERACAO : MENSAGEM_CONTA_DESATIVADA;
}

export type CnpjDoCadastro = { ok: true; digitos: string } | { ok: false; erro: string };

/** O CNPJ do cadastro: 14 dígitos com os dígitos verificadores certos (CPF e número inventado não passam). */
export function lerCnpjDoCadastro(texto: string): CnpjDoCadastro {
  if (!cnpjValido(texto)) return { ok: false, erro: "CNPJ inválido. Confira os 14 dígitos." };
  return { ok: true, digitos: normalizarCnpj(texto) as string };
}

/**
 * As formas em que o mesmo CNPJ pode estar guardado: só dígitos ou com máscara (cadastros antigos
 * guardaram o que foi digitado). A busca por duplicidade olha as duas.
 */
export function variantesDoCnpj(digitos: string): string[] {
  const mascarado = cnpjParaTela(digitos);
  return mascarado ? [digitos, mascarado] : [digitos];
}
