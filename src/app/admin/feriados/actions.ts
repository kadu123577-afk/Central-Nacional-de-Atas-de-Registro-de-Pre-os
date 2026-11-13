"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { feriadosNacionais } from "@/lib/dias-uteis";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";

/**
 * Feriados extras da equipe (2026-11-14, passo 4 do plano do workflow): feriado estadual ou
 * municipal e ponto facultativo, que somam aos nacionais na contagem de dias úteis. Exige
 * "usuarios.gerir" (a gestão). Mudar o calendário só vale para prazos novos: o prazo já gravado
 * numa oportunidade não é recalculado.
 */
export interface EstadoFeriado {
  erro?: string;
  ok?: boolean;
}

const ANO_MINIMO = 2024;
const ANO_MAXIMO = 2100;

/** "AAAA-MM-DD" que existe de verdade no calendário (recusa 2026-02-30). */
function dataValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

export async function adicionarFeriado(_estadoAnterior: EstadoFeriado, formData: FormData): Promise<EstadoFeriado> {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "usuarios.gerir", "admin.adicionarFeriado");

  const data = String(formData.get("data") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim().replace(/\s+/g, " ");

  if (!dataValida(data)) return { erro: "Informe uma data válida." };
  const ano = Number(data.slice(0, 4));
  if (ano < ANO_MINIMO || ano > ANO_MAXIMO) return { erro: `Use uma data entre ${ANO_MINIMO} e ${ANO_MAXIMO}.` };
  if (nome.length < 3 || nome.length > 80) return { erro: "Dê um nome ao feriado, de 3 a 80 letras." };
  if (feriadosNacionais(ano).some((f) => f.data === data)) {
    return { erro: "Esta data já está no calendário automático (feriado nacional, Carnaval ou Corpus Christi) e entra na conta sozinha." };
  }

  const existente = await prisma.feriado.findUnique({ where: { data: new Date(`${data}T00:00:00Z`) }, select: { id: true } });
  if (existente) return { erro: "Esta data já está no calendário." };

  await prisma.feriado.create({ data: { data: new Date(`${data}T00:00:00Z`), nome, criadoPor: `admin:${adminId}` } });
  await registrarAuditoria({ ator: `admin:${adminId}`, acao: "admin.adicionarFeriado", alvo: data, detalhe: nome });
  revalidatePath("/admin/feriados");
  return { ok: true };
}

export async function removerFeriado(id: string): Promise<void> {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "usuarios.gerir", "admin.removerFeriado");

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return;
  const feriado = await prisma.feriado.findUnique({ where: { id }, select: { data: true, nome: true } });
  if (!feriado) return;

  await prisma.feriado.delete({ where: { id } });
  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: "admin.removerFeriado",
    alvo: feriado.data.toISOString().slice(0, 10),
    detalhe: feriado.nome,
  });
  revalidatePath("/admin/feriados");
}
