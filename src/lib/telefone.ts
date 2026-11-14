/**
 * Celular dos responsáveis (14/11/2026): a Renata avisa cada responsável pelo WhatsApp quando um prazo
 * vence, então a conta da equipe e o consultor guardam um telefone. É dado pessoal: só a Gestão vê e
 * edita, nunca vai para a trilha de auditoria, e não entra no repositório.
 *
 * Guardado só com dígitos, com o código do país (55) na frente: "5562999990001". É o formato que o
 * WhatsApp espera, sem o "+".
 */

export type ResultadoTelefone = { ok: true; valor: string | null } | { ok: false; erro: string };

const ERRO_TELEFONE = "Informe o celular com DDD, por exemplo (62) 99999-9999.";

/**
 * Lê o telefone digitado: vazio vira "sem telefone" (null); aceita máscara, espaços, "+55" e "55" na
 * frente. Recusa o que não tem DDD e número de celular ou fixo brasileiro.
 */
export function lerTelefone(bruto: unknown): ResultadoTelefone {
  const texto = typeof bruto === "string" ? bruto.trim() : "";
  if (!texto) return { ok: true, valor: null };
  if (!/^[\d\s().+-]+$/.test(texto)) return { ok: false, erro: ERRO_TELEFONE };

  let digitos = texto.replace(/\D/g, "");
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) digitos = digitos.slice(2);
  if (digitos.length !== 10 && digitos.length !== 11) return { ok: false, erro: ERRO_TELEFONE };

  const ddd = Number(digitos.slice(0, 2));
  if (ddd < 11 || ddd > 99 || digitos[1] === "0") return { ok: false, erro: ERRO_TELEFONE };
  // Celular tem 11 dígitos e o número começa em 9; fixo tem 10 e começa de 2 a 5.
  const numero = digitos.slice(2);
  if (digitos.length === 11 && numero[0] !== "9") return { ok: false, erro: ERRO_TELEFONE };
  if (digitos.length === 10 && !/^[2-5]/.test(numero)) return { ok: false, erro: ERRO_TELEFONE };

  return { ok: true, valor: `55${digitos}` };
}

/** "5562999990001" → "(62) 99999-0001"; sem telefone, texto vazio. */
export function formatarTelefone(valor: string | null | undefined): string {
  if (!valor) return "";
  const digitos = valor.replace(/\D/g, "");
  const nacional = digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
  if (nacional.length === 11) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  if (nacional.length === 10) return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  return valor;
}
