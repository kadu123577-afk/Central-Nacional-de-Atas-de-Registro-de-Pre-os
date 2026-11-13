import { NextResponse } from "next/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizarRenata } from "@/lib/renata-api";

/**
 * Cola das rotas /api/renata/*: confere a autorização, monta a resposta e deixa cada consulta na
 * trilha de auditoria (quem consultou, o quê, de onde: o IP vem da requisição). Desligada,
 * responde 404 e não grava nada. Com o token errado, responde 401 e audita a recusa. Nunca
 * devolve cache compartilhado.
 */
export async function responderRenata(
  request: Request,
  recurso: string,
  montar: () => Promise<Record<string, unknown>>,
): Promise<Response> {
  const autorizacao = autorizarRenata(request);
  if (!autorizacao.ok) {
    if (autorizacao.status === 401) {
      await registrarAuditoria({ ator: "renata", acao: "renata.recusada", alvo: recurso });
    }
    return NextResponse.json(
      { erro: autorizacao.status === 404 ? "Não encontrado." : "Não autorizado." },
      { status: autorizacao.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const dados = await montar();
  await registrarAuditoria({ ator: "renata", acao: "renata.consulta", alvo: recurso });
  return NextResponse.json(
    { geradoEm: new Date().toISOString(), ...dados },
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
