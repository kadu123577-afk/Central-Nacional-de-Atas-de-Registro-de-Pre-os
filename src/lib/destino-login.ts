/**
 * Destino depois do login. O formulário do site público manda um campo
 * "destino" (por exemplo, a página da ata da qual o órgão queria pedir adesão
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
  // O pedido de adesão do site leva o órgão de volta à página da ata (/catalogo/<id>).
  if (area === "orgao" && /^\/catalogo\/[A-Za-z0-9]{10,40}$/.test(valor)) return valor;
  // /orgao, /orgao/..., ?query — só letras, números e símbolos comuns de URL.
  const ok = new RegExp(`^/${area}(/[A-Za-z0-9_\\-./]*)?(\\?[A-Za-z0-9_\\-=&%.]*)?$`).test(valor);
  if (!ok || valor.includes("//") || valor.includes("..")) return padrao;
  return valor;
}