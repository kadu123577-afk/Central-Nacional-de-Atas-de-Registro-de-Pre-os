/**
 * Apresentação do Radar de atas e do Funil de prospecção de fornecedores
 * (Projeto RNA, etapa 5, 2026-10-22) — funções puras, sem banco nem rede,
 * usadas pelas páginas /admin/radar-atas e /admin/prospeccao-fornecedores e
 * pelo painel do admin. As regras de negócio (estágios, pontuação, CNPJ)
 * ficam em src/lib/radar-atas.ts; aqui só link do PNCP, CNPJ para a tela,
 * filtros da URL, paginação, datas e prazos no jeito que o gestor lê.
 *
 * Sigilo: só empresa (CNPJ). Nada aqui mostra CPF nem dado de pessoa.
 */
import type { Tom } from "@/components/ui/badge";
import { formatarCnpj, nomeFornecedorParaTela } from "./acompanhamento-view";
import { DIAS_MINIMOS_ADESAO, diasRestantesAte, normalizarCnpj } from "./radar-atas";

/** Atas por página do radar. */
export const ITENS_POR_PAGINA = 100;
/** Cartões por coluna do funil; passando disso a coluna avisa. */
export const LIMITE_CARTOES_POR_COLUNA = 100;
/** Limite de caracteres das observações de um fornecedor no funil. */
export const LIMITE_OBSERVACOES = 500;
/** Valor do filtro de categoria que pede as atas ainda sem categoria. */
export const SEM_CATEGORIA = "sem-categoria";

// ───────────────────────────── Link do PNCP ─────────────────────────────

/**
 * Número de controle da ata no PNCP ("03532661000156-1-000075/2024-000001":
 * CNPJ do órgão, 1, sequencial da compra, ano da compra, sequencial da ata) →
 * página pública da ata. O endereço do PNCP leva os dois sequenciais, sem os
 * zeros à esquerda: /app/atas/<cnpj>/<ano>/<compra>/<ata>. Número fora do
 * formato devolve null.
 */
export function urlAtaPncp(numeroControle: string | null | undefined): string | null {
  const partes = partesDoNumeroDaAta(numeroControle);
  if (!partes) return null;
  return `https://pncp.gov.br/app/atas/${partes.cnpj}/${partes.ano}/${partes.compra}/${partes.ata}`;
}

function partesDoNumeroDaAta(
  numeroControle: string | null | undefined,
): { cnpj: string; compra: number; ano: string; ata: number } | null {
  if (typeof numeroControle !== "string") return null;
  const m = /^(\d{14})-\d-(\d{1,10})\/(\d{4})-(\d{1,10})$/.exec(numeroControle.trim());
  if (!m) return null;
  const compra = Number(m[2]);
  const ata = Number(m[4]);
  if (compra < 1 || ata < 1) return null;
  return { cnpj: m[1], compra, ano: m[3], ata };
}

/**
 * Texto curto para identificar a ata na tabela ("Compra 75/2024 · ata 1").
 * O número da ata e o ano em que ela foi assinada não ficam no radar; o
 * número de controle do PNCP traz a compra de origem e a posição da ata nela.
 * Fora do formato, devolve o texto como veio.
 */
export function rotuloAtaPncp(numeroControle: string | null | undefined): string {
  const partes = partesDoNumeroDaAta(numeroControle);
  if (!partes) return typeof numeroControle === "string" ? numeroControle : "";
  return `Compra ${partes.compra}/${partes.ano} · ata ${partes.ata}`;
}

// ────────────────────────────── Fornecedor ──────────────────────────────

/** CNPJ de 14 dígitos → 00.000.000/0000-00; qualquer outra coisa (CPF, vazio, letras) não é mostrada. */
export function cnpjParaTela(valor: string | null | undefined): string | null {
  const cnpj = normalizarCnpj(valor);
  return cnpj ? formatarCnpj(cnpj) : null;
}

/**
 * Fornecedor como a tela mostra: o nome já sem CPF de MEI e o CNPJ formatado
 * só quando é empresa. Pessoa física ("pessoa física" no lugar do nome) nunca
 * mostra documento.
 */
export function fornecedorParaTela(
  nome: string | null | undefined,
  cnpj: string | null | undefined,
): { nome: string | null; cnpj: string | null } {
  const limpo = nomeFornecedorParaTela(nome);
  const pessoaFisica = limpo?.toLowerCase() === "pessoa física";
  return { nome: limpo, cnpj: pessoaFisica ? null : cnpjParaTela(cnpj) };
}

// ───────────────────────────── Filtros do radar ─────────────────────────────

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export function ufValida(valor: unknown): valor is string {
  return typeof valor === "string" && (UFS as readonly string[]).includes(valor);
}

export interface FiltrosRadar {
  /** Slug da categoria, ou SEM_CATEGORIA; null = todas. */
  categoria: string | null;
  uf: string | null;
  /** CNPJ (só dígitos) do fornecedor; null = todos. */
  fornecedor: string | null;
  /** Página pedida, a partir de 1. */
  pagina: number;
}

type ParametroBruto = string | string[] | undefined;

function primeiroValor(v: ParametroBruto): string {
  const texto = Array.isArray(v) ? v[0] : v;
  return typeof texto === "string" ? texto.trim() : "";
}

/**
 * Lê os filtros dos searchParams da página (GET, sem JavaScript). Tudo vem do
 * navegador: o que não tem a forma esperada vira "sem filtro" (nunca erro).
 */
export function lerFiltrosRadar(params: Record<string, ParametroBruto>): FiltrosRadar {
  const categoriaBruta = primeiroValor(params.categoria);
  const categoria = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(categoriaBruta) && categoriaBruta.length <= 60 ? categoriaBruta : null;

  const ufBruta = primeiroValor(params.uf).toUpperCase();
  const uf = ufValida(ufBruta) ? ufBruta : null;

  const fornecedor = normalizarCnpj(primeiroValor(params.fornecedor));

  const paginaBruta = primeiroValor(params.pagina);
  const pagina = /^\d{1,5}$/.test(paginaBruta) ? Math.max(1, Number(paginaBruta)) : 1;

  return { categoria, uf, fornecedor, pagina };
}

/** Endereço do radar com os filtros (e a página, quando passa da primeira). */
export function hrefRadar(filtros: Partial<Omit<FiltrosRadar, "pagina">>, pagina = 1): string {
  const query = new URLSearchParams();
  if (filtros.categoria) query.set("categoria", filtros.categoria);
  if (filtros.uf) query.set("uf", filtros.uf);
  if (filtros.fornecedor) query.set("fornecedor", filtros.fornecedor);
  if (pagina > 1) query.set("pagina", String(Math.floor(pagina)));
  const texto = query.toString();
  return texto ? `/admin/radar-atas?${texto}` : "/admin/radar-atas";
}

export interface Paginacao {
  pagina: number;
  totalPaginas: number;
  /** Quantas linhas pular na consulta. */
  pular: number;
  /** Primeira e última linha da página (a partir de 1); 0 e 0 quando não há linhas. */
  de: number;
  ate: number;
}

/** Página pedida dentro dos limites: passar da última cai na última. */
export function calcularPaginacao(total: number, paginaPedida: number, porPagina = ITENS_POR_PAGINA): Paginacao {
  const linhas = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const tamanho = Number.isFinite(porPagina) && porPagina >= 1 ? Math.floor(porPagina) : ITENS_POR_PAGINA;
  const totalPaginas = Math.max(1, Math.ceil(linhas / tamanho));
  const pedida = Number.isFinite(paginaPedida) ? Math.floor(paginaPedida) : 1;
  const pagina = Math.min(Math.max(1, pedida), totalPaginas);
  const pular = (pagina - 1) * tamanho;
  return {
    pagina,
    totalPaginas,
    pular,
    de: linhas === 0 ? 0 : pular + 1,
    ate: Math.min(linhas, pular + tamanho),
  };
}

// ──────────────────────────────── Prazos ────────────────────────────────

/** "vencida", "vence hoje", "1 dia", "120 dias". */
export function textoDiasRestantes(dias: number): string {
  if (!Number.isFinite(dias)) return "—";
  if (dias < 0) return "vencida";
  if (dias === 0) return "vence hoje";
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

/**
 * Tom do prazo: vencida = crítico; abaixo do mínimo para oferecer (45 dias) =
 * alerta; até 90 dias = atenção; folgado = neutro.
 */
export function tomDiasRestantes(dias: number): Tom {
  if (!Number.isFinite(dias) || dias < 0) return "critico";
  if (dias < DIAS_MINIMOS_ADESAO) return "alerta";
  if (dias < 90) return "atencao";
  return "neutro";
}

const BRASILIA_MS = 3 * 3_600_000;

/** Momento real (quando o script rodou) → dd/mm/aaaa no dia de Brasília; sem data, "—". */
export function diaBrasilia(momento: Date | null | undefined): string {
  if (!(momento instanceof Date) || Number.isNaN(momento.getTime())) return "—";
  return momento.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/**
 * O dia de hoje em Brasília (UTC-3, sem horário de verão), como meia-noite
 * UTC — a mesma convenção das datas só-dia guardadas no banco.
 */
export function hojeBrasilia(agora: Date): Date {
  const local = new Date(agora.getTime() - BRASILIA_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/**
 * Dias que faltam para o fim da vigência, contados do dia de hoje em Brasília
 * (0 = vence hoje; negativo = já terminou). Contar pelo dia de UTC fecharia a
 * ata três horas antes da hora: às 22h em Brasília já é o dia seguinte em UTC.
 * Data de fim inválida devolve NaN (as funções de texto e tom tratam como "—").
 */
export function diasRestantesBrasilia(vigenciaFim: Date | null | undefined, agora: Date): number {
  return diasRestantesAte(vigenciaFim, hojeBrasilia(agora)) ?? Number.NaN;
}

/**
 * Próximo contato vencido: a data (só-dia) é anterior a hoje. Contato marcado
 * para hoje ainda não está vencido; sem data, nunca.
 */
export function contatoVencido(proximoContato: Date | null | undefined, agora: Date): boolean {
  if (!(proximoContato instanceof Date) || Number.isNaN(proximoContato.getTime())) return false;
  return proximoContato.getTime() < hojeBrasilia(agora).getTime();
}

/** Quem está em conversa com a rede: já foi procurado e ainda não decidiu. */
export const ESTAGIOS_EM_CONTATO = ["contatado", "interessado"] as const;

/**
 * Cartão do funil com "Vencido" em destaque: a mesma regra da faixa de números
 * e da fila do painel (filtroContatoVencido) — contato vencido só importa para
 * quem está em conversa (contatado ou interessado). Em outro estágio a data
 * aparece normal, para o destaque bater com a contagem.
 */
export function cartaoComContatoVencido(
  estagio: string,
  proximoContato: Date | null | undefined,
  agora: Date,
): boolean {
  return (ESTAGIOS_EM_CONTATO as readonly string[]).includes(estagio) && contatoVencido(proximoContato, agora);
}

/**
 * Filtro do banco para "contato vencido" (mesma regra de contatoVencido,
 * usada na página do funil e na fila do painel do admin): fornecedor
 * contatado ou interessado, com próximo contato em data anterior a hoje.
 */
export function filtroContatoVencido(agora: Date): { estagio: { in: string[] }; proximoContatoEm: { lt: Date } } {
  return {
    estagio: { in: [...ESTAGIOS_EM_CONTATO] },
    proximoContatoEm: { lt: hojeBrasilia(agora) },
  };
}

// ─────────────────────── Campos do formulário do funil ───────────────────────

export type DataLida = { ok: true; data: Date | null } | { ok: false };

/**
 * Lê o campo de data (AAAA-MM-DD, o que o <input type="date"> envia).
 * Vazio = sem data (ok, null). Data que não existe (31/02, mês 13) ou fora de
 * 2000–2100 é recusada. A data é guardada à meia-noite UTC.
 */
export function lerDataSoDia(texto: string): DataLida {
  const t = texto.trim();
  if (!t) return { ok: true, data: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return { ok: false };
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (ano < 2000 || ano > 2100) return { ok: false };
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const real = data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  return real ? { ok: true, data } : { ok: false };
}

/** Data guardada → valor do <input type="date"> (AAAA-MM-DD); vazio sem data. */
export function dataParaCampo(data: Date | null | undefined): string {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) return "";
  return data.toISOString().slice(0, 10);
}

/**
 * Texto livre das observações: quebra de linha única (\n), sem caracteres de
 * controle (inclusive os de direção de texto, que embaralhariam a leitura na
 * tela), sem linhas em branco em sequência e sem espaço nas pontas. O limite
 * (LIMITE_OBSERVACOES) é conferido por quem chama, depois disto.
 */
export function normalizarObservacao(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[ ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ───────────────────────────── Listas do cartão ─────────────────────────────

/** Texto cortado em `max` caracteres, com reticências; não mexe em maiúsculas (ao contrário de resumir). */
export function cortarTexto(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, Math.max(1, max - 1)).trimEnd()}…` : texto;
}

/** "a, b,, a" → ["a", "b"]: sem vazios e sem repetição, na ordem em que aparecem. */
export function listaDeCsv(valor: string | null | undefined): string[] {
  if (typeof valor !== "string") return [];
  const vistos = new Set<string>();
  for (const parte of valor.split(",")) {
    const item = parte.trim();
    if (item) vistos.add(item);
  }
  return [...vistos];
}

/** Os `max` primeiros e quantos ficaram de fora ("+2"). */
export function limitarLista<T>(lista: T[], max: number): { mostrar: T[]; resto: number } {
  const teto = Number.isFinite(max) && max >= 0 ? Math.floor(max) : lista.length;
  return { mostrar: lista.slice(0, teto), resto: Math.max(0, lista.length - teto) };
}
