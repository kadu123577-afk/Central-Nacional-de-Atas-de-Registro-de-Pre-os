import { NextRequest, NextResponse } from "next/server";
import { executarRastreamentoPncp } from "@/lib/rastreador-pncp";

export const maxDuration = 60;

/**
 * Chamado pelo cron da Vercel (ver vercel.json) — a Vercel envia o header
 * Authorization: Bearer $CRON_SECRET automaticamente nas execuções
 * agendadas, então basta configurar a env var CRON_SECRET no projeto.
 */
export async function GET(request: NextRequest) {
  const segredoConfigurado = process.env.CRON_SECRET;
  if (segredoConfigurado) {
    const autorizacao = request.headers.get("authorization");
    if (autorizacao !== `Bearer ${segredoConfigurado}`) {
      return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
    }
  }

  const agora = new Date();
  const tresDiasAtras = new Date(agora);
  tresDiasAtras.setDate(agora.getDate() - 3);

  const resultado = await executarRastreamentoPncp({
    dataInicial: tresDiasAtras,
    dataFinal: agora,
  });

  return NextResponse.json(resultado, { status: resultado.erro ? 502 : 200 });
}
