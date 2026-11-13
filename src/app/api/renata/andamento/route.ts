import { consultarAndamentoDoCiclo } from "@/lib/renata-dados";
import { responderRenata } from "@/lib/renata-rota";

export const dynamic = "force-dynamic";

/** Andamento do ciclo das atas, atividades 1 a 7 (somente leitura; desligada por padrão). Ver src/lib/renata-api.ts. */
export async function GET(request: Request) {
  return responderRenata(request, "andamento", consultarAndamentoDoCiclo);
}
