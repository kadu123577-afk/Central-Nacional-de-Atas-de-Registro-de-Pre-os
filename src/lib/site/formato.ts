const fmtNumero = new Intl.NumberFormat("pt-BR");
const fmtMoeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function numero(n: number): string {
  return fmtNumero.format(n);
}

export function moeda(n: number): string {
  return fmtMoeda.format(n);
}

/** "1 item" / "12 itens". */
export function plural(n: number, um: string, varios: string): string {
  return `${numero(n)} ${n === 1 ? um : varios}`;
}

/** Texto sem acento e em minúsculas, para comparar buscas. */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function dataBR(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
