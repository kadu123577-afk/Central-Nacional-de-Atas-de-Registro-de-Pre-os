import { adminIdLogado, orgaoIdLogado, vendedorIdLogado } from "@/lib/auth";

/**
 * Quem pode ver o quê na vitrine (decisão de negócio de 2026-10-20). O modelo é
 * de intermediação com comissão: quem consegue localizar a ata no PNCP contrata
 * direto com o fornecedor e a plataforma perde a comissão. E para localizar uma
 * ata no PNCP basta o objeto somado a QUALQUER um destes: UF, itens,
 * quantidades, saldo ou vigência. Como o órgão comprador também pode procurar no
 * PNCP, a restrição vale para ele também:
 *
 * - "publico":  visitante. Só categoria, objeto e um código público. Nada de
 *               UF, itens, saldo ou vigência — nem como filtro ou ordenação.
 * - "orgao":    órgão logado. Os MESMOS dados do visitante. A diferença é que
 *               pode enviar o pedido de adesão da ata (sem escolher item: a
 *               equipe confere itens e saldo e monta o pedido).
 * - "completo": admin ou vendedor. Tudo.
 *
 * Esta decisão é tomada no SERVIDOR: os campos restritos nem são lidos do banco
 * nem chegam ao navegador de quem não é da equipe. Esconder só na tela não
 * protege nada, porque o dado ficaria no código-fonte da página.
 *
 * Limite conhecido: o PNCP é público; o sigilo remove a conveniência, não a
 * informação (o objeto da ata costuma ser o mesmo texto do PNCP).
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