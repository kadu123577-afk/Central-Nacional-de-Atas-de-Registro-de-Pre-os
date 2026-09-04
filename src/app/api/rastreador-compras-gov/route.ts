import { NextRequest, NextResponse } from "next/server";
import { executarRastreamentoComprasGov } from "@/lib/rastreador-compras-gov";

export const maxDuration = 60;

/**
 * Chamado pelo cron da Vercel (ver vercel.json) — mesma proteção por
 * CRON_SECRET do rastreador do PNCP (src/app/api/rastreador-pncp/route.ts).
 * Fonte adicional, rodando em paralelo com o PNCP, não em substituição a
 * ele (decisão de 2026-09-04).
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

  const resultado = await executarRastreamentoComprasGov({
    dataVigenciaInicialMin: tresDiasAtras,
    dataVigenciaInicialMax: agora,
  });

  return NextResponse.json(resultado, { status: resultado.erro ? 502 : 200 });
}
