/**
 * Ampliar a base de municípios (15/11/2026): o robô do raio-X começou com 1.073 municípios de 11
 * estados e hoje tem 1.250. O pedido de Carlos é seguir por ondas até o Brasil todo (5.570
 * municípios). Este módulo tem as regras puras do passo "ampliar a lista": ler a resposta do IBGE,
 * separar o que já está na base e montar o cadastro do que falta. A consulta ao IBGE e a gravação ficam
 * em prisma/ampliar-municipios.ts. O passo seguinte de cada onda é o CNPJ (enriquecer-cnpj-municipios.ts)
 * e o raio-X (levantar-raio-x-consumo-lote.ts); ver ROBO-DO-RAIO-X.md.
 */

export interface EstadoIbge {
  sigla: string;
  /** Código do estado no IBGE (os dois primeiros dígitos do código de cada município). */
  codigo: number;
}

/** Os 27 estados, com o código do IBGE. */
export const ESTADOS: readonly EstadoIbge[] = [
  { sigla: "RO", codigo: 11 },
  { sigla: "AC", codigo: 12 },
  { sigla: "AM", codigo: 13 },
  { sigla: "RR", codigo: 14 },
  { sigla: "PA", codigo: 15 },
  { sigla: "AP", codigo: 16 },
  { sigla: "TO", codigo: 17 },
  { sigla: "MA", codigo: 21 },
  { sigla: "PI", codigo: 22 },
  { sigla: "CE", codigo: 23 },
  { sigla: "RN", codigo: 24 },
  { sigla: "PB", codigo: 25 },
  { sigla: "PE", codigo: 26 },
  { sigla: "AL", codigo: 27 },
  { sigla: "SE", codigo: 28 },
  { sigla: "BA", codigo: 29 },
  { sigla: "MG", codigo: 31 },
  { sigla: "ES", codigo: 32 },
  { sigla: "RJ", codigo: 33 },
  { sigla: "SP", codigo: 35 },
  { sigla: "PR", codigo: 41 },
  { sigla: "SC", codigo: 42 },
  { sigla: "RS", codigo: 43 },
  { sigla: "MS", codigo: 50 },
  { sigla: "MT", codigo: 51 },
  { sigla: "GO", codigo: 52 },
  { sigla: "DF", codigo: 53 },
];

export type ResultadoUfs = { ok: true; ufs: EstadoIbge[] } | { ok: false; erro: string };

/**
 * Lê a lista de estados pedida: "GO,MG" (na ordem em que vier, sem repetir) ou "todas" (todos, menos o
 * DF: Brasília é um órgão distrital, não uma prefeitura, e entra à parte).
 */
export function resolverUfs(texto: string | undefined): ResultadoUfs {
  const bruto = (texto ?? "").trim();
  if (!bruto) return { ok: false, erro: "Informe UF=SP,RJ (siglas separadas por vírgula) ou UF=todas." };
  if (bruto.toLowerCase() === "todas") return { ok: true, ufs: ESTADOS.filter((e) => e.sigla !== "DF") };

  const ufs: EstadoIbge[] = [];
  for (const parte of bruto.split(",")) {
    const sigla = parte.trim().toUpperCase();
    const estado = ESTADOS.find((e) => e.sigla === sigla);
    if (!estado) return { ok: false, erro: `UF desconhecida: "${parte.trim()}".` };
    if (estado.sigla === "DF") return { ok: false, erro: "O DF (Brasília) é órgão distrital, não prefeitura: cadastre-o à parte." };
    if (!ufs.includes(estado)) ufs.push(estado);
  }
  return { ok: true, ufs };
}

export interface MunicipioIbge {
  /** Código IBGE de 7 dígitos. */
  codigo: string;
  municipio: string;
  uf: string;
  populacao: number;
}

/**
 * Lê a resposta da API de agregados do IBGE (tabela 6579, "População residente estimada", variável 9324):
 * uma série por município, com o nome no formato "Abadia de Goiás - GO" e a população do ano mais
 * recente. Município sem número (a API devolve "-" quando falta) fica de fora.
 */
export function lerPopulacaoIbge(json: unknown): MunicipioIbge[] {
  if (!Array.isArray(json)) return [];
  const series = (json[0] as { resultados?: { series?: unknown[] }[] } | undefined)?.resultados?.[0]?.series;
  if (!Array.isArray(series)) return [];

  const saida: MunicipioIbge[] = [];
  for (const bruto of series) {
    const s = bruto as { localidade?: { id?: unknown; nome?: unknown }; serie?: Record<string, unknown> };
    const codigo = String(s.localidade?.id ?? "");
    const nome = typeof s.localidade?.nome === "string" ? s.localidade.nome : "";
    const corte = nome.lastIndexOf(" - ");
    if (!/^\d{7}$/.test(codigo) || corte <= 0) continue;

    const anos = Object.keys(s.serie ?? {}).sort();
    const populacao = Number(s.serie?.[anos[anos.length - 1]]);
    if (!Number.isFinite(populacao) || populacao <= 0) continue;

    saida.push({ codigo, municipio: nome.slice(0, corte).trim(), uf: nome.slice(corte + 3).trim(), populacao });
  }
  return saida;
}

export interface OpcoesDeAmpliacao {
  /** População mínima (inclusive). */
  minPop?: number;
  /** População máxima (inclusive). */
  maxPop?: number;
  /** Quantos municípios, no máximo (os maiores primeiro). */
  limite?: number;
}

/** O que falta cadastrar: os que não estão na base e cabem na faixa, os mais populosos primeiro. */
export function escolherNovos(
  candidatos: readonly MunicipioIbge[],
  jaNaBase: ReadonlySet<string>,
  opcoes: OpcoesDeAmpliacao = {},
): MunicipioIbge[] {
  const novos = candidatos
    .filter((m) => !jaNaBase.has(m.codigo))
    .filter((m) => opcoes.minPop === undefined || m.populacao >= opcoes.minPop)
    .filter((m) => opcoes.maxPop === undefined || m.populacao <= opcoes.maxPop)
    .sort((a, b) => b.populacao - a.populacao || a.municipio.localeCompare(b.municipio, "pt-BR"));
  return opcoes.limite !== undefined ? novos.slice(0, Math.max(0, opcoes.limite)) : novos;
}

/** O cadastro do município como a base o guarda (o mesmo do primeiro lote, prisma/seed-municipios-alvo.ts). */
export function dadosDaEntidade(m: MunicipioIbge) {
  return {
    nome: `Prefeitura de ${m.municipio}`,
    tipo: "municipal",
    esfera: "municipal",
    uf: m.uf,
    municipio: m.municipio,
    codigoIbgeMunicipio: m.codigo,
  };
}
