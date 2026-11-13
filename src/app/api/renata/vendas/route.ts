import { consultarVendasPorConsultor } from "@/lib/renata-dados";
import { responderRenata } from "@/lib/renata-rota";

export const dynamic = "force-dynamic";

/** Vendas por consultor, com `?consultor=<id>` opcional (somente leitura; desligada por padrão). Ver src/lib/renata-api.ts. */
export async function GET(request: Request) {
  const consultor = new URL(request.url).searchParams.get("consultor");
  const id = consultor && /^[A-Za-z0-9_-]{1,64}$/.test(consultor) ? consultor : undefined;
  return responderRenata(request, "vendas", () => consultarVendasPorConsultor(id));
}
