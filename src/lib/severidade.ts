import type { Tom } from "@/components/ui/badge";

/**
 * Única fonte de verdade pra "qual cor esse status de negócio recebe".
 * Nenhuma página decide isso na mão — todas chamam uma função daqui.
 */

export function tomStatusAta(status: "PENDENTE" | "APROVADA" | "REJEITADA"): Tom {
  if (status === "APROVADA") return "neutro";
  if (status === "REJEITADA") return "critico";
  return "atencao"; // PENDENTE — precisa de moderação
}

export function tomFaturamento(pago: boolean): Tom {
  return pago ? "neutro" : "atencao";
}
