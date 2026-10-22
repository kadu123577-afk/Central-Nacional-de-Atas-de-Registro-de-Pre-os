/**
 * Regras puras do Radar de atas e do Funil de prospecção de fornecedores —
 * 2026-10-22, Projeto RNA etapa 5. Sem banco e sem rede, para poderem ser
 * testadas: o script que calcula o radar e as telas do admin só leem e
 * gravam; as decisões ficam aqui.
 *
 * Ideia do negócio: uma ata vigente publicada por um município, aberta à
 * adesão (Lei 14.133/2021, art. 86), pode ser oferecida a OUTROS municípios
 * que mostram necessidade da mesma categoria. O radar lista essas atas
 * candidatas com uma pontuação pela demanda; o funil acompanha a prospecção
 * dos fornecedores donos das atas, para trazê-los para a rede.
 *
 * Sigilo: só empresa (CNPJ de 14 dígitos). Pessoa física e CPF não entram em
 * prospecção, e nada aqui guarda contato de pessoa.
 */
import type { Tom } from "@/components/ui/badge";

// ───────────────────────── Estágios do funil ─────────────────────────

/** Ordem do funil: do primeiro contato ao credenciamento; "recusou" fica fora da fila. */
export const ESTAGIOS_PROSPECCAO = ["identificado", "contatado", "interessado", "credenciado", "recusou"] as const;

export type EstagioProspeccao = (typeof ESTAGIOS_PROSPECCAO)[number];

export const ROTULO_ESTAGIO_PROSPECCAO: Record<EstagioProspeccao, string> = {
  identificado: "Identificado",
  contatado: "Contatado",
  interessado: "Interessado",
  credenciado: "Credenciado",
  recusou: "Recusou",
};

/**
 * Tom do selo de cada estágio (escala do Badge). "marca" é estrutural e
 * nunca indica risco; "recusou" usa "alerta" só para se destacar na lista.
 */
export const TOM_ESTAGIO_PROSPECCAO: Record<EstagioProspeccao, Tom> = {
  identificado: "neutro",
  contatado: "atencao",
  interessado: "marca",
  credenciado: "marca",
  recusou: "alerta",
};

/** Cor (token do sistema) da barra de cada estágio no funil. Nunca hex. */
export const COR_ESTAGIO_PROSPECCAO: Record<EstagioProspeccao, string> = {
  identificado: "var(--cor-texto-3)",
  contatado: "var(--cor-atencao)",
  interessado: "var(--cor-info)",
  credenciado: "var(--cor-marca)",
  recusou: "var(--cor-alerta)",
};

export function estagioProspeccaoValido(valor: unknown): valor is EstagioProspeccao {
  return typeof valor === "string" && (ESTAGIOS_PROSPECCAO as readonly string[]).includes(valor);
}

/** Rótulo para a tela; valor desconhecido volta como veio. */
export function rotuloEstagioProspeccao(valor: string): string {
  return estagioProspeccaoValido(valor) ? ROTULO_ESTAGIO_PROSPECCAO[valor] : valor;
}

/** Os quatro estágios da fila, em ordem. "recusou" não tem posição. */
const FILA = ESTAGIOS_PROSPECCAO.filter((e) => e !== "recusou");

/**
 * Transições permitidas no funil:
 *  - qualquer estágio pode ir para "recusou";
 *  - "recusou" só volta para "identificado" (recomeçar do zero);
 *  - nos demais, avança ou volta um passo por vez (identificado ↔ contatado ↔
 *    interessado ↔ credenciado); como o passo é de um em um, "credenciado" só
 *    é alcançado a partir de "interessado".
 * Ficar no mesmo estágio não é mudança: devolve ok (não há o que fazer).
 */
export function podeMoverEstagio(de: string, para: string): { ok: boolean; erro?: string } {
  if (!estagioProspeccaoValido(de)) return { ok: false, erro: "Estágio atual desconhecido." };
  if (!estagioProspeccaoValido(para)) return { ok: false, erro: "Estágio de destino desconhecido." };
  if (de === para) return { ok: true };
  if (para === "recusou") return { ok: true };
  if (de === "recusou") {
    return para === "identificado"
      ? { ok: true }
      : { ok: false, erro: "Quem recusou só pode voltar para “Identificado”." };
  }
  const posDe = FILA.indexOf(de);
  const posPara = FILA.indexOf(para);
  if (Math.abs(posDe - posPara) === 1) return { ok: true };
  if (para === "credenciado") {
    return { ok: false, erro: "Só dá para credenciar quem já está como “Interessado”." };
  }
  return { ok: false, erro: "Mude um estágio por vez: avance ou volte um passo." };
}

/** Destinos possíveis a partir de um estágio (para montar o seletor da tela). */
export function estagiosPermitidos(de: string): EstagioProspeccao[] {
  return ESTAGIOS_PROSPECCAO.filter((para) => para !== de && podeMoverEstagio(de, para).ok);
}

export interface ResumoFunil {
  total: number;
  porEstagio: Record<EstagioProspeccao, number>;
  /** Credenciados sobre o total, em %, com uma casa decimal; 0 quando o funil está vazio. */
  percentualCredenciados: number;
}

/**
 * Soma as contagens por estágio. Aceita um mapa { estagio: quantidade } ou
 * uma lista [{ estagio, quantidade }] (o que um agrupamento do banco devolve
 * depois de ajustado). Estágio desconhecido e número inválido ou negativo
 * são ignorados.
 */
export function resumirFunil(
  contagens: Partial<Record<string, number>> | { estagio: string; quantidade: number }[],
): ResumoFunil {
  const porEstagio = Object.fromEntries(ESTAGIOS_PROSPECCAO.map((e) => [e, 0])) as Record<EstagioProspeccao, number>;
  const pares: [string, number][] = Array.isArray(contagens)
    ? contagens.map((c) => [c.estagio, c.quantidade])
    : Object.entries(contagens).map(([estagio, qtd]) => [estagio, qtd ?? 0]);
  for (const [estagio, qtd] of pares) {
    if (!estagioProspeccaoValido(estagio)) continue;
    if (typeof qtd !== "number" || !Number.isFinite(qtd) || qtd < 0) continue;
    porEstagio[estagio] += Math.floor(qtd);
  }
  const total = ESTAGIOS_PROSPECCAO.reduce((soma, e) => soma + porEstagio[e], 0);
  const percentualCredenciados = total === 0 ? 0 : Math.round((porEstagio.credenciado / total) * 1000) / 10;
  return { total, porEstagio, percentualCredenciados };
}

// ───────────────────────────── CNPJ ─────────────────────────────

const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function digitoVerificador(base: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) soma += Number(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Devolve o CNPJ só com os 14 dígitos, ou null. Aceita a máscara
 * (12.345.678/0001-95) e espaços; recusa CPF (11 dígitos), letras, tamanho
 * errado e qualquer outro lixo. Não confere o dígito verificador (para isso,
 * cnpjValido).
 */
export function normalizarCnpj(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (!texto || /[^0-9.\/\-\s]/.test(texto)) return null;
  const digitos = texto.replace(/\D/g, "");
  return digitos.length === 14 ? digitos : null;
}

/**
 * CNPJ de 14 dígitos com os dois dígitos verificadores corretos (cálculo
 * padrão, módulo 11) e que não seja uma repetição (00000000000000...).
 * Com { verificarDigitos: false } só confere o formato, como normalizarCnpj.
 */
export function cnpjValido(valor: unknown, opcoes: { verificarDigitos?: boolean } = {}): boolean {
  const cnpj = normalizarCnpj(valor);
  if (!cnpj) return false;
  if (opcoes.verificarDigitos === false) return true;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const dv1 = digitoVerificador(cnpj, PESOS_DV1);
  const dv2 = digitoVerificador(cnpj.slice(0, 12) + dv1, PESOS_DV2);
  return cnpj.endsWith(`${dv1}${dv2}`);
}

// ─────────────────────── Elegibilidade da ata ───────────────────────

const DIA_MS = 86_400_000;

/** Dias de vigência que a ata precisa ter pela frente para valer a oferta. */
export const DIAS_MINIMOS_ADESAO = 45;

/**
 * Meia-noite UTC do dia da data (Date ou "AAAA-MM-DD[...]" do PNCP); null se
 * inválida. O dia é o dia UTC: com `new Date()` depois das 21h em Brasília o
 * dia UTC já é o seguinte, diferença de no máximo um dia que não pesa no radar.
 */
function diaUtc(valor: Date | string | null | undefined): number | null {
  if (valor == null) return null;
  // Dado vindo de NDJSON/JSON pode trazer número ou objeto: não é data válida.
  if (!(valor instanceof Date) && typeof valor !== "string") return null;
  if (typeof valor === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
    if (!m) return null;
    const ano = Number(m[1]);
    const mes = Number(m[2]);
    const dia = Number(m[3]);
    const t = Date.UTC(ano, mes - 1, dia);
    const d = new Date(t);
    // Rejeita datas que "rolam" (31/02, mês 13).
    return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? t : null;
  }
  if (Number.isNaN(valor.getTime())) return null;
  return Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate());
}

/**
 * Dias de calendário entre hoje e o fim da vigência (o fim conta como dia
 * vigente). Negativo = já terminou; null = sem data válida de fim ou de hoje.
 */
export function diasRestantesAte(vigenciaFim: Date | string | null | undefined, hoje: Date): number | null {
  const fim = diaUtc(vigenciaFim);
  const ref = diaUtc(hoje);
  if (fim === null || ref === null) return null;
  return Math.round((fim - ref) / DIA_MS);
}

export interface AtaParaElegibilidade {
  cancelado?: boolean | null;
  /** Data de cancelamento: se já passou, a ata está cancelada mesmo com cancelado vazio. */
  dataCancelamento?: Date | string | null;
  vigenciaFim?: Date | string | null;
  /** Nulo = o PNCP não informou: considera aberta à adesão. Só false fecha. */
  possibilidadeAdesao?: boolean | null;
}

export interface Elegibilidade {
  elegivel: boolean;
  /** Presente só quando não é elegível. */
  motivo?: string;
  /** Dias de vigência que restam (negativo = vencida; 0 quando não há data de fim). */
  diasRestantes: number;
}

/**
 * Uma ata entra no radar quando NÃO está cancelada, tem data de fim de
 * vigência, está aberta à adesão (possibilidadeAdesao diferente de false) e
 * ainda tem pelo menos `diasMinimos` dias de vigência pela frente. Com
 * exatamente `diasMinimos` dias restantes ela ainda é elegível (o mínimo é
 * inclusivo); com um dia a menos, não. Vigência já vencida nunca é elegível.
 */
export function ataElegivel(
  ata: AtaParaElegibilidade,
  hoje: Date,
  { diasMinimos = DIAS_MINIMOS_ADESAO }: { diasMinimos?: number } = {},
): Elegibilidade {
  const minimo = Number.isFinite(diasMinimos) && diasMinimos >= 0 ? diasMinimos : DIAS_MINIMOS_ADESAO;
  const restantes = diasRestantesAte(ata.vigenciaFim, hoje);
  const diasRestantes = restantes ?? 0;

  const diaHoje = diaUtc(hoje);
  if (diaHoje === null) {
    return { elegivel: false, motivo: "Data de referência inválida.", diasRestantes };
  }
  const diaCancelamento = diaUtc(ata.dataCancelamento);
  if (ata.cancelado === true || (diaCancelamento !== null && diaCancelamento <= diaHoje)) {
    return { elegivel: false, motivo: "A ata foi cancelada.", diasRestantes };
  }
  if (restantes === null) {
    return { elegivel: false, motivo: "O fim da vigência não foi informado.", diasRestantes };
  }
  if (ata.possibilidadeAdesao === false) {
    return { elegivel: false, motivo: "A ata não aceita adesão de outros órgãos.", diasRestantes };
  }
  if (restantes < 0) {
    return { elegivel: false, motivo: "A vigência já terminou.", diasRestantes };
  }
  if (restantes < minimo) {
    return {
      elegivel: false,
      motivo: `A vigência acaba em ${restantes} ${restantes === 1 ? "dia" : "dias"} (mínimo de ${minimo}).`,
      diasRestantes,
    };
  }
  return { elegivel: true, diasRestantes };
}

// ──────────────────────────── Demanda ────────────────────────────

/**
 * Agrupa por categoria os municípios (entidades-alvo) que mostram
 * necessidade dela. As linhas vêm dos sinais (SinalMunicipio) e do raio-X de
 * consumo; categoria nula ou vazia é ignorada (sinal genérico não indica
 * necessidade de uma categoria específica). Um município conta uma vez por
 * categoria, mesmo que apareça em várias linhas.
 */
export function demandaPorCategoria(
  linhas: { entidadeAlvoId: string; categoria: string | null }[],
): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  for (const { entidadeAlvoId, categoria } of linhas) {
    const cat = typeof categoria === "string" ? categoria.trim() : "";
    if (!cat || !entidadeAlvoId) continue;
    let ids = mapa.get(cat);
    if (!ids) {
      ids = new Set();
      mapa.set(cat, ids);
    }
    ids.add(entidadeAlvoId);
  }
  return mapa;
}

// ─────────────────────────── Pontuação ───────────────────────────

/** Pontos por município com demanda da categoria. */
export const PONTOS_POR_MUNICIPIO = 10;
/** Teto da parcela de demanda (40 municípios ou mais). */
export const TETO_PONTOS_DEMANDA = 400;
/** Bônus máximo de vigência (365 dias ou mais de vigência restante). */
export const PONTOS_VIGENCIA_MAXIMA = 50;
/** Dias de vigência que dão o bônus máximo. */
export const DIAS_VIGENCIA_BONUS = 365;
/** Bônus quando o fornecedor da ata é uma empresa identificada (CNPJ). */
export const PONTOS_FORNECEDOR_CNPJ = 20;
/** Bônus quando o objeto da ata caiu numa categoria conhecida. */
export const PONTOS_CATEGORIA_CONHECIDA = 10;
/** Teto de uma ata sem categoria e sem município com demanda. */
export const TETO_SEM_CATEGORIA_NEM_DEMANDA = 30;

export interface EntradaPontuacao {
  diasRestantes: number;
  municipiosComDemanda: number;
  temFornecedorCnpj: boolean;
  temCategoria: boolean;
}

/**
 * Pontuação do radar (número inteiro; quanto maior, mais promissora a ata):
 *
 *   demanda  = municípios com demanda × 10, no máximo 400
 *   vigência = min(dias restantes, 365) / 365 × 50, arredondado
 *   + 20 se o fornecedor é empresa identificada (CNPJ)
 *   + 10 se a categoria é conhecida
 *
 * Sem categoria e sem município com demanda, a pontuação fica em no máximo
 * 30: sem saber do que se trata nem quem precisa, a ata é só um achado.
 * Máximo possível: 480. Entrada inválida (número que não é finito, município
 * negativo, vigência já vencida) vale 0.
 */
export function pontuarAta(entrada: EntradaPontuacao): number {
  const { diasRestantes, municipiosComDemanda, temFornecedorCnpj, temCategoria } = entrada;
  if (!Number.isFinite(diasRestantes) || !Number.isFinite(municipiosComDemanda)) return 0;
  if (diasRestantes < 0 || municipiosComDemanda < 0) return 0;

  const municipios = Math.floor(municipiosComDemanda);
  const demanda = Math.min(municipios * PONTOS_POR_MUNICIPIO, TETO_PONTOS_DEMANDA);
  const vigencia = Math.round(
    (Math.min(diasRestantes, DIAS_VIGENCIA_BONUS) * PONTOS_VIGENCIA_MAXIMA) / DIAS_VIGENCIA_BONUS,
  );
  let total =
    demanda + vigencia + (temFornecedorCnpj ? PONTOS_FORNECEDOR_CNPJ : 0) + (temCategoria ? PONTOS_CATEGORIA_CONHECIDA : 0);
  if (!temCategoria && municipios === 0) total = Math.min(total, TETO_SEM_CATEGORIA_NEM_DEMANDA);
  return total;
}

// ───────────────────────── Fornecedores ─────────────────────────

/**
 * Nome da empresa sem CPF: MEI carrega o CPF do titular na razão social
 * ("FULANO 12345678901") e isso é dado pessoal. Retira o CPF (com ou sem
 * pontuação) e mantém o resto como veio; vazio vira null. Última barreira:
 * quem monta o radar já deve entregar o nome limpo (nomeFornecedorPublico).
 */
function nomeSemCpf(nome: string | null | undefined): string | null {
  if (typeof nome !== "string") return null;
  const limpo = nome
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return limpo || null;
}

export interface AtaDoFornecedor {
  fornecedorCnpj: string | null;
  fornecedorNome: string | null;
  categoria: string | null;
  uf: string | null;
  pontuacao: number;
}

export interface FornecedorAgregado {
  cnpj: string;
  razaoSocial: string;
  atasVigentes: number;
  /** A maior pontuação entre as atas do fornecedor. */
  pontuacao: number;
  categorias: string[];
  ufs: string[];
}

/**
 * Junta as atas por fornecedor (CNPJ de 14 dígitos; ata sem CNPJ válido é
 * ignorada). As atas recebidas devem ser as vigentes e elegíveis: cada uma
 * conta como uma em atasVigentes. A razão social vem da ata de maior
 * pontuação que tem nome (empate: a primeira da lista), sem CPF de MEI no
 * texto; sem nome nenhum, usa o CNPJ. Categorias e UFs saem sem repetição e em ordem alfabética.
 * Ordem do resultado: pontuação (maior primeiro), depois atasVigentes
 * (maior primeiro), depois CNPJ — para o resultado ser sempre o mesmo.
 * `topN` (inteiro positivo) corta a lista nos N primeiros.
 */
export function agregarFornecedores(atas: AtaDoFornecedor[], { topN }: { topN?: number } = {}): FornecedorAgregado[] {
  interface Acumulador {
    cnpj: string;
    atas: number;
    pontuacao: number;
    nome: string | null;
    pontuacaoDoNome: number;
    categorias: Set<string>;
    ufs: Set<string>;
  }
  const porCnpj = new Map<string, Acumulador>();

  for (const ata of atas) {
    const cnpj = normalizarCnpj(ata.fornecedorCnpj);
    if (!cnpj) continue;
    const pontos = Number.isFinite(ata.pontuacao) ? ata.pontuacao : 0;
    const nome = nomeSemCpf(ata.fornecedorNome);
    let acc = porCnpj.get(cnpj);
    if (!acc) {
      acc = { cnpj, atas: 0, pontuacao: pontos, nome: null, pontuacaoDoNome: -Infinity, categorias: new Set(), ufs: new Set() };
      porCnpj.set(cnpj, acc);
    }
    acc.atas += 1;
    if (pontos > acc.pontuacao) acc.pontuacao = pontos;
    if (nome && pontos > acc.pontuacaoDoNome) {
      acc.nome = nome;
      acc.pontuacaoDoNome = pontos;
    }
    const categoria = ata.categoria?.trim();
    if (categoria) acc.categorias.add(categoria);
    const uf = ata.uf?.trim().toUpperCase();
    if (uf) acc.ufs.add(uf);
  }

  const lista = [...porCnpj.values()].map<FornecedorAgregado>((acc) => ({
    cnpj: acc.cnpj,
    razaoSocial: acc.nome ?? acc.cnpj,
    atasVigentes: acc.atas,
    pontuacao: acc.pontuacao,
    categorias: [...acc.categorias].sort((a, b) => a.localeCompare(b, "pt-BR")),
    ufs: [...acc.ufs].sort((a, b) => a.localeCompare(b, "pt-BR")),
  }));
  lista.sort(
    (a, b) => b.pontuacao - a.pontuacao || b.atasVigentes - a.atasVigentes || (a.cnpj < b.cnpj ? -1 : a.cnpj > b.cnpj ? 1 : 0),
  );

  if (typeof topN === "number" && Number.isFinite(topN) && topN >= 1) return lista.slice(0, Math.floor(topN));
  return lista;
}
