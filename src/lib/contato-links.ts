/**
 * Links de ação rápida a partir do contato (ligar, e-mail, WhatsApp).
 * Só gera WhatsApp pra número que parece celular brasileiro (DDD + 9 +
 * 8 dígitos) — telefone fixo de prefeitura não recebe WhatsApp, e um
 * link quebrado no card seria pior que nenhum.
 */
function soDigitos(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

function comPais(digitos: string): string | null {
  const semZero = digitos.replace(/^0+/, "");
  if (semZero.length === 10 || semZero.length === 11) return `55${semZero}`;
  if ((semZero.length === 12 || semZero.length === 13) && semZero.startsWith("55")) return semZero;
  return null;
}

export function linkTelefone(telefone: string | null): string | null {
  if (!telefone) return null;
  const completo = comPais(soDigitos(telefone));
  return completo ? `tel:+${completo}` : null;
}

export function linkWhatsapp(telefone: string | null): string | null {
  if (!telefone) return null;
  const completo = comPais(soDigitos(telefone));
  if (!completo) return null;
  const nacional = completo.slice(2);
  const pareceCelular = nacional.length === 11 && nacional[2] === "9";
  return pareceCelular ? `https://wa.me/${completo}` : null;
}

export function linkEmail(email: string | null): string | null {
  const limpo = email?.trim();
  return limpo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo) ? `mailto:${limpo}` : null;
}
