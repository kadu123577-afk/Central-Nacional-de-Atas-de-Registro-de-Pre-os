import { randomInt } from "node:crypto";

/**
 * Senha provisória (2026-11-14): a gestão cria ou redefine a conta e passa esta senha
 * à pessoa, que é obrigada a trocá-la no primeiro acesso (/trocar-senha). Quatro
 * grupos de quatro caracteres ("Kf7m-Qx2p-Tn9w-Zc4h"), sem os caracteres que se
 * confundem (I, l, 1, O, o, 0), sorteados com o gerador criptográfico do Node e
 * sempre com maiúscula, minúscula e número. Só roda no servidor.
 */
const MAIUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz";
const DIGITOS = "23456789";
const TODOS = MAIUSCULAS + MINUSCULAS + DIGITOS;

export function gerarSenhaProvisoria(): string {
  for (;;) {
    let corpo = "";
    for (let i = 0; i < 16; i += 1) corpo += TODOS[randomInt(TODOS.length)];
    if (/[A-Z]/.test(corpo) && /[a-z]/.test(corpo) && /\d/.test(corpo)) {
      return (corpo.match(/.{4}/g) as string[]).join("-");
    }
  }
}
