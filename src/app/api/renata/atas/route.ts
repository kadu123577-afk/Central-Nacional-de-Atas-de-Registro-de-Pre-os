import { consultarSaldoDasAtas } from "@/lib/renata-dados";
import { responderRenata } from "@/lib/renata-rota";

export const dynamic = "force-dynamic";

/** Saldo das atas liberadas para a venda (somente leitura; desligada por padrão). Ver src/lib/renata-api.ts. */
export async function GET(request: Request) {
  return responderRenata(request, "atas", consultarSaldoDasAtas);
}
