/**
 * Política de senha (2026-10-20). Mínimo de 12 caracteres, máximo de 72
 * bytes (o bcrypt ignora o que passa disso — aceitar mais daria falsa
 * sensação de segurança), e recusa as senhas mais óbvias.
 *
 * Só vale para senhas NOVAS (cadastro, troca, criação de usuário): quem já
 * tem senha de 8 caracteres continua conseguindo entrar e é orientado a
 * trocar pela tela de perfil.
 */

export const TAMANHO_MINIMO_SENHA = 12;
const TAMANHO_MAXIMO_BYTES = 72;

const SENHAS_COMUNS = new Set([
  "123456789012",
  "1234567890123",
  "123456789abc",
  "password1234",
  "senha1234567",
  "senha12345678",
  "senhasenhasenha",
  "mudar123456",
  "admin1234567",
  "administrador",
  "qwertyuiop12",
  "qwertyuiopasdf",
  "abcdefghijkl",
  "abc123456789",
  "brasil123456",
  "tech10tech10",
  "tech102026",
  "central12345",
  "centralatas",
  "centralatas123",
  "letmein12345",
  "welcome12345",
  "iloveyou1234",
  "aaaaaaaaaaaa",
  "000000000000",
  "111111111111",
]);

export const MENSAGEM_REQUISITOS_SENHA = `A senha precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres e não pode ser uma senha comum.`;

/** Retorna a mensagem de erro, ou null se a senha é aceitável. */
export function validarSenhaNova(senha: string, email?: string): string | null {
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    return `A senha precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  }
  if (Buffer.byteLength(senha, "utf8") > TAMANHO_MAXIMO_BYTES) {
    return "A senha é longa demais (máximo de 72 bytes).";
  }

  const normalizada = senha.toLowerCase();
  if (SENHAS_COMUNS.has(normalizada) || new Set(normalizada).size <= 3) {
    return "Essa senha é fácil de adivinhar. Escolha outra, com mais variedade.";
  }

  const parteLocalEmail = email?.split("@")[0]?.trim().toLowerCase();
  if (parteLocalEmail && parteLocalEmail.length >= 4 && normalizada.includes(parteLocalEmail)) {
    return "A senha não pode conter o seu e-mail.";
  }

  return null;
}
