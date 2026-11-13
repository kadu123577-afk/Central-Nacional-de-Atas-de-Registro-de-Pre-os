import { limiteAgregado, limitePorOrgao, verificarAdesao } from "@/lib/saldo";

/**
 * Registro da adesão com a quantidade de cada item (2026-11-14, atividade 13 do workflow).
 * Regras puras, sem banco: dadas as quantidades pedidas, o que cada item já consumiu e o que o
 * município já aderiu, diz se o registro cabe nos limites do art. 86 da Lei 14.133/2021 (50% por
 * órgão e 200% no total, por item) e quanto vale em reais. A tela e a ação usam o mesmo cálculo.
 */

export interface ItemParaRegistro {
  itemId: string;
  descricao: string;
  unidade: string;
  quantidadeRegistrada: number;
  /** Texto do banco, "25.90". */
  valorUnitario: string;
  /** Soma já aceita no item, de todos os órgãos (Saldo.quantidadeConsumida). */
  consumidoNoTotal: number;
  /** Quanto este município já aderiu neste item, em registros anteriores. */
  consumidoPeloMunicipio: number;
}

export interface LinhaDoRegistro {
  itemId: string;
  descricao: string;
  quantidade: number;
  valorCentavos: number;
}

export type ResultadoRegistro =
  | { ok: true; linhas: LinhaDoRegistro[]; valorTotalCentavos: number }
  | { ok: false; erros: string[] };

/** "25.90" → 2590. O banco guarda duas casas, então a conta é feita em centavos inteiros. */
export function centavosDoValor(valor: string): number {
  return Math.round(Number(valor) * 100);
}

export function formatarReaisDeCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
}

const num = (n: number) => n.toLocaleString("pt-BR");

/**
 * Lê as quantidades do formulário: campos `qtd_<itemId>`. Vazio ou zero = o item não entra.
 * Devolve só os itens pedidos; valor que não é inteiro positivo vira erro (nunca é "arredondado").
 */
export function lerQuantidadesDoFormulario(
  formData: FormData,
  itensDaAta: readonly { itemId: string; descricao: string }[],
): { pedidos: Map<string, number>; erros: string[] } {
  const pedidos = new Map<string, number>();
  const erros: string[] = [];
  for (const item of itensDaAta) {
    const bruto = formData.get(`qtd_${item.itemId}`);
    const texto = typeof bruto === "string" ? bruto.trim().replace(/\./g, "") : "";
    if (!texto || texto === "0") continue;
    if (!/^\d+$/.test(texto) || Number(texto) <= 0 || Number(texto) > 2_000_000_000) {
      erros.push(`"${item.descricao}": informe um número inteiro maior que zero.`);
      continue;
    }
    pedidos.set(item.itemId, Number(texto));
  }
  return { pedidos, erros };
}

export function calcularRegistroDeAdesao(
  itens: readonly ItemParaRegistro[],
  pedidos: ReadonlyMap<string, number>,
): ResultadoRegistro {
  const erros: string[] = [];
  const linhas: LinhaDoRegistro[] = [];

  if (pedidos.size === 0) {
    return { ok: false, erros: ["Informe a quantidade aderida de pelo menos um item."] };
  }

  for (const item of itens) {
    const quantidade = pedidos.get(item.itemId);
    if (quantidade === undefined) continue;

    const resultado = verificarAdesao(item.quantidadeRegistrada, item.consumidoNoTotal, item.consumidoPeloMunicipio, quantidade);
    if (!resultado.permitido) {
      if (resultado.motivo === "LIMITE_POR_ORGAO_EXCEDIDO") {
        const restante = Math.max(0, Math.floor(limitePorOrgao(item.quantidadeRegistrada)) - item.consumidoPeloMunicipio);
        erros.push(
          `"${item.descricao}": o município pode aderir a no máximo ${num(Math.floor(limitePorOrgao(item.quantidadeRegistrada)))} (50% do registrado); ` +
            `já aderiu a ${num(item.consumidoPeloMunicipio)} e restam ${num(restante)}.`,
        );
      } else {
        erros.push(
          `"${item.descricao}": o total de adesões não pode passar de ${num(limiteAgregado(item.quantidadeRegistrada))} (200% do registrado); ` +
            `restam ${num(Math.max(0, resultado.saldoAgregadoDisponivel))}.`,
        );
      }
      continue;
    }
    linhas.push({
      itemId: item.itemId,
      descricao: item.descricao,
      quantidade,
      valorCentavos: centavosDoValor(item.valorUnitario) * quantidade,
    });
  }

  // Pedido para item que não é desta ata (formulário montado à mão): recusado, nunca ignorado em silêncio.
  const conhecidos = new Set(itens.map((i) => i.itemId));
  for (const id of pedidos.keys()) {
    if (!conhecidos.has(id)) erros.push("Há um item que não pertence a esta ata.");
  }

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, linhas, valorTotalCentavos: linhas.reduce((soma, l) => soma + l.valorCentavos, 0) };
}
