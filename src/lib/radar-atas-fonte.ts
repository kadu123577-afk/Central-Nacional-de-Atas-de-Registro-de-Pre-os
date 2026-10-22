/**
 * Leitura e ligação dos dados públicos do PNCP para o Radar de atas —
 * 2026-10-22, Projeto RNA etapa 5. Funções puras (sem banco, sem rede e sem
 * disco), para poderem ser testadas; quem lê os arquivos e grava no banco é
 * scripts/inteligencia/gerar-radar-atas.ts. As regras de negócio (o que é ata
 * elegível, pontuação, CNPJ, agregação de fornecedores) ficam em
 * src/lib/radar-atas.ts; aqui só se transforma o dado bruto do PNCP.
 *
 * Formato dos arquivos coletados (NDJSON): uma linha {chave, dado} por
 * registro. Chave que começa com "atas" é ata de registro de preços; com
 * "contratos", contrato. O fornecedor de uma ata vem dos contratos que a citam
 * (numeroControlePncpAta).
 *
 * Sigilo: só empresa (CNPJ de 14 dígitos com dígito verificador correto).
 * Pessoa física e CPF são descartados aqui, e o nome da empresa sai sem o CPF
 * que o MEI carrega na razão social (nomeFornecedorPublico).
 */
import { classificarObjeto } from "./classificador-objeto";
import {
  ataElegivel,
  cnpjValido,
  normalizarCnpj,
  pontuarAta,
  type AtaDoFornecedor,
  type FornecedorAgregado,
} from "./radar-atas";
import { nomeFornecedorPublico } from "./sinais-preditivos";

/** O banco guarda o objeto da ata em até 1000 caracteres. */
export const MAX_OBJETO = 1000;
/** Limite de segurança de atas gravadas no radar. */
export const LIMITE_ATAS_RADAR = 20_000;

// ─────────────────────────── Texto e datas ───────────────────────────

/** Texto sem NUL (o Postgres recusa), com espaços compactados; não-texto vira "". */
function limparTexto(valor: unknown): string {
  if (typeof valor !== "string") return "";
  return valor.split("\u0000").join("").replace(/\s+/g, " ").trim();
}

/** Corta em `max` sem deixar meio par substituto (emoji) na ponta. */
export function cortarTexto(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  let corte = texto.slice(0, max);
  const ultimo = corte.charCodeAt(corte.length - 1);
  if (ultimo >= 0xd800 && ultimo <= 0xdbff) corte = corte.slice(0, -1);
  return corte;
}

/** Só o "AAAA-MM-DD" do começo de uma data do PNCP; outra coisa vira null. */
function diaTexto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(valor.trim());
  return m ? m[1] : null;
}

/** Meia-noite UTC de "AAAA-MM-DD[...]"; null se a data não existe (31/02, mês 13). */
export function dataUtc(valor: string | null | undefined): Date | null {
  const dia = diaTexto(valor);
  if (!dia) return null;
  const [ano, mes, d] = dia.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, d));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === d ? data : null;
}

function booleano(valor: unknown): boolean | null {
  return typeof valor === "boolean" ? valor : null;
}

function objetoDe(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
}

// ─────────────────────────── Linhas NDJSON ───────────────────────────

export type TipoLinha = "ata" | "contrato";

function tipoDaChave(chave: unknown): TipoLinha | null {
  if (typeof chave !== "string") return null;
  if (chave.startsWith("atas")) return "ata";
  if (chave.startsWith("contratos")) return "contrato";
  return null;
}

/**
 * Lê uma linha do NDJSON e devolve só o que o radar usa: ata ou contrato que
 * cita uma ata. Devolve null para linha vazia, truncada (coleta interrompida
 * no meio da escrita), de outro tipo (PCA etc.) ou contrato sem ata — esse
 * último nem é interpretado (a maioria das linhas), o que acelera a leitura:
 * o campo vem como `"numeroControlePncpAta":null` e só existe no nível do
 * contrato.
 */
export function lerLinha(linha: string): { tipo: TipoLinha; dado: unknown } | null {
  if (!linha) return null;
  // Caminho rápido: a chave vem logo no começo da linha.
  const m = /^\{"chave":"([^"]*)"/.exec(linha.slice(0, 200));
  if (m) {
    const tipo = tipoDaChave(m[1]);
    if (!tipo) return null;
    if (tipo === "contrato" && linha.includes('"numeroControlePncpAta":null')) return null;
  }
  let objeto: Record<string, unknown> | null;
  try {
    objeto = objetoDe(JSON.parse(linha));
  } catch {
    return null;
  }
  if (!objeto) return null;
  const tipo = tipoDaChave(objeto.chave);
  return tipo ? { tipo, dado: objeto.dado } : null;
}

// ───────────────────────────── Atas ─────────────────────────────

export interface AtaNormalizada {
  /** numeroControlePNCPAta (chave natural). */
  numeroControle: string;
  /** CNPJ do órgão (14 dígitos) ou "" se não houver. */
  orgaoCnpj: string;
  orgaoNome: string;
  /** Objeto sem corte (para classificar); o corte vem em avaliarAta. */
  objeto: string;
  /** "AAAA-MM-DD". */
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  cancelado: boolean | null;
  dataCancelamento: string | null;
  /** Nulo = o PNCP não informou. */
  possibilidadeAdesao: boolean | null;
  /** dataAtualizacao do PNCP, para ficar com a versão mais recente; "" se não houver. */
  atualizadoEm: string;
}

/** Ata do PNCP no formato que o radar usa; null sem número de controle. */
export function normalizarAta(dado: unknown): AtaNormalizada | null {
  const d = objetoDe(dado);
  if (!d) return null;
  const numeroControle = limparTexto(d.numeroControlePNCPAta);
  if (!numeroControle) return null;
  const doNumero = /^(\d{14})-/.exec(numeroControle)?.[1] ?? "";
  return {
    numeroControle,
    orgaoCnpj: normalizarCnpj(d.cnpjOrgao) ?? doNumero,
    orgaoNome: limparTexto(d.nomeOrgao),
    objeto: limparTexto(d.objetoContratacao),
    vigenciaInicio: diaTexto(d.vigenciaInicio),
    vigenciaFim: diaTexto(d.vigenciaFim),
    cancelado: booleano(d.cancelado),
    dataCancelamento: diaTexto(d.dataCancelamento),
    possibilidadeAdesao: booleano(d.possibilidadeAdesao),
    atualizadoEm: typeof d.dataAtualizacao === "string" ? d.dataAtualizacao : "",
  };
}

/** Das duas versões de uma ata fica a de dataAtualizacao mais recente (empate: a que já estava). */
export function ataMaisRecente(atual: AtaNormalizada | undefined, nova: AtaNormalizada): AtaNormalizada {
  return !atual || nova.atualizadoEm > atual.atualizadoEm ? nova : atual;
}

// ───────────────────── Contratos → fornecedor da ata ─────────────────────

export interface VinculoFornecedor {
  ataControle: string;
  /** numeroControlePNCP do contrato (para não contar duas vezes o mesmo contrato); null se não veio. */
  contratoId: string | null;
  /** CNPJ de 14 dígitos com dígito verificador correto. */
  cnpj: string;
  /** Nome público da empresa (sem CPF de MEI); null se vazio. */
  nome: string | null;
}

/**
 * Ligação contrato → ata → fornecedor. Só vale contrato que cita uma ata
 * (numeroControlePncpAta) e cujo fornecedor é empresa: pessoa física (tipoPessoa
 * "PF") e CPF não entram, nem CNPJ com dígito verificador errado.
 */
export function vinculoDeContrato(dado: unknown): VinculoFornecedor | null {
  const d = objetoDe(dado);
  if (!d) return null;
  const ataControle = limparTexto(d.numeroControlePncpAta);
  if (!ataControle) return null;
  if (d.tipoPessoa === "PF") return null;
  const cnpj = normalizarCnpj(d.niFornecedor);
  if (!cnpj || !cnpjValido(cnpj)) return null;
  const nome = nomeFornecedorPublico(limparTexto(d.nomeRazaoSocialFornecedor), typeof d.tipoPessoa === "string" ? d.tipoPessoa : null);
  return { ataControle, contratoId: limparTexto(d.numeroControlePNCP) || null, cnpj, nome };
}

/** numeroControle da ata → CNPJ → quantos contratos citam a ata com aquele CNPJ. */
export type Ligacoes = Map<string, Map<string, { contratos: number; nome: string | null }>>;

/**
 * Soma o contrato à ata. O mesmo contrato pode vir mais de uma vez (janelas da
 * coleta que se sobrepõem, fontes pncp e pncp-orgaos): com `contratosVistos`, o
 * contrato de mesmo numeroControlePNCP só conta uma vez, senão a repetição
 * poderia trocar o fornecedor escolhido para a ata.
 */
export function registrarVinculo(ligacoes: Ligacoes, v: VinculoFornecedor, contratosVistos?: Set<string>): boolean {
  // Devolve false quando o contrato já tinha sido contado.
  if (v.contratoId && contratosVistos) {
    if (contratosVistos.has(v.contratoId)) return false;
    contratosVistos.add(v.contratoId);
  }
  let porCnpj = ligacoes.get(v.ataControle);
  if (!porCnpj) {
    porCnpj = new Map();
    ligacoes.set(v.ataControle, porCnpj);
  }
  const atual = porCnpj.get(v.cnpj);
  if (atual) {
    atual.contratos += 1;
    if (!atual.nome && v.nome) atual.nome = v.nome;
  } else {
    porCnpj.set(v.cnpj, { contratos: 1, nome: v.nome });
  }
  return true;
}

/**
 * O fornecedor da ata é o CNPJ que mais aparece nos contratos que a citam
 * (empate: o menor CNPJ, para o resultado ser sempre o mesmo); null se nenhum
 * contrato de empresa cita a ata.
 */
export function fornecedorDaAta(
  ligacoes: Ligacoes,
  ataControle: string,
): { cnpj: string; nome: string | null; contratos: number } | null {
  const porCnpj = ligacoes.get(ataControle);
  if (!porCnpj) return null;
  let melhor: { cnpj: string; nome: string | null; contratos: number } | null = null;
  for (const [cnpj, v] of porCnpj) {
    if (!melhor || v.contratos > melhor.contratos || (v.contratos === melhor.contratos && cnpj < melhor.cnpj)) {
      melhor = { cnpj, nome: v.nome, contratos: v.contratos };
    }
  }
  return melhor;
}

// ───────────────────── Elegibilidade e candidata ─────────────────────

export interface MunicipioDaAta {
  entidadeAlvoId: string;
  uf: string;
  municipioNome: string;
}

export interface AtaCandidata extends MunicipioDaAta {
  numeroControlePncpAta: string;
  orgaoCnpj: string;
  orgaoNome: string;
  /** Até 1000 caracteres. */
  objeto: string;
  /** Slug de src/lib/categorias.ts (classificarObjeto); null = não classificada. */
  categoria: string | null;
  vigenciaInicio: Date | null;
  vigenciaFim: Date;
  possibilidadeAdesao: boolean | null;
  fornecedorCnpj: string | null;
  fornecedorNome: string | null;
  diasRestantes: number;
  /** dataAtualizacao do PNCP (só para escolher entre duas versões da mesma ata). */
  atualizadoEm: string;
}

export type AvaliacaoAta = { elegivel: true; candidata: AtaCandidata } | { elegivel: false; motivo: string };

/**
 * Aplica ataElegivel (src/lib/radar-atas.ts) e, sendo elegível, monta a
 * candidata com a categoria do objeto. O fornecedor entra depois (ligarFornecedor),
 * quando todos os contratos já foram lidos.
 */
export function avaliarAta(
  ata: AtaNormalizada,
  hoje: Date,
  municipio: MunicipioDaAta,
  opcoes: { diasMinimos?: number } = {},
): AvaliacaoAta {
  const r = ataElegivel(
    {
      cancelado: ata.cancelado,
      dataCancelamento: ata.dataCancelamento,
      vigenciaFim: ata.vigenciaFim,
      possibilidadeAdesao: ata.possibilidadeAdesao,
    },
    hoje,
    opcoes,
  );
  if (!r.elegivel) return { elegivel: false, motivo: r.motivo ?? "A ata não é elegível." };
  const vigenciaFim = dataUtc(ata.vigenciaFim);
  if (!vigenciaFim) return { elegivel: false, motivo: "O fim da vigência não foi informado." };
  return {
    elegivel: true,
    candidata: {
      ...municipio,
      numeroControlePncpAta: ata.numeroControle,
      orgaoCnpj: ata.orgaoCnpj,
      orgaoNome: ata.orgaoNome,
      objeto: cortarTexto(ata.objeto || "Objeto não informado", MAX_OBJETO),
      categoria: ata.objeto ? classificarObjeto(ata.objeto) : null,
      vigenciaInicio: dataUtc(ata.vigenciaInicio),
      vigenciaFim,
      possibilidadeAdesao: ata.possibilidadeAdesao,
      fornecedorCnpj: null,
      fornecedorNome: null,
      diasRestantes: r.diasRestantes,
      atualizadoEm: ata.atualizadoEm,
    },
  };
}

/** Agrupa os motivos de "fora do radar" em poucos grupos para o resumo. */
export function grupoDoMotivo(motivo: string): string {
  if (motivo.startsWith("A ata foi cancelada")) return "cancelada";
  if (motivo.startsWith("A ata não aceita adesão")) return "fechada à adesão";
  if (motivo.startsWith("A vigência já terminou")) return "vigência vencida";
  if (motivo.startsWith("A vigência acaba em")) return "vigência curta demais";
  if (motivo.startsWith("O fim da vigência")) return "sem data de fim";
  return "outro motivo";
}

/** Preenche o fornecedor da ata a partir dos contratos que a citam (sem mudar a original). */
export function ligarFornecedor(c: AtaCandidata, ligacoes: Ligacoes): AtaCandidata {
  const f = fornecedorDaAta(ligacoes, c.numeroControlePncpAta);
  return f ? { ...c, fornecedorCnpj: f.cnpj, fornecedorNome: f.nome } : c;
}

// ───────────────────────── Demanda e pontuação ─────────────────────────

/**
 * Quantos municípios-alvo DIFERENTES do que publicou a ata mostram necessidade
 * da categoria. `demanda` vem de demandaPorCategoria (src/lib/radar-atas.ts).
 * Sem categoria, 0.
 */
export function municipiosComDemanda(
  demanda: Map<string, Set<string>>,
  categoria: string | null,
  entidadeAlvoId: string,
): number {
  if (!categoria) return 0;
  const ids = demanda.get(categoria);
  if (!ids) return 0;
  return ids.size - (ids.has(entidadeAlvoId) ? 1 : 0);
}

export interface AtaPontuada extends AtaCandidata {
  municipiosComDemanda: number;
  pontuacao: number;
}

export function pontuarCandidata(c: AtaCandidata, demanda: Map<string, Set<string>>): AtaPontuada {
  const comDemanda = municipiosComDemanda(demanda, c.categoria, c.entidadeAlvoId);
  return {
    ...c,
    municipiosComDemanda: comDemanda,
    pontuacao: pontuarAta({
      diasRestantes: c.diasRestantes,
      municipiosComDemanda: comDemanda,
      temFornecedorCnpj: c.fornecedorCnpj !== null,
      temCategoria: c.categoria !== null,
    }),
  };
}

/** Melhor primeiro: pontuação, depois mais vigência pela frente, depois número (resultado sempre igual). */
export function compararAtas(
  a: Pick<AtaPontuada, "pontuacao" | "diasRestantes" | "numeroControlePncpAta">,
  b: Pick<AtaPontuada, "pontuacao" | "diasRestantes" | "numeroControlePncpAta">,
): number {
  return (
    b.pontuacao - a.pontuacao ||
    b.diasRestantes - a.diasRestantes ||
    (a.numeroControlePncpAta < b.numeroControlePncpAta ? -1 : a.numeroControlePncpAta > b.numeroControlePncpAta ? 1 : 0)
  );
}

/** Mantém as `limite` de maior pontuação; devolve também quantas foram cortadas. */
export function limitarAtas<T extends Pick<AtaPontuada, "pontuacao" | "diasRestantes" | "numeroControlePncpAta">>(
  atas: T[],
  limite: number = LIMITE_ATAS_RADAR,
): { mantidas: T[]; cortadas: number } {
  const ordenadas = [...atas].sort(compararAtas);
  const max = Number.isFinite(limite) && limite >= 0 ? Math.floor(limite) : LIMITE_ATAS_RADAR;
  return { mantidas: ordenadas.slice(0, max), cortadas: Math.max(0, ordenadas.length - max) };
}

/** Quantas atas por categoria (null = sem categoria), da maior para a menor. */
export function contarPorCategoria(
  atas: { categoria: string | null }[],
): { categoria: string | null; quantidade: number }[] {
  const mapa = new Map<string | null, number>();
  for (const a of atas) mapa.set(a.categoria, (mapa.get(a.categoria) ?? 0) + 1);
  return [...mapa.entries()]
    .map(([categoria, quantidade]) => ({ categoria, quantidade }))
    .sort(
      (a, b) =>
        b.quantidade - a.quantidade ||
        (a.categoria === null ? 1 : b.categoria === null ? -1 : a.categoria.localeCompare(b.categoria, "pt-BR")),
    );
}

// ───────────────────────── Gravação no radar ─────────────────────────

export interface LinhaRadar {
  numeroControlePncpAta: string;
  orgaoCnpj: string;
  orgaoNome: string;
  uf: string;
  municipioNome: string;
  objeto: string;
  categoria: string | null;
  vigenciaInicio: Date | null;
  vigenciaFim: Date;
  possibilidadeAdesao: boolean | null;
  fornecedorCnpj: string | null;
  fornecedorNome: string | null;
  municipiosComDemanda: number;
  pontuacao: number;
  calculadoEm: Date;
}

/** Linha de RadarAta (prisma/schema.prisma) para gravar. */
export function linhaRadar(a: AtaPontuada, calculadoEm: Date): LinhaRadar {
  return {
    numeroControlePncpAta: a.numeroControlePncpAta,
    orgaoCnpj: a.orgaoCnpj,
    orgaoNome: a.orgaoNome,
    uf: a.uf,
    municipioNome: a.municipioNome,
    objeto: a.objeto,
    categoria: a.categoria,
    vigenciaInicio: a.vigenciaInicio,
    vigenciaFim: a.vigenciaFim,
    possibilidadeAdesao: a.possibilidadeAdesao,
    fornecedorCnpj: a.fornecedorCnpj,
    fornecedorNome: a.fornecedorNome,
    municipiosComDemanda: a.municipiosComDemanda,
    pontuacao: a.pontuacao,
    calculadoEm,
  };
}

/** O que o script precisa saber de uma linha que já está no radar. */
export interface RadarExistente {
  numeroControlePncpAta: string;
  uf: string | null;
  municipioNome: string | null;
  categoria: string | null;
  fornecedorCnpj: string | null;
  fornecedorNome: string | null;
  pontuacao: number;
}

/** Chave de comparação "UF|município" (o radar guarda uf e município como texto). */
export function chaveMunicipio(uf: string | null | undefined, municipioNome: string | null | undefined): string {
  return `${uf ?? ""}|${municipioNome ?? ""}`;
}

export interface PlanoRadar<T> {
  /** As atas desta rodada que ficam gravadas (maior pontuação primeiro). */
  mantidas: T[];
  /** Quantas ficaram de fora por causa do limite. */
  cortadas: number;
  criar: T[];
  atualizar: T[];
  /** Números das atas que saem do radar (deixaram de ser elegíveis, de caber no limite ou de existir). */
  apagar: string[];
  /** Linhas já gravadas que esta rodada não mexe (só numa rodada parcial, por município). */
  foraDoEscopo: RadarExistente[];
}

/**
 * Decide o que fazer com o radar numa rodada. `pontuadas` são as atas elegíveis
 * lidas agora; `existentes`, as linhas que já estão no banco.
 *
 * Rodada completa (`escopo` nulo): o radar passa a ser exatamente as `limite`
 * melhores atas lidas; toda linha que não está nelas é apagada (vencida,
 * cancelada, fechada à adesão, cortada pelo limite ou sumida dos dados).
 *
 * Rodada parcial (`escopo` = conjunto de chaveMunicipio lidos): só as linhas
 * desses municípios (e as que a rodada leu de novo, mesmo gravadas em outro
 * município) podem ser trocadas ou apagadas; as dos demais ficam como estão. O
 * limite vale para o radar inteiro: as linhas que ficam de fora do escopo
 * contam, e o que sobra do limite é o que a rodada pode gravar.
 */
export function planejarRadar<T extends Pick<AtaPontuada, "pontuacao" | "diasRestantes" | "numeroControlePncpAta">>(
  pontuadas: T[],
  existentes: RadarExistente[],
  { escopo = null, limite = LIMITE_ATAS_RADAR }: { escopo?: ReadonlySet<string> | null; limite?: number } = {},
): PlanoRadar<T> {
  const numerosLidos = new Set(pontuadas.map((a) => a.numeroControlePncpAta));
  const rodadaMexe = (r: RadarExistente) =>
    !escopo || escopo.has(chaveMunicipio(r.uf, r.municipioNome)) || numerosLidos.has(r.numeroControlePncpAta);
  const foraDoEscopo = existentes.filter((r) => !rodadaMexe(r));

  const limiteGeral = Number.isFinite(limite) && limite >= 0 ? Math.floor(limite) : LIMITE_ATAS_RADAR;
  const { mantidas, cortadas } = limitarAtas(pontuadas, Math.max(0, limiteGeral - foraDoEscopo.length));

  const numerosMantidos = new Set(mantidas.map((a) => a.numeroControlePncpAta));
  const numerosGravados = new Set(existentes.map((r) => r.numeroControlePncpAta));
  return {
    mantidas,
    cortadas,
    criar: mantidas.filter((a) => !numerosGravados.has(a.numeroControlePncpAta)),
    atualizar: mantidas.filter((a) => numerosGravados.has(a.numeroControlePncpAta)),
    apagar: existentes.filter((r) => rodadaMexe(r) && !numerosMantidos.has(r.numeroControlePncpAta)).map((r) => r.numeroControlePncpAta),
    foraDoEscopo,
  };
}

/** O que a agregação de fornecedores precisa de uma ata do radar (nova ou já gravada). */
export function paraAtasDoFornecedor(
  atas: {
    fornecedorCnpj: string | null;
    fornecedorNome: string | null;
    categoria: string | null;
    uf: string | null;
    pontuacao: number;
  }[],
): AtaDoFornecedor[] {
  return atas.map((a) => ({
    fornecedorCnpj: a.fornecedorCnpj,
    fornecedorNome: a.fornecedorNome,
    categoria: a.categoria,
    uf: a.uf,
    pontuacao: a.pontuacao,
  }));
}

// ─────────────────────── Funil de prospecção ───────────────────────

export interface ProspeccaoExistente {
  cnpj: string;
  razaoSocial: string;
  atasVigentes: number;
  pontuacao: number;
  categorias: string | null;
  ufs: string | null;
}

export interface NovaProspeccao {
  cnpj: string;
  razaoSocial: string;
  atasVigentes: number;
  pontuacao: number;
  categorias: string | null;
  ufs: string | null;
}

/** Só os campos que a rodada do radar pode mexer. Nunca estágio, observações nem próximo contato. */
export interface AtualizacaoProspeccao {
  cnpj: string;
  dados: {
    atasVigentes?: number;
    pontuacao?: number;
    categorias?: string | null;
    ufs?: string | null;
    razaoSocial?: string;
  };
}

export interface PlanoProspeccao {
  criar: NovaProspeccao[];
  atualizar: AtualizacaoProspeccao[];
  /** Quantos dos "atualizar" são fornecedores que saíram do radar (atasVigentes e pontuação zerados). */
  zerados: number;
}

const listaTexto = (itens: string[]): string | null => (itens.length ? itens.join(",") : null);
const vazio = (t: string | null | undefined): boolean => !t || !t.trim();
/** Razão social vazia ou só o CNPJ (o que se grava quando nenhum contrato trouxe o nome): ainda sem nome. */
const semNome = (e: ProspeccaoExistente): boolean => vazio(e.razaoSocial) || e.razaoSocial.trim() === e.cnpj;

/**
 * Decide o que gravar no funil depois de uma rodada do radar.
 *  - criar: dos `topN` primeiros fornecedores agregados (já em ordem de
 *    pontuação), os que ainda não existem — nascem como "identificado" (o
 *    valor padrão do banco; o plano não fala de estágio);
 *  - atualizar: fornecedor que já existe (de qualquer posição) recebe só
 *    atasVigentes, pontuação, categorias, UFs e, se estiver vazia (ou só com
 *    o CNPJ no lugar do nome), a razão social; só entram os campos que mudaram;
 *  - fornecedor que existe no funil e não aparece mais no radar (nenhuma ata
 *    elegível) fica com atasVigentes e pontuação zerados, para a tela não
 *    mostrar atas que já não valem.
 * Estágio, observações e próximo contato nunca são tocados.
 */
export function planejarProspeccao(
  agregados: FornecedorAgregado[],
  existentes: ProspeccaoExistente[],
  { topN = 300 }: { topN?: number } = {},
): PlanoProspeccao {
  const porCnpj = new Map(existentes.map((e) => [e.cnpj, e]));
  const limite = Number.isFinite(topN) && topN >= 1 ? Math.floor(topN) : 300;

  const criar: NovaProspeccao[] = [];
  for (const f of agregados.slice(0, limite)) {
    if (porCnpj.has(f.cnpj)) continue;
    criar.push({
      cnpj: f.cnpj,
      razaoSocial: f.razaoSocial,
      atasVigentes: f.atasVigentes,
      pontuacao: f.pontuacao,
      categorias: listaTexto(f.categorias),
      ufs: listaTexto(f.ufs),
    });
  }

  const atualizar: AtualizacaoProspeccao[] = [];
  const vistos = new Set<string>();
  for (const f of agregados) {
    vistos.add(f.cnpj);
    const atual = porCnpj.get(f.cnpj);
    if (!atual) continue;
    const dados: AtualizacaoProspeccao["dados"] = {};
    if (atual.atasVigentes !== f.atasVigentes) dados.atasVigentes = f.atasVigentes;
    if (atual.pontuacao !== f.pontuacao) dados.pontuacao = f.pontuacao;
    const categorias = listaTexto(f.categorias);
    if ((atual.categorias || null) !== categorias) dados.categorias = categorias;
    const ufs = listaTexto(f.ufs);
    if ((atual.ufs || null) !== ufs) dados.ufs = ufs;
    if (semNome(atual) && !vazio(f.razaoSocial) && f.razaoSocial.trim() !== atual.razaoSocial.trim()) {
      dados.razaoSocial = f.razaoSocial;
    }
    if (Object.keys(dados).length) atualizar.push({ cnpj: f.cnpj, dados });
  }

  let zerados = 0;
  for (const e of existentes) {
    if (vistos.has(e.cnpj)) continue;
    if (e.atasVigentes === 0 && e.pontuacao === 0) continue;
    atualizar.push({ cnpj: e.cnpj, dados: { atasVigentes: 0, pontuacao: 0 } });
    zerados++;
  }

  return { criar, atualizar, zerados };
}
