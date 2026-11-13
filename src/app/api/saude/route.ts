import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Verificação de saúde para o balanceador, o orquestrador ou o monitoramento (14/11/2026):
 * 200 se o sistema responde e o banco atende; 503 se o banco não responde. Pública de propósito
 * e sem detalhe nenhum: não devolve versão, endereço do banco nem mensagem de erro.
 */
export async function GET() {
  const semCache = { "Cache-Control": "no-store" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { headers: semCache });
  } catch {
    return NextResponse.json({ status: "indisponivel" }, { status: 503, headers: semCache });
  }
}
