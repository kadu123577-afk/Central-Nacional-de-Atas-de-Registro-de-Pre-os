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
type ParametroDaUrl = string | string[] | undefined;

function textoUnico(valor: ParametroDaUrl): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}

/**
 * Para onde o órgão vai depois de entrar em /entrar, a partir do que veio na
 * URL: a ata do pedido de adesão (?ata=) ou um caminho da própria área do
 * órgão (?destino=). Passa pelo mesmo filtro de destinoSeguro, então qualquer
 * outra coisa (endereço externo, protocolo, "//", "..") vira /orgao.
 */
export function destinoOrgaoDaBusca(busca: { ata?: ParametroDaUrl; destino?: ParametroDaUrl }): string {
  const ata = textoUnico(busca.ata);
  if (ata) {
    const daAta = destinoSeguro(`/catalogo/${ata}`, "orgao", "");
    if (daAta) return daAta;
  }
  return destinoSeguro(textoUnico(busca.destino) ?? null, "orgao", "/orgao");
}

/**
 * Endereço de /entrar para as páginas de login antigas (/admin/login,
 * /vendedor/login, /fornecedor/login, /orgao/login) redirecionarem: leva junto
 * só o destino que for válido (ata ou caminho do órgão) e descarta o resto.
 */
export function caminhoEntrar(busca: { ata?: ParametroDaUrl; destino?: ParametroDaUrl }): string {
  const ata = textoUnico(busca.ata);
  if (ata && destinoSeguro(`/catalogo/${ata}`, "orgao", "")) {
    return `/entrar?${new URLSearchParams({ ata }).toString()}`;
  }
  const destino = destinoSeguro(textoUnico(busca.destino) ?? null, "orgao", "");
  if (destino) {
    return `/entrar?${new URLSearchParams({ destino }).toString()}`;
  }
  return "/entrar";
}
