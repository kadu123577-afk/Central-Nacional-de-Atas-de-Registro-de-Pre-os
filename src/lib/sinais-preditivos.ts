/**
 * Sinais preditivos gerados por script a partir dos dados públicos já
 * coletados (scripts/coleta) — 2026-10-12, Projeto RNA §9 "Inteligência
 * preditiva de demandas": identificar com antecedência quem vai precisar
 * comprar, sem gastar pesquisa manual.
 *
 * Três fontes, todas públicas:
 *  - contratos do PNCP com vigência terminando em breve (a necessidade
 *    volta quando o contrato acaba);
 *  - itens do Plano de Contratações Anual (PCA) com data desejada próxima;
 *  - crescimento da despesa empenhada por função no SICONFI (DCA I-E).
 *
 * Tudo aqui é puro (sem banco nem rede) para poder ser testado; o script
 * scripts/inteligencia/gerar-sinais-preditivos.ts faz a leitura e a gravação.
 */
import { classificarObjeto } from "./classificador-objeto";
import type { TipoSinal } from "./sinais";

export interface SinalCandidato {
  chaveExterna: string;
  tipo: TipoSinal;
  titulo: string;
  detalhe: string;
  fonte: string;
  fonteUrl: string | null;
  categoria: string | null;
  valorEstimado: number | null;
  expiraEm: Date;
  /** Usada só para escolher os N mais relevantes por município. */
  relevancia: number;
}

const DIA = 86_400_000;
/** Contrato municipal acima disso é erro de digitação no PNCP (já vimos valores na casa do trilhão). */
const VALOR_MAXIMO_PLAUSIVEL = 5_000_000_000;

const fmtData = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
const fmtMesAno = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC", month: "2-digit", year: "numeric" });
const fmtValor = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Texto todo em maiúsculas (comum no PNCP) vira frase normal; o resto fica como está. */
export function frase(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (!t || /[a-zà-ú]/.test(t)) return t;
  const minusculo = t.toLowerCase();
  return minusculo.charAt(0).toUpperCase() + minusculo.slice(1);
}

export function resumir(texto: string, max: number): string {
  const t = frase(texto);
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function dataIso(texto: string | null | undefined): Date | null {
  if (!texto) return null;
  const d = new Date(texto.length === 10 ? `${texto}T00:00:00Z` : texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "14147490000168-2-000216/2026" → página pública do contrato no PNCP. */
export function urlContratoPncp(numeroControle: string): string | null {
  const m = /^(\d{14})-\d-0*(\d+)\/(\d{4})$/.exec(numeroControle);
  return m ? `https://pncp.gov.br/app/contratos/${m[1]}/${m[3]}/${m[2]}` : null;
}

// ------------------------------------------------------------- contratos

export interface ContratoPncp {
  numeroControlePNCP: string;
  objetoContrato?: string | null;
  valorGlobal?: number | null;
  dataVigenciaFim?: string | null;
  dataAtualizacao?: string | null;
  tipoContrato?: { nome?: string | null } | null;
  categoriaProcesso?: { nome?: string | null } | null;
  nomeRazaoSocialFornecedor?: string | null;
  tipoPessoa?: string | null;
  orgaoEntidade?: { razaoSocial?: string | null } | null;
}

/**
 * Nome do fornecedor sem dado pessoal: pessoa física não é identificada e o
 * CPF que o MEI carrega na razão social ("FULANO 12345678901") é retirado.
 */
export function nomeFornecedorPublico(nome: string | null | undefined, tipoPessoa?: string | null): string | null {
  if (tipoPessoa === "PF") return "pessoa física";
  const limpo = (nome ?? "")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return limpo ? frase(limpo) : null;
}

const CATEGORIAS_PROCESSO_IGNORADAS = new Set(["Locação Imóveis", "Cessão", "Alienação de bens móveis/imóveis"]);

export interface OpcoesContrato {
  /** Janela, em dias a partir de hoje, para o fim da vigência. */
  dias: number;
  valorMinimo: number;
}

export const OPCOES_CONTRATO_PADRAO: OpcoesContrato = { dias: 150, valorMinimo: 10_000 };

export function sinalDeContratoVencendo(
  c: ContratoPncp,
  hoje: Date,
  opcoes: OpcoesContrato = OPCOES_CONTRATO_PADRAO,
): SinalCandidato | null {
  const fim = dataIso(c.dataVigenciaFim);
  if (!fim || !c.objetoContrato?.trim()) return null;
  // Empenho não é contrato de fornecimento continuado: não indica nova compra.
  if (c.tipoContrato?.nome === "Empenho") return null;
  if (c.categoriaProcesso?.nome && CATEGORIAS_PROCESSO_IGNORADAS.has(c.categoriaProcesso.nome)) return null;
  const valor = c.valorGlobal ?? 0;
  if (valor < opcoes.valorMinimo || valor > VALOR_MAXIMO_PLAUSIVEL) return null;
  const dias = Math.round((fim.getTime() - hoje.getTime()) / DIA);
  if (dias < 0 || dias > opcoes.dias) return null;

  const fornecedor = nomeFornecedorPublico(c.nomeRazaoSocialFornecedor, c.tipoPessoa);
  const orgao = c.orgaoEntidade?.razaoSocial?.trim();
  return {
    chaveExterna: `pncp-contrato:${c.numeroControlePNCP}`,
    tipo: "contrato_vencendo",
    titulo: `Contrato vence em ${fmtData(fim)}: ${resumir(c.objetoContrato, 90)}`,
    detalhe: [
      fornecedor ? `Fornecedor atual: ${fornecedor}` : null,
      `valor ${fmtValor(valor)}`,
      orgao ? frase(orgao) : null,
      `contrato ${c.numeroControlePNCP}`,
    ]
      .filter(Boolean)
      .join(" · "),
    fonte: "PNCP (contratos)",
    fonteUrl: urlContratoPncp(c.numeroControlePNCP),
    categoria: classificarObjeto(c.objetoContrato),
    valorEstimado: valor,
    expiraEm: new Date(fim.getTime() + 15 * DIA),
    relevancia: valor,
  };
}

// ------------------------------------------------------------------- PCA

export interface ItemPca {
  grupoContratacaoCodigo?: string | null;
  grupoContratacaoNome?: string | null;
  classificacaoSuperiorNome?: string | null;
  descricaoItem?: string | null;
  dataDesejada?: string | null;
  valorTotal?: number | null;
  unidadeRequisitante?: string | null;
}

export interface PcaPncp {
  idPcaPncp?: string | null;
  orgaoEntidadeCnpj?: string | null;
  anoPca?: number | null;
  itens?: ItemPca[] | null;
}

export interface OpcoesPca {
  diasAntes: number;
  diasDepois: number;
  valorMinimo: number;
}

export const OPCOES_PCA_PADRAO: OpcoesPca = { diasAntes: 30, diasDepois: 180, valorMinimo: 20_000 };

const normalizarChave = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/** Agrupa os itens do PCA por grupo de contratação e devolve um sinal por grupo com data desejada próxima. */
export function sinaisDePca(pca: PcaPncp, hoje: Date, opcoes: OpcoesPca = OPCOES_PCA_PADRAO): SinalCandidato[] {
  if (!pca.idPcaPncp || !pca.itens?.length) return [];
  const inicio = hoje.getTime() - opcoes.diasAntes * DIA;
  const fim = hoje.getTime() + opcoes.diasDepois * DIA;

  const grupos = new Map<string, { nome: string; data: Date; total: number; itens: string[]; unidade: string | null }>();
  for (const item of pca.itens) {
    const data = dataIso(item.dataDesejada);
    if (!data || data.getTime() < inicio || data.getTime() > fim) continue;
    const nomeItem = (item.descricaoItem || item.classificacaoSuperiorNome || "").trim();
    const nomeGrupo = (item.grupoContratacaoNome || nomeItem).trim();
    if (!nomeGrupo) continue;
    const chave = item.grupoContratacaoCodigo?.trim() || normalizarChave(nomeGrupo);
    const g = grupos.get(chave) ?? { nome: nomeGrupo, data, total: 0, itens: [], unidade: item.unidadeRequisitante?.trim() || null };
    if (data < g.data) g.data = data;
    g.total += Math.max(item.valorTotal ?? 0, 0);
    if (nomeItem && g.itens.length < 50) g.itens.push(nomeItem);
    grupos.set(chave, g);
  }

  const sinais: SinalCandidato[] = [];
  for (const [chave, g] of grupos) {
    if (g.total < opcoes.valorMinimo || g.total > VALOR_MAXIMO_PLAUSIVEL) continue;
    const exemplos = [...new Set(g.itens.map((i) => resumir(i, 40)))].slice(0, 3);
    sinais.push({
      chaveExterna: `pncp-pca:${pca.idPcaPncp}:${chave}`,
      tipo: "pca",
      titulo: `Compra prevista no PCA ${pca.anoPca ?? ""} para ${fmtMesAno(g.data)}: ${resumir(g.nome, 80)}`.replace("PCA  ", "PCA "),
      detalhe: [
        `${g.itens.length} ${g.itens.length === 1 ? "item" : "itens"}`,
        fmtValor(g.total),
        g.unidade ? frase(g.unidade) : null,
        exemplos.length ? `ex.: ${exemplos.join("; ")}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      fonte: "PNCP (Plano de Contratações Anual)",
      fonteUrl:
        pca.orgaoEntidadeCnpj && pca.anoPca ? `https://pncp.gov.br/app/pca/${pca.orgaoEntidadeCnpj}/${pca.anoPca}` : null,
      categoria: classificarObjeto(`${g.nome} ${g.itens.join(" ")}`),
      valorEstimado: g.total,
      expiraEm: new Date(g.data.getTime() + 60 * DIA),
      relevancia: g.total,
    });
  }
  return sinais;
}

// --------------------------------------------------------------- SICONFI

export interface LinhaDca {
  exercicio: number;
  coluna: string;
  conta: string;
  valor: number;
}

/** Funções que não viram compra de bens/serviços que a rede oferece. */
const FUNCOES_IGNORADAS = new Set(["01", "02", "03", "09", "28", "99"]);

export interface OpcoesOrcamento {
  crescimentoMinimo: number;
  valorMinimo: number;
  maximo: number;
}

export const OPCOES_ORCAMENTO_PADRAO: OpcoesOrcamento = { crescimentoMinimo: 0.15, valorMinimo: 1_000_000, maximo: 2 };

/**
 * Funções cuja despesa empenhada mais cresceu entre os dois últimos
 * exercícios publicados. Contexto de orçamento, sem categoria: vale para
 * qualquer ata (e por isso tem o menor peso entre os automáticos).
 */
export function sinaisDeOrcamento(
  ibge: string,
  linhas: LinhaDca[],
  opcoes: OpcoesOrcamento = OPCOES_ORCAMENTO_PADRAO,
): SinalCandidato[] {
  const porAno = new Map<number, Map<string, number>>();
  for (const l of linhas) {
    if (l.coluna !== "Despesas Empenhadas") continue;
    const m = /^(\d{2}) - (.+)$/.exec(l.conta?.trim() ?? "");
    if (!m || FUNCOES_IGNORADAS.has(m[1])) continue;
    const mapa = porAno.get(l.exercicio) ?? new Map<string, number>();
    mapa.set(`${m[1]}|${m[2]}`, (mapa.get(`${m[1]}|${m[2]}`) ?? 0) + l.valor);
    porAno.set(l.exercicio, mapa);
  }
  const anos = [...porAno.keys()].sort((a, b) => b - a);
  if (anos.length < 2 || anos[0] - anos[1] !== 1) return [];
  const [ano, anterior] = [anos[0], anos[1]];
  const atual = porAno.get(ano)!;
  const antes = porAno.get(anterior)!;

  const candidatos: SinalCandidato[] = [];
  for (const [chave, valor] of atual) {
    const base = antes.get(chave);
    if (!base || base <= 0 || valor < opcoes.valorMinimo) continue;
    const crescimento = valor / base - 1;
    if (crescimento < opcoes.crescimentoMinimo) continue;
    const [codigo, nome] = chave.split("|");
    candidatos.push({
      chaveExterna: `siconfi-dca:${ibge}:${ano}:${codigo}`,
      tipo: "orcamento",
      titulo: `Orçamento ${ano}: despesa com ${nome} cresceu ${Math.round(crescimento * 100)}% (${fmtValor(valor)})`,
      detalhe: `Empenhado em ${anterior}: ${fmtValor(base)} → ${ano}: ${fmtValor(valor)} (SICONFI, DCA Anexo I-E)`,
      fonte: "SICONFI (Tesouro Nacional)",
      fonteUrl: "https://siconfi.tesouro.gov.br/siconfi/pages/public/consulta_finbra/finbra_list.jsf",
      categoria: null,
      valorEstimado: valor - base,
      expiraEm: new Date(Date.UTC(ano + 1, 11, 31)),
      relevancia: crescimento,
    });
  }
  return candidatos.sort((a, b) => b.relevancia - a.relevancia).slice(0, opcoes.maximo);
}

/** Os N mais relevantes, sem repetir chave. */
export function maisRelevantes(sinais: SinalCandidato[], n: number): SinalCandidato[] {
  const vistos = new Set<string>();
  return [...sinais]
    .sort((a, b) => b.relevancia - a.relevancia)
    .filter((s) => (vistos.has(s.chaveExterna) ? false : (vistos.add(s.chaveExterna), true)))
    .slice(0, n);
}
