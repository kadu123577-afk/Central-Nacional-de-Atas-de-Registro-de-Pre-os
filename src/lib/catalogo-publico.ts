import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { type NivelVisao } from "@/lib/visibilidade";
import {
  GRUPOS,
  TODOS_OS_SLUGS_MAPEADOS,
  grupoDaCategoria,
  grupoValido,
  slugsDoGrupo,
} from "@/lib/site/categorias";
import { dataBR, normalizar } from "@/lib/site/formato";
import {
  DIA_MS,
  codigoPublico,
  diasAte,
  saldoDoItem,
  saldoMedio,
  vigenciaCompleta,
  vigenciaPublica,
  type ExibicaoVigencia,
} from "@/lib/site/regras";

/**
 * Consultas da vitrine pública. Toda saída passa por aqui e é moldada pelo
 * nível de visão (src/lib/visibilidade.ts). Nenhuma página da vitrine deve
 * consultar o Prisma diretamente.
 *
 * Regra de ouro: o visitante recebe SÓ categoria, objeto e um código. UF,
 * itens, quantidades, saldo e vigência ficam de fora, porque qualquer um
 * deles, somado ao objeto, basta para achar a ata no PNCP e contratar direto
 * com o fornecedor, sem passar pela plataforma (e sem a comissão). Isso vale
 * também para filtros e buscas: filtrar por UF ou buscar por item serviria
 * para descobrir esses dados por tentativa, então só existem para quem tem
 * nível "orgao" ou "completo". Os campos restritos nem são lidos do banco
 * para o visitante.
 */

export const POR_PAGINA = 12;

/** Em ambiente de demonstração, os dados de demonstração (isSeed) também aparecem. */
function incluirDemonstracao(): boolean {
  return process.env.AMBIENTE_DEMONSTRACAO === "true";
}

function baseAtasVigentes(): Prisma.AtaWhereInput {
  return {
    status: "APROVADA",
    dataVigenciaFim: { gte: new Date() },
    ...(incluirDemonstracao() ? {} : { isSeed: false }),
  };
}

/** Órgão logado e equipe veem detalhes (UF, vigência, itens). O visitante, não. */
function comDetalhes(nivel: NivelVisao): boolean {
  return nivel !== "publico";
}

// ---------------------------------------------------------------------------
// Tipos entregues às páginas
// ---------------------------------------------------------------------------

export interface AtaResumo {
  id: string;
  /** Visitante e órgão: código público derivado. Equipe: número real da ata. */
  codigo: string;
  grupoId: string;
  objeto: string;
  /** A partir daqui, só órgão logado e equipe (nunca o visitante). */
  uf?: string;
  nItens?: number;
  /** 0 a 1. */
  saldoMedio?: number;
  vigencia?: ExibicaoVigencia;
  /** Presente quando há busca: quantos itens batem e o primeiro. */
  correspondencia?: { total: number; primeiro: string };
  /** Só equipe. */
  orgao?: string;
  fornecedor?: string;
}

export interface ItemDaAta {
  id: string;
  descricao: string;
  unidade: string;
  /** 0 a 1. */
  saldo: number;
  /** Só equipe. */
  quantidade?: number;
  preco?: number;
}

export interface AtaDetalhe extends AtaResumo {
  /** Vazio para o visitante. */
  itens: ItemDaAta[];
  nItensTotal?: number;
  conferidaEm?: string;
  /** Só equipe. */
  inicio?: string;
  fim?: string;
  diasRestantes?: number;
  numeroPncp?: string | null;
  documentos?: { id: string; nome: string }[];
  relacionadas: AtaResumo[];
}

export type Ordenacao = "recentes" | "vigencia" | "itens" | "saldo";

export interface FiltrosCatalogo {
  q?: string;
  grupo?: string;
  /** Ignorado para o visitante. */
  uf?: string;
  /** Ignorado para o visitante. */
  vigMeses?: number;
  /** Só vale para a equipe. */
  valorMax?: number;
  /** Para o visitante a ordem é sempre "recentes". */
  ord?: Ordenacao;
  pagina?: number;
}

export interface ResultadoCatalogo {
  atas: AtaResumo[];
  total: number;
  pagina: number;
  paginas: number;
}

// ---------------------------------------------------------------------------
// Montagem do filtro e do select
// ---------------------------------------------------------------------------

function filtroDoGrupo(grupo: string): Prisma.AtaWhereInput {
  if (grupo === "outros") {
    return {
      OR: [{ categoria: null }, { categoria: { notIn: TODOS_OS_SLUGS_MAPEADOS } }],
    };
  }
  return { categoria: { in: slugsDoGrupo(grupo) } };
}

function montarWhere(f: FiltrosCatalogo, nivel: NivelVisao): Prisma.AtaWhereInput {
  const condicoes: Prisma.AtaWhereInput[] = [baseAtasVigentes()];
  const detalhes = comDetalhes(nivel);

  if (f.grupo && grupoValido(f.grupo)) condicoes.push(filtroDoGrupo(f.grupo));
  if (detalhes && f.uf) condicoes.push({ orgaoGerenciador: { uf: f.uf } });
  if (detalhes && f.vigMeses && f.vigMeses > 0) {
    condicoes.push({ dataVigenciaFim: { gte: new Date(Date.now() + f.vigMeses * 30 * DIA_MS) } });
  }
  if (nivel === "completo" && f.valorMax && f.valorMax > 0) {
    condicoes.push({ itens: { some: { valorUnitario: { lte: new Prisma.Decimal(f.valorMax) } } } });
  }

  const q = f.q?.trim();
  if (q) {
    const gruposPeloNome = GRUPOS.filter((g) => normalizar(g.nome).includes(normalizar(q))).map(
      (g) => filtroDoGrupo(g.id),
    );
    const buscas: Prisma.AtaWhereInput[] = [
      { objeto: { contains: q, mode: "insensitive" } },
      ...gruposPeloNome,
    ];
    // Buscar por item mostraria, por tentativa, o que há dentro de cada ata.
    if (detalhes) {
      buscas.push({ itens: { some: { descricao: { contains: q, mode: "insensitive" } } } });
    }
    // Só a equipe busca por órgão, fornecedor ou número: do contrário a busca
    // viraria um jeito de descobrir quem é o fornecedor de uma ata.
    if (nivel === "completo") {
      buscas.push(
        { numero: { contains: q, mode: "insensitive" } },
        { orgaoGerenciador: { nome: { contains: q, mode: "insensitive" } } },
        { fornecedor: { razaoSocial: { contains: q, mode: "insensitive" } } },
      );
    }
    condicoes.push({ OR: buscas });
  }

  return { AND: condicoes };
}

/** Linha como volta do banco: campos além de id/categoria/objeto só existem conforme o nível. */
interface AtaSelecionada {
  id: string;
  categoria: string | null;
  objeto: string;
  dataVigenciaFim?: Date;
  numero?: string;
  fornecedor?: { razaoSocial: string };
  orgaoGerenciador?: { uf: string; nome?: string };
  itens?: { quantidadeRegistrada: number; descricao?: string; saldo: { quantidadeConsumida: number } | null }[];
}

function selecionar(nivel: NivelVisao, comBusca: boolean) {
  const completo = nivel === "completo";
  const base = { id: true, categoria: true, objeto: true } as const;
  // O visitante recebe só o essencial: nada de UF, vigência nem itens.
  if (!comDetalhes(nivel)) return base;
  return {
    ...base,
    dataVigenciaFim: true,
    ...(completo ? { numero: true } : {}),
    orgaoGerenciador: { select: completo ? { uf: true, nome: true } : { uf: true } },
    ...(completo ? { fornecedor: { select: { razaoSocial: true } } } : {}),
    itens: {
      select: {
        quantidadeRegistrada: true,
        ...(comBusca ? { descricao: true } : {}),
        saldo: { select: { quantidadeConsumida: true } },
      },
    },
  } satisfies Prisma.AtaSelect;
}

function exibirVigencia(fim: Date, nivel: NivelVisao): ExibicaoVigencia {
  const dias = diasAte(fim);
  return nivel === "completo" ? vigenciaCompleta(fim, dias, dataBR) : vigenciaPublica(dias);
}

function paraResumo(ata: AtaSelecionada, nivel: NivelVisao, q?: string): AtaResumo {
  const completo = nivel === "completo";
  const resumo: AtaResumo = {
    id: ata.id,
    codigo: completo && ata.numero ? ata.numero : codigoPublico(ata.id),
    grupoId: grupoDaCategoria(ata.categoria),
    objeto: ata.objeto,
  };
  if (!comDetalhes(nivel)) return resumo;

  const itens = ata.itens ?? [];
  const saldos = itens.map((i) => saldoDoItem(i.quantidadeRegistrada, i.saldo?.quantidadeConsumida ?? 0));
  resumo.uf = ata.orgaoGerenciador?.uf;
  resumo.nItens = itens.length;
  resumo.saldoMedio = saldoMedio(saldos);
  if (ata.dataVigenciaFim) resumo.vigencia = exibirVigencia(ata.dataVigenciaFim, nivel);

  const nq = normalizar(q);
  if (nq) {
    const batem = itens.filter((i) => normalizar(i.descricao).includes(nq));
    if (batem.length > 0) resumo.correspondencia = { total: batem.length, primeiro: batem[0].descricao ?? "" };
  }
  if (completo) {
    resumo.orgao = ata.orgaoGerenciador?.nome;
    resumo.fornecedor = ata.fornecedor?.razaoSocial;
  }
  return resumo;
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export async function listarAtas(f: FiltrosCatalogo, nivel: NivelVisao): Promise<ResultadoCatalogo> {
  const where = montarWhere(f, nivel);
  const detalhes = comDetalhes(nivel);
  // Ordenar por vigência, itens ou saldo ordenaria atas por dados que o
  // visitante não pode ver (e permitiria deduzi-los). Para ele: só "recentes".
  const ord: Ordenacao = detalhes ? (f.ord ?? "recentes") : "recentes";
  const comBusca = Boolean(f.q?.trim());
  const select = selecionar(nivel, comBusca && detalhes);

  const total = await prisma.ata.count({ where });
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(Math.max(1, f.pagina ?? 1), paginas);
  const skip = (pagina - 1) * POR_PAGINA;

  let atas: AtaSelecionada[];

  if (ord === "saldo") {
    // Saldo é calculado a partir dos itens, então a ordenação acontece em
    // memória: busca só o necessário de todas as atas do filtro, ordena e
    // pagina; depois lê os dados completos só da página.
    const leves = await prisma.ata.findMany({
      where,
      select: {
        id: true,
        itens: { select: { quantidadeRegistrada: true, saldo: { select: { quantidadeConsumida: true } } } },
      },
    });
    const ids = leves
      .map((a) => ({
        id: a.id,
        saldo: saldoMedio(
          a.itens.map((i) => saldoDoItem(i.quantidadeRegistrada, i.saldo?.quantidadeConsumida ?? 0)),
        ),
      }))
      .sort((a, b) => b.saldo - a.saldo)
      .slice(skip, skip + POR_PAGINA)
      .map((x) => x.id);
    const registros = (await prisma.ata.findMany({ where: { id: { in: ids } }, select })) as AtaSelecionada[];
    atas = ids.map((id) => registros.find((r) => r.id === id)).filter((r): r is AtaSelecionada => Boolean(r));
  } else {
    const orderBy: Prisma.AtaOrderByWithRelationInput =
      ord === "vigencia"
        ? { dataVigenciaFim: "desc" }
        : ord === "itens"
          ? { itens: { _count: "desc" } }
          : { createdAt: "desc" };
    atas = (await prisma.ata.findMany({ where, select, orderBy, skip, take: POR_PAGINA })) as AtaSelecionada[];
  }

  return {
    atas: atas.map((a) => paraResumo(a, nivel, f.q)),
    total,
    pagina,
    paginas,
  };
}

// ---------------------------------------------------------------------------
// Detalhe de uma ata
// ---------------------------------------------------------------------------

export const obterAta = cache(obterAtaSemCache);

async function obterAtaSemCache(id: string, nivel: NivelVisao): Promise<AtaDetalhe | null> {
  const completo = nivel === "completo";

  const relacionadasDe = async (categoria: string | null) =>
    (
      (await prisma.ata.findMany({
        where: {
          AND: [baseAtasVigentes(), filtroDoGrupo(grupoDaCategoria(categoria)), { id: { not: id } }],
        },
        select: selecionar(nivel, false),
        orderBy: { createdAt: "desc" },
        take: 3,
      })) as AtaSelecionada[]
    ).map((r) => paraResumo(r, nivel));

  // Visitante: só objeto e categoria. Nada de itens, UF, saldo nem vigência.
  if (!comDetalhes(nivel)) {
    const basica = await prisma.ata.findFirst({
      where: { AND: [{ id }, baseAtasVigentes()] },
      select: { id: true, categoria: true, objeto: true },
    });
    if (!basica) return null;
    return {
      id: basica.id,
      codigo: codigoPublico(basica.id),
      grupoId: grupoDaCategoria(basica.categoria),
      objeto: basica.objeto,
      itens: [],
      relacionadas: await relacionadasDe(basica.categoria),
    };
  }

  const ata = await prisma.ata.findFirst({
    where: { AND: [{ id }, baseAtasVigentes()] },
    select: {
      id: true,
      categoria: true,
      objeto: true,
      dataVigenciaFim: true,
      updatedAt: true,
      ...(completo
        ? {
            numero: true,
            dataAssinatura: true,
            numeroControlePncp: true,
            fornecedor: { select: { razaoSocial: true } },
            documentos: { select: { id: true, nomeArquivo: true } },
          }
        : {}),
      orgaoGerenciador: { select: completo ? { uf: true, nome: true } : { uf: true } },
      itens: {
        orderBy: { descricao: "asc" },
        select: {
          id: true,
          descricao: true,
          unidade: true,
          quantidadeRegistrada: true,
          ...(completo ? { valorUnitario: true } : {}),
          saldo: { select: { quantidadeConsumida: true } },
        },
      },
    },
  });
  if (!ata) return null;

  type AtaCompleta = typeof ata & {
    numero?: string;
    dataAssinatura?: Date;
    numeroControlePncp?: string | null;
    fornecedor?: { razaoSocial: string };
    documentos?: { id: string; nomeArquivo: string }[];
    orgaoGerenciador: { uf: string; nome?: string };
    itens: ((typeof ata)["itens"][number] & { valorUnitario?: Prisma.Decimal })[];
  };
  const a = ata as AtaCompleta;

  const itens: ItemDaAta[] = a.itens.map((i) => ({
    id: i.id,
    descricao: i.descricao,
    unidade: i.unidade,
    saldo: saldoDoItem(i.quantidadeRegistrada, i.saldo?.quantidadeConsumida ?? 0),
    ...(completo
      ? { quantidade: i.quantidadeRegistrada, preco: i.valorUnitario ? Number(i.valorUnitario) : undefined }
      : {}),
  }));

  return {
    id: a.id,
    codigo: completo && a.numero ? a.numero : codigoPublico(a.id),
    grupoId: grupoDaCategoria(a.categoria),
    uf: a.orgaoGerenciador.uf,
    objeto: a.objeto,
    nItens: itens.length,
    saldoMedio: saldoMedio(itens.map((i) => i.saldo)),
    vigencia: exibirVigencia(a.dataVigenciaFim, nivel),
    itens,
    nItensTotal: itens.length,
    conferidaEm: dataBR(a.updatedAt),
    relacionadas: await relacionadasDe(a.categoria),
    ...(completo
      ? {
          orgao: a.orgaoGerenciador.nome,
          fornecedor: a.fornecedor?.razaoSocial,
          inicio: a.dataAssinatura ? dataBR(a.dataAssinatura) : undefined,
          fim: dataBR(a.dataVigenciaFim),
          diasRestantes: diasAte(a.dataVigenciaFim),
          numeroPncp: a.numeroControlePncp ?? null,
          documentos: (a.documentos ?? []).map((d) => ({ id: d.id, nome: d.nomeArquivo })),
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Home e menus (sempre no nível do visitante: só categoria, objeto e totais)
// ---------------------------------------------------------------------------

export interface ResumoHome {
  /** Só o total de atas e de categorias com ata: nada por UF, item nem saldo. */
  totalAtas: number;
  totalCategorias: number;
  atualizadoEm: string;
  recentes: AtaResumo[];
  /** Uma ata para o cartão de destaque (só objeto e categoria). */
  destaque: AtaResumo | null;
  porGrupo: Record<string, number>;
}

/** Contagem de atas vigentes por grupo de categoria (para menus e home). */
export async function contagensVigentes(): Promise<{
  porGrupo: Record<string, number>;
  total: number;
}> {
  const linhas = await prisma.ata.findMany({
    where: baseAtasVigentes(),
    select: { categoria: true },
  });
  const porGrupo: Record<string, number> = {};
  for (const l of linhas) {
    const g = grupoDaCategoria(l.categoria);
    porGrupo[g] = (porGrupo[g] ?? 0) + 1;
  }
  return { porGrupo, total: linhas.length };
}

export async function resumoHome(): Promise<ResumoHome> {
  const nivel: NivelVisao = "publico";
  const [contagens, recentes] = await Promise.all([
    contagensVigentes(),
    prisma.ata.findMany({
      where: baseAtasVigentes(),
      select: selecionar(nivel, false),
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);
  const lista = (recentes as AtaSelecionada[]).map((r) => paraResumo(r, nivel));

  return {
    totalAtas: contagens.total,
    totalCategorias: Object.keys(contagens.porGrupo).length,
    atualizadoEm: dataBR(new Date()),
    recentes: lista,
    destaque: lista[0] ?? null,
    porGrupo: contagens.porGrupo,
  };
}
