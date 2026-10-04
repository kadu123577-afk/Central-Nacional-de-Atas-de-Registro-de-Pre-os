/** Formatação compacta de dinheiro pra cartões e indicadores (R$ 1,24 mi, R$ 820 mil). */
export function moedaCurta(valor: number): string {
  const abs = Math.abs(valor);
  const sinal = valor < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const mi = abs / 1_000_000;
    return `${sinal}R$ ${mi.toLocaleString("pt-BR", { maximumFractionDigits: mi >= 10 ? 1 : 2, minimumFractionDigits: 0 })} mi`;
  }
  if (abs >= 10_000) {
    return `${sinal}R$ ${Math.round(abs / 1000).toLocaleString("pt-BR")} mil`;
  }
  return `${sinal}${abs.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`;
}

/** Fração do banco (0.075) → "7,5%" sem lixo de ponto flutuante. */
export function percentualDeFracao(fracao: number): string {
  return `${String(Number((fracao * 100).toFixed(2))).replace(".", ",")}%`;
}

/** Data só-dia (guardada à meia-noite UTC) → dd/mm/aaaa sem deslocar o dia pelo fuso. */
export function dataCurtaUtc(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Timestamp real (prazo, atualização) → dd/mm no fuso do navegador/servidor. */
export function diaMes(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
