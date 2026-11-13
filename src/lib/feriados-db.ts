import { prisma } from "@/lib/prisma";
import type { Feriados } from "@/lib/dias-uteis";

/**
 * Feriados extras cadastrados pela equipe (feriado estadual ou municipal, ponto facultativo),
 * como o conjunto de datas "AAAA-MM-DD" que src/lib/dias-uteis.ts espera. Os nacionais não vêm
 * daqui: são calculados no código.
 */
export async function carregarFeriadosExtras(): Promise<Feriados> {
  const linhas = await prisma.feriado.findMany({ select: { data: true } });
  return new Set(linhas.map((l) => l.data.toISOString().slice(0, 10)));
}
