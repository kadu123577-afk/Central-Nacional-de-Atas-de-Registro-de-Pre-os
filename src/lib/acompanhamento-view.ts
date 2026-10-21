/**
 * Apresentação do acompanhamento de contratos públicos (Projeto RNA, etapa 2,
 * 2026-10-21) — funções puras, sem banco nem rede, usadas pela página
 * /admin/contratos-detectados. As regras de negócio (níveis, status, cobrança)
 * ficam em src/lib/acompanhamento.ts; aqui só rótulos, tons de cor, datas e
 * valores no jeito que o gestor lê.
 */
import { NIVEIS_VINCULO, ROTULO_NIVEL_VINCULO, type NivelVinculo } from "./acompanhamento";

/** Subconjunto do Tom do Badge que os níveis usam (atribuível a ele). */
export type TomNivel = "marca" | "neutro" | "atencao";

export function nivelConhecido(valor: string): valor is NivelVinculo {
  return (NIVEIS_VINCULO as readonly string[]).includes(valor);
}

export function rotuloDoNivel(nivel: string): string {
  return nivelConhecido(nivel) ? ROTULO_NIVEL_VINCULO[nivel] : nivel;
}

/** Certo = verde da marca; forte = neutro; desvio = atenção (é o que o gestor precisa olhar primeiro). */
export function tomDoNivel(nivel: string): TomNivel {
  if (nivel === "certo") return "marca";
  if (nivel === "desvio") return "atencao";
  return "neutro";
}

/** Uma frase sob o título de cada grupo da lista "A confirmar". */
export const EXPLICACAO_NIVEL: Record<NivelVinculo, string> = {
  certo: "O contrato publicado no PNCP cita uma ata da rede. Confirme para passar a acompanhar os aditivos.",
  forte:
    "Contrato do fornecedor parceiro com um município que está em negociação dessa ata, assinado depois que a negociação abriu.",
  desvio:
    "Contrato do fornecedor parceiro com município-alvo, vindo de adesão ou de ata, sem nenhuma negociação no funil. Vale conferir antes de decidir.",
};

const ROTULO_STATUS_VINCULO: Record<string, string> = {
  sugerido: "A confirmar",
  confirmado: "Confirmado",
  descartado: "Descartado",
};

export function rotuloStatusVinculo(status: string): string {
  return ROTULO_STATUS_VINCULO[status] ?? status;
}

export function tomDoStatusVinculo(status: string): "marca" | "neutro" | "atencao" {
  if (status === "confirmado") return "marca";
  if (status === "sugerido") return "atencao";
  return "neutro";
}

/**
 * Reparte um limite de linhas entre grupos que têm prioridade (o primeiro
 * grupo é servido antes). Devolve quantas linhas buscar de cada um, sem
 * passar do total do grupo nem do limite geral.
 */
export function distribuirLimite(totais: number[], limite: number): number[] {
  // Número inválido (NaN, Infinity) vale zero: nunca vira `take: NaN` na consulta.
  const inteiro = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
  let restante = inteiro(limite);
  return totais.map((total) => {
    const pegar = Math.min(inteiro(total), restante);
    restante -= pegar;
    return pegar;
  });
}

/** "1 contrato" / "2 contratos": o número já vem escrito no texto devolvido. */
export function contagem(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

const ROTULO_TIPO_TERMO: Record<string, string> = {
  aditivo_valor: "Aditivo de valor",
  aditivo_prazo: "Aditivo de prazo",
};

export function rotuloTipoTermo(tipo: string): string {
  const conhecido = ROTULO_TIPO_TERMO[tipo];
  if (conhecido) return conhecido;
  const texto = tipo.replace(/[_-]+/g, " ").trim();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : "Termo";
}

/**
 * Nome do fornecedor para a tela. O banco já guarda "pessoa física" no lugar
 * do nome de pessoa física, mas o MEI carrega o CPF na razão social
 * ("FULANO 12345678901"): por garantia, qualquer sequência com cara de CPF é
 * retirada antes de mostrar.
 */
export function nomeFornecedorParaTela(nome: string | null | undefined): string | null {
  const limpo = (nome ?? "")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return limpo || null;
}

/** 14 dígitos → 00.000.000/0000-00. Qualquer outra coisa (CPF de MEI, vazio) não é mostrada. */
export function formatarCnpj(valor: string | null | undefined): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (digitos.length !== 14) return null;
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

/** Decimal do Prisma (ou string/number) → número; nulo ou inválido → null. */
export function paraNumero(valor: { toString(): string } | number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const texto = valor.toString().trim();
  // Number("") é 0: texto vazio não pode virar "R$ 0,00".
  if (!texto) return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

export function moedaReais(valor: number | null): string {
  if (valor === null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Data só-dia (guardada à meia-noite UTC) → dd/mm/aaaa, sem deslocar o dia pelo fuso. */
export function dataSoDia(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Momento real (decisão do gestor) → dd/mm/aaaa HH:mm no horário de Brasília. */
export function dataHoraBrasilia(d: Date | null | undefined): string {
  if (!d) return "—";
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("day")}/${p("month")}/${p("year")} ${p("hour")}:${p("minute")}`;
}

export function textoVigencia(inicio: Date | null | undefined, fim: Date | null | undefined): string {
  if (inicio && fim) return `${dataSoDia(inicio)} a ${dataSoDia(fim)}`;
  if (fim) return `até ${dataSoDia(fim)}`;
  if (inicio) return `desde ${dataSoDia(inicio)}`;
  return "Vigência não informada";
}
