import { calcularUrgencia, type NivelUrgencia } from "./urgencia";
import { escolherDecisorPrincipal, ordenarDecisores, papelDoContato } from "./decisores";
import { rotuloDaCategoria } from "./categorias";
import { resumirComissao } from "./recebiveis";

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

export interface CartaoView {
  id: string;
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
  /** O município já contratou a categoria desta ata (raio-X). */
  casaComAta: boolean;
  /** Valor da última contratação da categoria — estimativa, não valor aderido. */
  valorEstimado: number | null;
  porQueAgora: string | null;
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

interface EntradaCartao {
  id: string;
  entidadeAlvoId: string;
  nomeMunicipio: string;
  uf: string | null;
  estagio: string;
  observacoes: string | null;
  prazoEm: Date | null;
  proximoContatoEm: Date | null;
  valorAderido: number | null;
  percentualComissao: number | null;
  contatos: {
    id: string;
    cargo: string;
    area: string | null;
    nomeContato: string;
    telefone: string | null;
    email: string | null;
    particularidades: string | null;
    updatedAt: Date;
  }[];
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
}

export function montarCartao(
  entrada: EntradaCartao,
  contexto: { categoriaAta: string | null; percentualContrato: number | null },
  agora: Date = new Date(),
): CartaoView {
  const { principal: principalBruto, semCanal } = escolherDecisorPrincipal(entrada.contatos, contexto.categoriaAta);
  const ordenados = ordenarDecisores(entrada.contatos, contexto.categoriaAta);

  const contatos: ContatoView[] = ordenados.map((c) => ({
    id: c.id,
    cargo: c.cargo,
    area: c.area,
    nomeContato: c.nomeContato,
    telefone: c.telefone,
    email: c.email,
    particularidades: c.particularidades,
    atualizadoEm: c.updatedAt.toISOString(),
    papel: papelDoContato(c.cargo, c.id === principalBruto?.id),
  }));
  const principal = contatos.find((c) => c.id === principalBruto?.id) ?? null;
  // O principal abre a lista na gaveta; o resto segue a ordem de abordagem.
  if (principal) contatos.sort((a, b) => Number(b.id === principal.id) - Number(a.id === principal.id));

  const necessidades: NecessidadeView[] = entrada.necessidades.map((n) => ({
    categoria: n.categoria,
    ultimaContratacao: n.ultimaContratacao.toISOString(),
    valor: n.valor,
    quantidadeContratos: n.quantidadeContratos,
    objeto: n.objeto,
  }));
  const daCategoria = necessidades.find((n) => n.categoria === contexto.categoriaAta);

  const urgencia = calcularUrgencia(entrada.prazoEm, agora);
  const percentual = entrada.percentualComissao ?? 0;
  const resumo = resumirComissao(entrada.liquidacoes, percentual);

  return {
    id: entrada.id,
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
    frescorDias: principal ? diasDesde(principal.atualizadoEm, agora) : null,
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
    porQueAgora: porQueAgoraDoRaioX(contexto.categoriaAta, daCategoria, agora),
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
