/**
 * Destino depois do login. O formulário do site público manda um campo
 * "destino" (por exemplo, o pedido de adesão do item que o órgão escolheu
 * antes de entrar). Como o valor vem do navegador, só é aceito um caminho
 * interno da própria área do usuário — nunca um endereço externo (redirecionamento
 * aberto serviria para phishing).
 */
export function destinoSeguro(
  valor: FormDataEntryValue | null,
  area: "orgao" | "fornecedor",
  padrao: string,
): string {
  if (typeof valor !== "string") return padrao;
  // /orgao, /orgao/..., ?query — só letras, números e símbolos comuns de URL.
  const ok = new RegExp(`^/${area}(/[A-Za-z0-9_\\-./]*)?(\\?[A-Za-z0-9_\\-=&%.]*)?$`).test(valor);
  if (!ok || valor.includes("//") || valor.includes("..")) return padrao;
  return valor;
}