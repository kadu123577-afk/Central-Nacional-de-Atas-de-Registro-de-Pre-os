import { calcularUrgencia, type NivelUrgencia } from "./urgencia";
import { escolherDecisorPrincipal, ordenarDecisores, papelDoContato } from "./decisores";
import { rotuloDaCategoria } from "./categorias";
import { resumirComissao } from "./recebiveis";
import { limparNomeContato } from "./contatos-fonte";
import { sinaisRelevantes, sinalGenerico, type SinalView } from "./sinais";
import {
  NIVEIS_VINCULO,
  ROTULO_NIVEL_VINCULO,
  STATUS_VINCULO,
  type NivelVinculo,
  type StatusVinculo,
} from "./acompanhamento";
import { nomeFornecedorPublico, resumir, urlContratoPncp } from "./sinais-preditivos";
import { dataCurtaUtc } from "./formato";
import { normalizarMapa, resumirInstrucao, type MapaInstrucao, type ResumoInstrucao } from "./instrucao-adesao";

/**
 * Modelos de visão do Kanban do vendedor (2026-10-04, fase 2 de design):
 * tudo que o card e a gaveta mostram já calculado no servidor, só com tipos
 * serializáveis (data como ISO string, dinheiro como number) pra atravessar
 * a fronteira server → client component.
 */
export interface ContatoView {
  id: string;
  cargo: string;
  area: string | null;
  nomeContato: string;
  telefone: string | null;
  email: string | null;
  particularidades: string | null;
  atualizadoEm: string;
  papel: "principal" | "aprovacao" | "apoio";
  /** Anotação de qualidade tirada do nome ("méd. conf.", "dado 1 ano"). */
  nota: string | null;
  fonte: string | null;
  fonteUrl: string | null;
  /** 1 baixa, 2 média, 3 alta. */
  confianca: number | null;
  verificadoEm: string | null;
  contatoErradoEm: string | null;
  contatoErradoMotivo: string | null;
}

export interface NecessidadeView {
  categoria: string;
  ultimaContratacao: string;
  valor: number;
  quantidadeContratos: number;
  objeto: string;
}

export interface InteracaoView {
  id: string;
  quando: string;
  resultado: string;
  observacao: string | null;
  contatoNome: string;
  contatoCargo: string;
}

/**
 * Contrato público do PNCP ligado a uma oportunidade (VinculoContrato), só pra
 * leitura no card e na gaveta: a decisão de confirmar ou descartar é do gestor
 * em /admin/contratos-detectados.
 */
export interface ContratoDetectadoView {
  numeroControlePncp: string;
  /** Vendedor só recebe "certo" e "forte"; "desvio" é alerta interno do gestor. */
  nivel: NivelVinculo;
  rotuloNivel: string;
  /** false = ainda sugerido pelo sistema, aguardando o gestor. */
  confirmado: boolean;
  /** Objeto resumido (o PNCP publica textos enormes e em caixa alta). */
  objeto: string;
  fornecedorNome: string | null;
  valorGlobal: number | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  /** Página pública do contrato no PNCP; null quando o número de controle não segue o padrão. */
  urlPncp: string | null;
}

/**
 * Instrução da adesão desta oportunidade (InstrucaoAdesao): o checklist do que
 * o órgão aderente precisa reunir e a declaração interna de conformidade que
 * libera o estágio "aderiu". A plataforma só organiza a informação; quem
 * decide é o órgão aderente, o órgão gerenciador e o fornecedor.
 */
export interface InstrucaoView {
  /** Já normalizado (normalizarMapa): só chaves conhecidas, esparso. */
  itens: MapaInstrucao;
  /** ISO; null = declaração ainda não registrada. */
  declaracaoEm: string | null;
  declaracaoPorTipo: "admin" | "vendedor" | null;
  declaracaoVersao: number | null;
  /** Justificativa de quem declarou com obrigatório pendente. */
  declaracaoExcecao: string | null;
  resumo: ResumoInstrucao;
}

export interface CartaoView {
  id: string;
  /** Ata e vendedor dono do card — o Pipeline do gestor mistura vários. */
  ataId: string;
  ataNumero: string;
  categoriaAta: string | null;
  vendedorNome: string | null;
  entidadeAlvoId: string;
  nomeMunicipio: string;
  uf: string | null;
  estagio: string;
  observacoes: string | null;
  prazoEm: string | null;
  proximoContatoEm: string | null;
  urgencia: { nivel: NivelUrgencia; rotulo: string };
  valorAderido: number | null;
  percentualComissao: number | null;
  percentualContrato: number | null;
  liquidado: number;
  comissaoDevida: number;
  comissaoRecebida: number;
  principal: ContatoView | null;
  semCanal: boolean;
  /** Dias desde a última atualização do contato principal (frescor). */
  frescorDias: number | null;
  contatos: ContatoView[];
  necessidades: NecessidadeView[];
  interacoes: InteracaoView[];
  /** Sinais de compra vigentes pra categoria da ata, mais relevante primeiro. */
  sinais: SinalView[];
  /** O município já contratou a categoria desta ata (raio-X). */
  casaComAta: boolean;
  /** Valor da última contratação da categoria — estimativa, não valor aderido. */
  valorEstimado: number | null;
  porQueAgora: string | null;
  /** Contrato público ligado a esta oportunidade (o mais firme, se houver mais de um). */
  contratoDetectado: ContratoDetectadoView | null;
  /** Quantos outros contratos visíveis estão ligados à mesma oportunidade. */
  outrosContratos: number;
  /** Instrução da adesão; null enquanto ninguém marcou nem declarou nada. */
  instrucao: InstrucaoView | null;
}

const MS_DIA = 24 * 60 * 60 * 1000;

export function diasDesde(iso: string, agora: Date = new Date()): number {
  return Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / MS_DIA));
}

export function mesesDesde(iso: string, agora: Date = new Date()): number {
  return Math.floor(diasDesde(iso, agora) / 30);
}

/** Barras de frescor do contato: 3 = atualizado no último mês, 2 = até 3 meses, 1 = mais antigo. */
export function nivelFrescor(dias: number | null): 1 | 2 | 3 {
  if (dias == null) return 1;
  if (dias <= 30) return 3;
  if (dias <= 90) return 2;
  return 1;
}

/** Texto curto de "há X": hoje, 3 dias, 2 meses. */
export function haQuantoTempo(iso: string, agora: Date = new Date()): string {
  const dias = diasDesde(iso, agora);
  if (dias === 0) return "hoje";
  if (dias < 45) return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
}

/**
 * Linha "por que agora" do card. Nesta fase só usa o que o sistema já sabe
 * (raio-X de consumo); sinais de compra reais (PCA, licitações abertas,
 * troca de gestão) entram pela tabela de sinais da etapa 4 e passam na frente.
 */
export function porQueAgoraDoRaioX(
  categoria: string | null,
  necessidade: NecessidadeView | undefined,
  agora: Date = new Date(),
): string | null {
  if (!categoria || !necessidade) return null;
  const meses = mesesDesde(necessidade.ultimaContratacao, agora);
  const rotulo = rotuloDaCategoria(categoria);
  if (meses >= 24) {
    return `Contratou ${rotulo.toLowerCase()} há ${meses} meses — necessidade recorrente em aberto`;
  }
  return `Contratou ${rotulo.toLowerCase()} há ${meses <= 1 ? "pouco tempo" : `${meses} meses`}`;
}

/** Contato como vem do banco (datas como Date), antes de virar ContatoView. */
export interface EntradaContato {
  id: string;
  cargo: string;
  area: string | null;
  nomeContato: string;
  telefone: string | null;
  email: string | null;
  particularidades: string | null;
  updatedAt: Date;
  fonte: string | null;
  fonteUrl: string | null;
  confianca: number | null;
  verificadoEm: Date | null;
  contatoErradoEm: Date | null;
  contatoErradoMotivo: string | null;
}

/**
 * Lista de contatos do município pronta pra tela: ordem de abordagem (pela
 * categoria da ata, ou administração primeiro sem categoria), principal na
 * frente, nome limpo das anotações de qualidade. Contato marcado como errado
 * continua na lista, sinalizado, mas nunca vira o principal.
 */
export function montarContatosView(
  contatosBanco: EntradaContato[],
  categoriaAta: string | null,
): { contatos: ContatoView[]; principal: ContatoView | null; semCanal: boolean } {
  const validos = contatosBanco.filter((c) => !c.contatoErradoEm);
  const { principal: principalBruto, semCanal } = escolherDecisorPrincipal(validos, categoriaAta);
  const ordenados = ordenarDecisores(contatosBanco, categoriaAta);

  const contatos: ContatoView[] = ordenados.map((c) => {
    const { nome, nota } = limparNomeContato(c.nomeContato);
    return {
      id: c.id,
      cargo: c.cargo,
      area: c.area,
      nomeContato: nome,
      nota,
      telefone: c.telefone,
      email: c.email,
      particularidades: c.particularidades,
      atualizadoEm: c.updatedAt.toISOString(),
      papel: papelDoContato(c.cargo, c.id === principalBruto?.id),
      fonte: c.fonte,
      fonteUrl: c.fonteUrl,
      confianca: c.confianca,
      verificadoEm: c.verificadoEm ? c.verificadoEm.toISOString() : null,
      contatoErradoEm: c.contatoErradoEm ? c.contatoErradoEm.toISOString() : null,
      contatoErradoMotivo: c.contatoErradoMotivo,
    };
  });
  const principal = contatos.find((c) => c.id === principalBruto?.id) ?? null;
  // O principal abre a lista; o resto segue a ordem de abordagem.
  if (principal) contatos.sort((a, b) => Number(b.id === principal.id) - Number(a.id === principal.id));
  return { contatos, principal, semCanal };
}

interface EntradaCartao {
  id: string;
  ataId?: string;
  ataNumero?: string;
  vendedorNome?: string;
  entidadeAlvoId: string;
  nomeMunicipio: string;
  uf: string | null;
  estagio: string;
  observacoes: string | null;
  prazoEm: Date | null;
  proximoContatoEm: Date | null;
  valorAderido: number | null;
  percentualComissao: number | null;
  contatos: EntradaContato[];
  sinais: SinalView[];
  necessidades: {
    categoria: string;
    ultimaContratacao: Date;
    valor: number;
    quantidadeContratos: number;
    objeto: string;
  }[];
  interacoes: {
    id: string;
    criadoEm: Date;
    resultado: string;
    observacao: string | null;
    contatoNome: string;
    contatoCargo: string;
  }[];
  liquidacoes: { valorLiquidado: number; statusCobranca: string }[];
  /** Vínculos com contratos públicos (opcional: sem acompanhamento, sem contratos). */
  contratos?: EntradaContratoDetectado[];
  /** Instrução da adesão como vem do banco (opcional: null/ausente = ainda não iniciada). */
  instrucao?: EntradaInstrucao | null;
}

/** InstrucaoAdesao como vem do banco: `itens` é o JSON cru, normalizado só em montarInstrucao. */
export interface EntradaInstrucao {
  itens: unknown;
  declaracaoEm: Date | null;
  declaracaoPorTipo: string | null;
  declaracaoVersao: number | null;
  declaracaoExcecao: string | null;
}

/** Vínculo + contrato como vêm do banco (datas como Date, dinheiro já em number). */
export interface EntradaContratoDetectado {
  nivel: string;
  status: string;
  numeroControlePncp: string;
  objeto: string;
  fornecedorNome: string | null;
  valorGlobal: number | null;
  vigenciaInicio: Date | null;
  vigenciaFim: Date | null;
  dataAssinatura: Date | null;
}

const TAMANHO_OBJETO_CONTRATO = 160;

/**
 * Status de vínculo que o card mostra: sugerido (aguardando o gestor) e
 * confirmado. O descartado nunca aparece, e um status fora do vocabulário
 * (dado estranho, ou um estado novo que ainda não foi pensado para o card)
 * também não: na dúvida, o card fica sem selo em vez de mostrar o que não se sabe.
 */
export const STATUS_VINCULO_VISIVEIS: readonly StatusVinculo[] = STATUS_VINCULO.filter((s) => s !== "descartado");

/**
 * Filtro da consulta em lote dos vínculos (kanban-db.ts): só as oportunidades
 * carregadas, só status e níveis que o leitor pode ver. Fica aqui, pura, para o
 * teste garantir que o "desvio" nem sai do banco quando o leitor é o vendedor.
 */
export function filtroDeVinculosVisiveis(oportunidadeIds: string[], verDesvio: boolean) {
  return {
    oportunidadeId: { in: oportunidadeIds },
    status: { in: [...STATUS_VINCULO_VISIVEIS] },
    nivel: { in: niveisDeVinculoVisiveis(verDesvio) },
  };
}

/**
 * Níveis de vínculo que o card pode mostrar. O vendedor só vê "certo" e
 * "forte"; "desvio" é um alerta interno do gestor (o município fechou com o
 * fornecedor parceiro sem passar pelo funil) e nunca chega a quem vende.
 */
export function niveisDeVinculoVisiveis(verDesvio: boolean): NivelVinculo[] {
  return NIVEIS_VINCULO.filter((n) => verDesvio || n !== "desvio");
}

function nivelValido(valor: string): valor is NivelVinculo {
  return (NIVEIS_VINCULO as readonly string[]).includes(valor);
}

/** Mais recente primeiro; sem data vai para o fim (comparação explícita, sem subtrair infinitos). */
function maisRecentePrimeiro(a: Date | null, b: Date | null): number {
  const ta = a ? a.getTime() : null;
  const tb = b ? b.getTime() : null;
  if (ta === tb) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return tb - ta;
}

/**
 * O PNCP já publicou contrato municipal com valor na casa do trilhão (erro de
 * digitação do órgão). Acima disso, e também zero ou negativo, o valor não é
 * mostrado: "não informado" é mais honesto que um número absurdo. Mesmo teto de
 * sinais-preditivos.ts.
 */
const VALOR_MAXIMO_PLAUSIVEL_CONTRATO = 5_000_000_000;

function valorGlobalPlausivel(valor: number | null): number | null {
  if (valor === null || !Number.isFinite(valor)) return null;
  return valor > 0 && valor <= VALOR_MAXIMO_PLAUSIVEL_CONTRATO ? valor : null;
}

/**
 * Entre os vínculos da oportunidade, descarta o que o gestor descartou e o que
 * este leitor não pode ver; o primeiro da fila é o mais firme: confirmado antes
 * de sugerido, depois nível certo antes de forte, depois o assinado mais
 * recentemente. Devolve também quantos outros ficaram de fora do card.
 */
export function escolherContratoDetectado(
  contratos: EntradaContratoDetectado[],
  verDesvio: boolean,
): { escolhido: EntradaContratoDetectado | null; outros: number } {
  const visiveis = niveisDeVinculoVisiveis(verDesvio) as string[];
  const candidatos = contratos.filter(
    (c) =>
      (STATUS_VINCULO_VISIVEIS as readonly string[]).includes(c.status) &&
      nivelValido(c.nivel) &&
      visiveis.includes(c.nivel),
  );
  if (candidatos.length === 0) return { escolhido: null, outros: 0 };

  const ordenados = [...candidatos].sort(
    (a, b) =>
      Number(b.status === "confirmado") - Number(a.status === "confirmado") ||
      NIVEIS_VINCULO.indexOf(a.nivel as NivelVinculo) - NIVEIS_VINCULO.indexOf(b.nivel as NivelVinculo) ||
      maisRecentePrimeiro(a.dataAssinatura, b.dataAssinatura) ||
      a.numeroControlePncp.localeCompare(b.numeroControlePncp),
  );
  return { escolhido: ordenados[0], outros: ordenados.length - 1 };
}

function montarContratoDetectado(c: EntradaContratoDetectado): ContratoDetectadoView {
  const nivel = c.nivel as NivelVinculo;
  return {
    numeroControlePncp: c.numeroControlePncp,
    nivel,
    rotuloNivel: ROTULO_NIVEL_VINCULO[nivel],
    confirmado: c.status === "confirmado",
    objeto: resumir(c.objeto, TAMANHO_OBJETO_CONTRATO) || "Objeto não informado",
    // O script grava a razão social como o PNCP publica; o MEI carrega o CPF
    // dele nela, e isso não vai para a tela de quem vende.
    fornecedorNome: nomeFornecedorPublico(c.fornecedorNome),
    valorGlobal: valorGlobalPlausivel(c.valorGlobal),
    vigenciaInicio: c.vigenciaInicio ? c.vigenciaInicio.toISOString() : null,
    vigenciaFim: c.vigenciaFim ? c.vigenciaFim.toISOString() : null,
    urlPncp: urlContratoPncp(c.numeroControlePncp),
  };
}

/**
 * Instrução da oportunidade pronta para a tela. O JSON do banco é lido com
 * normalizarMapa (nunca se confia nele) e o resumo vem de resumirInstrucao,
 * então a regra de "o que falta" é uma só. Sem linha no banco, null.
 */
export function montarInstrucao(entrada: EntradaInstrucao | null | undefined): InstrucaoView | null {
  if (!entrada) return null;
  const itens = normalizarMapa(entrada.itens);
  const em = entrada.declaracaoEm;
  const declaracaoEm = em instanceof Date && !Number.isNaN(em.getTime()) ? em.toISOString() : null;
  const por = entrada.declaracaoPorTipo;
  const versao = entrada.declaracaoVersao;
  return {
    itens,
    declaracaoEm,
    declaracaoPorTipo: por === "admin" || por === "vendedor" ? por : null,
    declaracaoVersao: typeof versao === "number" && Number.isInteger(versao) ? versao : null,
    declaracaoExcecao: entrada.declaracaoExcecao?.trim() || null,
    resumo: resumirInstrucao(itens),
  };
}

/** Selo do card: confirmado pelo gestor ou ainda só sugerido pelo sistema. */
export function seloDoContrato(contrato: Pick<ContratoDetectadoView, "confirmado">): {
  tom: "marca" | "atencao";
  rotulo: string;
  dica: string;
} {
  return contrato.confirmado
    ? {
        tom: "marca",
        rotulo: "Contrato detectado",
        dica: "Contrato público do PNCP ligado a esta negociação e confirmado pelo gestor.",
      }
    : {
        tom: "atencao",
        rotulo: "Contrato a confirmar",
        dica: "O sistema encontrou um contrato público possivelmente ligado a esta negociação. O gestor ainda vai confirmar.",
      };
}

/** "vigência de 01/03/2026 a 28/02/2027", ou só o que se sabe; sem datas, avisa. */
export function descreverVigencia(inicio: string | null, fim: string | null): string {
  if (inicio && fim) return `Vigência de ${dataCurtaUtc(inicio)} a ${dataCurtaUtc(fim)}`;
  if (fim) return `Vigência até ${dataCurtaUtc(fim)}`;
  if (inicio) return `Vigência desde ${dataCurtaUtc(inicio)}`;
  return "Vigência não informada";
}

/**
 * Sinal específico primeiro; depois o raio-X da categoria; por último o
 * contexto de orçamento. Contrato/PCA sem categoria nunca vira a linha.
 */
function porQueAgora(
  sinais: SinalView[],
  categoria: string | null,
  necessidade: NecessidadeView | undefined,
  agora: Date,
): string | null {
  const especifico = sinais.find((s) => !sinalGenerico(s));
  if (especifico) return especifico.titulo;
  return porQueAgoraDoRaioX(categoria, necessidade, agora) ?? sinais.find((s) => s.tipo === "orcamento")?.titulo ?? null;
}

export function montarCartao(
  entrada: EntradaCartao,
  contexto: {
    categoriaAta: string | null;
    percentualContrato: number | null;
    /** Só o gestor enxerga vínculo de nível "desvio"; o vendedor nunca. */
    verDesvio?: boolean;
  },
  agora: Date = new Date(),
): CartaoView {
  const { contatos, principal, semCanal } = montarContatosView(entrada.contatos, contexto.categoriaAta);

  const necessidades: NecessidadeView[] = entrada.necessidades.map((n) => ({
    categoria: n.categoria,
    ultimaContratacao: n.ultimaContratacao.toISOString(),
    valor: n.valor,
    quantidadeContratos: n.quantidadeContratos,
    objeto: n.objeto,
  }));
  const daCategoria = necessidades.find((n) => n.categoria === contexto.categoriaAta);

  const sinais = sinaisRelevantes(entrada.sinais, contexto.categoriaAta, agora);
  const urgencia = calcularUrgencia(entrada.prazoEm, agora);
  const percentual = entrada.percentualComissao ?? 0;
  const resumo = resumirComissao(entrada.liquidacoes, percentual);
  const { escolhido: contrato, outros: outrosContratos } = escolherContratoDetectado(
    entrada.contratos ?? [],
    contexto.verDesvio === true,
  );

  return {
    id: entrada.id,
    ataId: entrada.ataId ?? "",
    ataNumero: entrada.ataNumero ?? "",
    categoriaAta: contexto.categoriaAta,
    vendedorNome: entrada.vendedorNome ?? null,
    entidadeAlvoId: entrada.entidadeAlvoId,
    nomeMunicipio: entrada.nomeMunicipio,
    uf: entrada.uf,
    estagio: entrada.estagio,
    observacoes: entrada.observacoes,
    prazoEm: entrada.prazoEm ? entrada.prazoEm.toISOString() : null,
    proximoContatoEm: entrada.proximoContatoEm ? entrada.proximoContatoEm.toISOString() : null,
    urgencia: { nivel: urgencia.nivel, rotulo: urgencia.rotulo },
    valorAderido: entrada.valorAderido,
    percentualComissao: entrada.percentualComissao,
    percentualContrato: contexto.percentualContrato,
    liquidado: entrada.liquidacoes.reduce((s, l) => s + l.valorLiquidado, 0),
    comissaoDevida: resumo.devida,
    comissaoRecebida: resumo.recebida,
    principal,
    semCanal,
    frescorDias: principal ? diasDesde(principal.verificadoEm ?? principal.atualizadoEm, agora) : null,
    contatos,
    necessidades,
    interacoes: entrada.interacoes
      .map((i) => ({
        id: i.id,
        quando: i.criadoEm.toISOString(),
        resultado: i.resultado,
        observacao: i.observacao,
        contatoNome: i.contatoNome,
        contatoCargo: i.contatoCargo,
      }))
      .sort((a, b) => b.quando.localeCompare(a.quando)),
    casaComAta: Boolean(daCategoria),
    valorEstimado: daCategoria ? daCategoria.valor : null,
    sinais,
    porQueAgora: porQueAgora(sinais, contexto.categoriaAta, daCategoria, agora),
    contratoDetectado: contrato ? montarContratoDetectado(contrato) : null,
    outrosContratos,
    instrucao: montarInstrucao(entrada.instrucao),
  };
}

/** Totais de uma coluna: contagem + soma (aderido nas finais, estimado nas abertas). */
export function totalDaColuna(cartoes: CartaoView[], estagio: string): number | null {
  if (estagio === "aderiu") {
    return cartoes.reduce((s, c) => s + (c.valorAderido ?? 0), 0);
  }
  if (estagio === "em_negociacao" || estagio === "a_contatar") {
    const estimados = cartoes.filter((c) => c.valorEstimado != null);
    return estimados.length ? estimados.reduce((s, c) => s + (c.valorEstimado ?? 0), 0) : null;
  }
  return null;
}
