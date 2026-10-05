import { calcularUrgencia } from "./urgencia";
import { resumirComissao } from "./recebiveis";

/**
 * Painel do vendedor (fase 2 de design, 2026-10-04): indicadores, funil por
 * valor e "o que fazer hoje" a partir das oportunidades dele. Função pura —
 * o carregamento do banco fica em painel-vendedor-db.ts.
 */
export interface LinhaOportunidade {
  oportunidadeId: string;
  ataId: string;
  ataNumero: string;
  ataCategoria: string | null;
  fornecedor: string;
  municipio: string;
  uf: string | null;
  estagio: string;
  prazoEm: Date | null;
  proximoContatoEm: Date | null;
  valorAderido: number | null;
  percentualComissao: number | null;
  valorEstimado: number | null;
  semCanal: boolean;
  liquidacoes: { valorLiquidado: number; statusCobranca: string }[];
}

export interface Tarefa {
  oportunidadeId: string;
  ataId: string;
  ataNumero: string;
  municipio: string;
  uf: string | null;
  motivo: string;
  nivel: "critico" | "atencao";
}

export interface PainelVendedor {
  kpis: {
    aderido: number;
    aderidos: number;
    comissaoDevida: number;
    comissaoRecebida: number;
    emNegociacao: number;
    potencial: number;
    vencendo: number;
    semContato: number;
    abertos: number;
  };
  funil: { estagio: string; quantidade: number; valor: number; estimado: boolean }[];
  tarefas: Tarefa[];
  atas: {
    ataId: string;
    ataNumero: string;
    categoria: string | null;
    fornecedor: string;
    aderidas: number;
    total: number;
    valorFechado: number;
    valorEmAberto: number;
  }[];
}

const ABERTOS = ["a_contatar", "em_negociacao"];
const MS_DIA = 24 * 60 * 60 * 1000;

export function montarPainel(linhas: LinhaOportunidade[], agora: Date = new Date()): PainelVendedor {
  const abertas = linhas.filter((l) => ABERTOS.includes(l.estagio));
  const aderidas = linhas.filter((l) => l.estagio === "aderiu");

  const comissoes = aderidas.map((l) => resumirComissao(l.liquidacoes, l.percentualComissao ?? 0));

  const kpis = {
    aderido: aderidas.reduce((s, l) => s + (l.valorAderido ?? 0), 0),
    aderidos: aderidas.length,
    comissaoDevida: comissoes.reduce((s, c) => s + c.devida, 0),
    comissaoRecebida: comissoes.reduce((s, c) => s + c.recebida, 0),
    emNegociacao: linhas.filter((l) => l.estagio === "em_negociacao").length,
    potencial: abertas.reduce((s, l) => s + (l.valorEstimado ?? 0), 0),
    vencendo: abertas.filter((l) => calcularUrgencia(l.prazoEm, agora).nivel === "critico").length,
    semContato: abertas.filter((l) => l.semCanal).length,
    abertos: abertas.length,
  };

  const estagios: { id: string; estimado: boolean }[] = [
    { id: "a_contatar", estimado: true },
    { id: "em_negociacao", estimado: true },
    { id: "aderiu", estimado: false },
    { id: "recusado", estimado: false },
  ];
  const funil = estagios.map(({ id, estimado }) => {
    const doEstagio = linhas.filter((l) => l.estagio === id);
    const valor = doEstagio.reduce((s, l) => s + (id === "aderiu" ? (l.valorAderido ?? 0) : (l.valorEstimado ?? 0)), 0);
    return { estagio: id, quantidade: doEstagio.length, valor: id === "recusado" ? 0 : valor, estimado };
  });

  const tarefas: (Tarefa & { peso: number })[] = [];
  for (const l of abertas) {
    const base = {
      oportunidadeId: l.oportunidadeId,
      ataId: l.ataId,
      ataNumero: l.ataNumero,
      municipio: l.municipio,
      uf: l.uf,
    };
    const urgencia = calcularUrgencia(l.prazoEm, agora);
    if (urgencia.nivel === "critico") {
      tarefas.push({ ...base, motivo: `${urgencia.rotulo} — avance a negociação`, nivel: "critico", peso: urgencia.dias ?? 0 });
    } else if (l.proximoContatoEm && l.proximoContatoEm.getTime() <= agora.getTime() + MS_DIA) {
      tarefas.push({ ...base, motivo: "Retorno agendado para hoje ou atrasado", nivel: "atencao", peso: 10 });
    } else if (l.semCanal) {
      tarefas.push({ ...base, motivo: "Sem decisor com telefone ou e-mail — buscar contato", nivel: "atencao", peso: 20 });
    }
  }
  tarefas.sort((a, b) => (a.nivel === b.nivel ? a.peso - b.peso : a.nivel === "critico" ? -1 : 1));

  const porAta = new Map<string, PainelVendedor["atas"][number]>();
  for (const l of linhas) {
    const atual = porAta.get(l.ataId) ?? {
      ataId: l.ataId,
      ataNumero: l.ataNumero,
      categoria: l.ataCategoria,
      fornecedor: l.fornecedor,
      aderidas: 0,
      total: 0,
      valorFechado: 0,
      valorEmAberto: 0,
    };
    atual.total += 1;
    if (l.estagio === "aderiu") {
      atual.aderidas += 1;
      atual.valorFechado += l.valorAderido ?? 0;
    } else if (ABERTOS.includes(l.estagio)) {
      atual.valorEmAberto += l.valorEstimado ?? 0;
    }
    porAta.set(l.ataId, atual);
  }

  return {
    kpis,
    funil,
    tarefas: tarefas.slice(0, 10).map((t) => ({
      oportunidadeId: t.oportunidadeId,
      ataId: t.ataId,
      ataNumero: t.ataNumero,
      municipio: t.municipio,
      uf: t.uf,
      motivo: t.motivo,
      nivel: t.nivel,
    })),
    atas: [...porAta.values()],
  };
}
