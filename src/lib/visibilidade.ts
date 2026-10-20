import { adminIdLogado, orgaoIdLogado, vendedorIdLogado } from "@/lib/auth";

/**
 * Quem pode ver o quê na vitrine (decisão de negócio de 2026-10-20). O modelo é
 * de intermediação com comissão: quem consegue localizar a ata no PNCP contrata
 * direto com o fornecedor e a plataforma perde a comissão. E para localizar uma
 * ata no PNCP basta o objeto somado a QUALQUER um destes: UF, itens,
 * quantidades, saldo ou vigência. Por isso:
 *
 * - "publico":  visitante. Só categoria, objeto e um código público. Nada de
 *               UF, itens, saldo ou vigência — nem como filtro ou ordenação.
 * - "orgao":    órgão logado. Também UF, vigência em faixa e todos os itens
 *               (descrição, unidade, saldo %), porque precisa escolher o que
 *               pedir. Ainda sem órgão gerenciador, fornecedor, preço,
 *               quantidade, nº do PNCP e documentos.
 * - "completo": admin ou vendedor. Tudo.
 *
 * Esta decisão é tomada no SERVIDOR: os campos restritos nem são lidos do banco
 * nem chegam ao navegador de quem não tem o nível. Esconder só na tela não
 * protege nada, porque o dado ficaria no código-fonte da página.
 *
 * Limite conhecido: o PNCP é público; o sigilo remove a conveniência, não a
 * informação. Se também o nível "orgao" não deve ver UF e itens, o lugar de
 * mudar é aqui e em src/lib/catalogo-publico.ts.
 */
export type NivelVisao = "publico" | "orgao" | "completo";

export async function nivelDeVisao(): Promise<NivelVisao> {
  const [admin, vendedor] = await Promise.all([adminIdLogado(), vendedorIdLogado()]);
  if (admin || vendedor) return "completo";
  if (await orgaoIdLogado()) return "orgao";
  return "publico";
}

export function veDadosComerciais(nivel: NivelVisao): boolean {
  return nivel === "completo";
}