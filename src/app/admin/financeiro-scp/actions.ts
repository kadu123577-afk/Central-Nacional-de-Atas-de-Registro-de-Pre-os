"use server";

import { revalidatePath } from "next/cache";
import { exigirAcessoFinanceiro } from "@/lib/acesso-financeiro";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  centavosParaDecimal,
  formatarReais,
  fracaoParaDecimal,
  hojeEmSaoPaulo,
  interpretarPercentualParticipacao,
  reaisParaCentavos,
  tipoSocioValido,
} from "@/lib/financeiro-scp";
import { percentualDeFracao } from "@/lib/formato";
import { prisma } from "@/lib/prisma";
import { lerDiaAAAAMMDD } from "@/lib/recebiveis";
import { planejarDivisao, type EntradaDivisao, type PlanoDivisao } from "./divisao";
import {
  AUDITORIA,
  campoBruto,
  diaCampo,
  diaTexto,
  idComFormaDeCuid,
  lerDespesa,
  LIMITE_NOME_SOCIO,
  normalizarTexto,
} from "./leitura";

/**
 * Ações do financeiro da SCP (2026-10-26, Projeto RNA etapa 7): sócios, divisão
 * da partilha e despesas. A receita não se lança: é a comissão recebida, lida
 * das liquidações.
 *
 * REGRA DE OURO: nenhum dado real mora aqui. Tudo o que o administrador digita
 * vai direto para o banco.
 *
 * Toda ação chama exigirAcessoFinanceiro() ANTES de ler o formulário ou o banco
 * (sem sessão vai para /entrar; sem a permissão do financeiro responde 404; sem
 * 2FA vai para o perfil). A validação é no servidor, a auditoria só é escrita
 * quando algo mudou de fato, e o detalhe dela leva datas, valores e percentuais,
 * nunca nome nem descrição.
 */

const CAMINHO = "/admin/financeiro-scp";
const CAMINHO_DEMONSTRATIVO = "/admin/financeiro-scp/demonstrativo";

/** O que uma ação devolve para a tela (useActionState). */
export interface EstadoAcao<V = undefined> {
  /** Mensagem de erro para a tela. */
  erro?: string;
  /** A ação terminou sem erro (houve mudança ou não). */
  ok?: boolean;
  /** Complemento neutro ("Nada mudou."). */
  aviso?: string;
  /** O que foi digitado, para repor o formulário depois de um erro. */
  valores?: V;
}

export type EstadoSocio = EstadoAcao<{ nome: string; tipo: string }>;
export type EstadoDivisao = EstadoAcao<{ vigenteDesde: string; percentuais: Record<string, string> }>;
export type EstadoDespesa = EstadoAcao<{
  data: string;
  valor: string;
  descricao: string;
  categoria: string;
  pagaPorSocioId: string;
}>;

function atualizarTelas() {
  revalidatePath(CAMINHO);
  revalidatePath(CAMINHO_DEMONSTRATIVO);
}

function codigoDoErro(erro: unknown): string | undefined {
  return typeof erro === "object" && erro !== null ? (erro as { code?: string }).code : undefined;
}

const ERRO_ID_INVALIDO = "Registro inválido. Atualize a página e tente de novo.";

// ───────────────────────────── sócios ─────────────────────────────

/** Cadastra um sócio (nasce ativo). Só nome e tipo: nenhum documento nem contato. */
export async function criarSocio(_anterior: EstadoSocio, formData: FormData): Promise<EstadoSocio> {
  // Primeiro o acesso: nada do formulário é lido antes de saber quem chama.
  const adminId = await exigirAcessoFinanceiro();

  const nome = normalizarTexto(campoBruto(formData, "nome"));
  const tipo = campoBruto(formData, "tipo").trim();
  const valores = { nome, tipo };

  if (nome === "") return { erro: "Informe o nome do sócio.", valores };
  if (nome.length > LIMITE_NOME_SOCIO) {
    return { erro: `O nome tem ${nome.length} caracteres; o limite é ${LIMITE_NOME_SOCIO}.`, valores };
  }
  if (!tipoSocioValido(tipo)) return { erro: "Escolha se o sócio é ostensivo ou participante.", valores };

  const igual = await prisma.socioScp.findFirst({
    where: { nome: { equals: nome, mode: "insensitive" } },
    select: { id: true },
  });
  if (igual) return { erro: "Já existe um sócio com esse nome.", valores };

  const ultimo = await prisma.socioScp.findFirst({ orderBy: { ordem: "desc" }, select: { ordem: true } });
  const criado = await prisma.socioScp.create({
    data: { nome, tipo, ativo: true, ordem: (ultimo?.ordem ?? -1) + 1 },
    select: { id: true },
  });

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: AUDITORIA.socioCriado,
    alvo: criado.id,
    detalhe: `tipo: ${tipo}`,
  });
  atualizarTelas();
  return { ok: true };
}

/**
 * Ativa ou desativa um sócio. O formulário diz o estado de destino ("1" ou "0"),
 * não "inverta": dois cliques levam ao mesmo lugar. Sócio inativo some das
 * escolhas ("quem pagou", divisão da partilha), mas o histórico permanece.
 * Quem ainda tem participação em vigor não pode ser desativado: a partilha
 * continuaria contando com ele.
 */
export async function alternarSocio(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const adminId = await exigirAcessoFinanceiro();

  const id = campoBruto(formData, "id").trim();
  if (!idComFormaDeCuid(id)) return { erro: ERRO_ID_INVALIDO };
  const destinoBruto = campoBruto(formData, "ativar").trim();
  if (destinoBruto !== "1" && destinoBruto !== "0") return { erro: "Escolha se o sócio fica ativo ou inativo." };
  const destino = destinoBruto === "1";

  const atual = await prisma.socioScp.findUnique({ where: { id }, select: { ativo: true } });
  if (!atual) return { erro: "Este sócio não existe mais. Atualize a página." };
  if (atual.ativo === destino) {
    return { ok: true, aviso: destino ? "O sócio já estava ativo." : "O sócio já estava inativo." };
  }

  if (!destino) {
    const hoje = hojeEmSaoPaulo(new Date());
    const emVigor = await prisma.participacaoScp.findFirst({
      where: { socioId: id, OR: [{ vigenteAte: null }, { vigenteAte: { gte: hoje } }] },
      select: { id: true },
    });
    if (emVigor) {
      return {
        erro: "Este sócio ainda tem participação em vigor. Defina uma nova divisão da partilha sem ele (deixe o percentual em branco) antes de desativá-lo.",
      };
    }
  }

  // O `where` com o estado esperado torna a troca atômica.
  const { count } = await prisma.socioScp.updateMany({ where: { id, ativo: atual.ativo }, data: { ativo: destino } });
  if (count === 0) {
    atualizarTelas();
    return { erro: "O sócio mudou enquanto você olhava a tela. Veja a situação atual e tente de novo." };
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: destino ? AUDITORIA.socioAtivado : AUDITORIA.socioDesativado,
    alvo: id,
  });
  atualizarTelas();
  return { ok: true };
}

const ERRO_SOCIO_EM_USO =
  "Este sócio tem participações ou despesas registradas e não pode ser removido. Para tirá-lo das listas, desative-o.";

/** Remove um sócio que nunca teve participação nem despesa (cadastro feito por engano). */
export async function removerSocio(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const adminId = await exigirAcessoFinanceiro();

  const id = campoBruto(formData, "id").trim();
  if (!idComFormaDeCuid(id)) return { erro: ERRO_ID_INVALIDO };

  const atual = await prisma.socioScp.findUnique({ where: { id }, select: { id: true } });
  if (!atual) {
    atualizarTelas();
    return { ok: true, aviso: "Este sócio já não existe." };
  }

  const [participacoes, despesas] = await Promise.all([
    prisma.participacaoScp.count({ where: { socioId: id } }),
    prisma.despesaScp.count({ where: { pagaPorSocioId: id } }),
  ]);
  if (participacoes > 0 || despesas > 0) return { erro: ERRO_SOCIO_EM_USO };

  let removidos: number;
  try {
    ({ count: removidos } = await prisma.socioScp.deleteMany({ where: { id } }));
  } catch (erro) {
    // Uma participação criada no meio do caminho: a chave estrangeira do banco recusa.
    if (codigoDoErro(erro) === "P2003") return { erro: ERRO_SOCIO_EM_USO };
    throw erro;
  }
  if (removidos === 0) {
    atualizarTelas();
    return { ok: true, aviso: "Este sócio já não existe." };
  }

  await registrarAuditoria({ ator: `admin:${adminId}`, acao: AUDITORIA.socioRemovido, alvo: id });
  atualizarTelas();
  return { ok: true };
}

// ───────────────────────────── divisão da partilha ─────────────────────────────

/**
 * Define a divisão da partilha a partir de uma data: um percentual por sócio
 * (em branco = fora da partilha). Quem muda tem a participação anterior
 * ENCERRADA no dia anterior (vigenteAte) e outra aberta, tudo numa transação; quem
 * não muda não é tocado. Os percentuais vigentes na data têm de fechar 100% e
 * as vigências de um mesmo sócio não podem se sobrepor (regras em ./divisao.ts).
 * Nada é apagado: o histórico das partilhas continua reconstituível.
 */
export async function definirParticipacoes(_anterior: EstadoDivisao, formData: FormData): Promise<EstadoDivisao> {
  const adminId = await exigirAcessoFinanceiro();

  const desdeBruto = campoBruto(formData, "vigenteDesde");
  const ids = formData.getAll("socioId").map((v) => (typeof v === "string" ? v.trim() : ""));
  const textos = formData.getAll("percentual").map((v) => (typeof v === "string" ? v.trim() : ""));
  const percentuais: Record<string, string> = {};
  ids.forEach((id, i) => {
    // Só ids com forma de cuid viram chave: o que vem do navegador nunca escolhe uma chave qualquer.
    if (idComFormaDeCuid(id)) percentuais[id] = textos[i] ?? "";
  });
  const valores = { vigenteDesde: desdeBruto.trim(), percentuais };

  const desde = lerDiaAAAAMMDD(desdeBruto);
  if (!desde || desde.getUTCFullYear() > 2100) {
    return { erro: "Informe a data em que a nova divisão começa.", valores };
  }
  if (
    ids.length === 0 ||
    ids.length !== textos.length ||
    ids.some((id) => !idComFormaDeCuid(id)) ||
    new Set(ids).size !== ids.length
  ) {
    return { erro: "Formulário inválido. Atualize a página e tente de novo.", valores };
  }

  const entradas: EntradaDivisao[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (textos[i] === "") {
      entradas.push({ socioId: ids[i], fracao: null });
      continue;
    }
    const lido = interpretarPercentualParticipacao(textos[i]);
    if (!lido.ok) return { erro: lido.erro, valores };
    entradas.push({ socioId: ids[i], fracao: lido.fracao });
  }

  let plano: PlanoDivisao;
  try {
    // Lê, confere e grava dentro da mesma transação (isolamento máximo): duas pessoas definindo a
    // divisão ao mesmo tempo não deixam a soma de 100% furada.
    plano = await prisma.$transaction(
      async (tx) => {
        const socios = await tx.socioScp.findMany({ select: { id: true, nome: true, ativo: true } });
        const participacoes = await tx.participacaoScp.findMany({
          select: { id: true, socioId: true, percentual: true, vigenteDesde: true, vigenteAte: true },
        });

        const resultado = planejarDivisao({
          desde,
          entradas,
          socios,
          participacoes: participacoes.map((p) => ({ ...p, percentual: Number(p.percentual.toString()) })),
        });
        if (!resultado.ok || resultado.mudancas.length === 0) return resultado;

        for (const encerrada of resultado.encerrar) {
          await tx.participacaoScp.update({ where: { id: encerrada.id }, data: { vigenteAte: encerrada.vigenteAte } });
        }
        if (resultado.abrir.length > 0) {
          await tx.participacaoScp.createMany({
            data: resultado.abrir.map((a) => ({
              socioId: a.socioId,
              percentual: fracaoParaDecimal(a.fracao),
              vigenteDesde: desde,
            })),
          });
        }
        return resultado;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (erro) {
    // P2034: outra transação mexeu nas mesmas linhas ao mesmo tempo.
    if (codigoDoErro(erro) === "P2034") {
      return { erro: "Outra alteração aconteceu ao mesmo tempo. Veja a situação atual e tente de novo.", valores };
    }
    throw erro;
  }

  if (!plano.ok) return { erro: plano.erro, valores };
  if (plano.mudancas.length === 0) return { ok: true, aviso: "Nada mudou." };

  for (const m of plano.mudancas) {
    await registrarAuditoria({
      ator: `admin:${adminId}`,
      acao: AUDITORIA.participacaoAlterada,
      alvo: m.socioId,
      detalhe: `a partir de ${diaTexto(desde)}: ${m.antes === null ? "sem participação" : percentualDeFracao(m.antes)} → ${
        m.depois === null ? "sai da partilha" : percentualDeFracao(m.depois)
      }`,
    });
  }
  atualizarTelas();
  return { ok: true };
}

// ───────────────────────────── despesas ─────────────────────────────

function camposDaDespesa(formData: FormData) {
  return {
    data: campoBruto(formData, "data"),
    descricao: campoBruto(formData, "descricao"),
    categoria: campoBruto(formData, "categoria"),
    valor: campoBruto(formData, "valor"),
    pagaPorSocioId: campoBruto(formData, "pagaPorSocioId"),
  };
}

/** O que foi digitado, para repor o formulário depois de um erro. */
function valoresDigitados(c: ReturnType<typeof camposDaDespesa>) {
  return {
    data: c.data.trim(),
    valor: c.valor.trim(),
    descricao: normalizarTexto(c.descricao),
    categoria: normalizarTexto(c.categoria),
    pagaPorSocioId: c.pagaPorSocioId.trim(),
  };
}

/** Lança uma despesa (valor > 0 e < R$ 100 bilhões, data real, descrição de até 200 caracteres). */
export async function criarDespesa(_anterior: EstadoDespesa, formData: FormData): Promise<EstadoDespesa> {
  const adminId = await exigirAcessoFinanceiro();

  const campos = camposDaDespesa(formData);
  const valores = valoresDigitados(campos);
  const lida = lerDespesa(campos);
  if (!lida.ok) return { erro: lida.erro, valores };
  const d = lida.despesa;

  if (d.pagaPorSocioId) {
    const socio = await prisma.socioScp.findUnique({ where: { id: d.pagaPorSocioId }, select: { id: true } });
    if (!socio) return { erro: "O sócio escolhido não existe mais. Atualize a página.", valores };
  }

  const criada = await prisma.despesaScp.create({
    data: {
      data: d.data,
      descricao: d.descricao,
      categoria: d.categoria,
      valor: centavosParaDecimal(d.centavos),
      pagaPorSocioId: d.pagaPorSocioId,
      criadoPorId: adminId,
    },
    select: { id: true },
  });

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: AUDITORIA.despesaCriada,
    alvo: criada.id,
    detalhe: `despesa de ${diaTexto(d.data)}: ${formatarReais(d.centavos)}`,
  });
  atualizarTelas();
  return { ok: true };
}

/** Corrige uma despesa. Se nada mudou, não grava nem audita; se mudou, a trilha guarda o antes e o depois dos valores e da data. */
export async function atualizarDespesa(_anterior: EstadoDespesa, formData: FormData): Promise<EstadoDespesa> {
  const adminId = await exigirAcessoFinanceiro();

  const id = campoBruto(formData, "id").trim();
  if (!idComFormaDeCuid(id)) return { erro: ERRO_ID_INVALIDO };

  const campos = camposDaDespesa(formData);
  const valores = valoresDigitados(campos);
  const lida = lerDespesa(campos);
  if (!lida.ok) return { erro: lida.erro, valores };
  const nova = lida.despesa;

  const atual = await prisma.despesaScp.findUnique({
    where: { id },
    select: { data: true, descricao: true, categoria: true, valor: true, pagaPorSocioId: true },
  });
  if (!atual) return { erro: "Esta despesa não existe mais. Atualize a página.", valores };

  const centavosAtual = reaisParaCentavos(atual.valor);
  const dados: {
    data?: Date;
    valor?: string;
    descricao?: string;
    categoria?: string | null;
    pagaPorSocioId?: string | null;
  } = {};
  const mudancas: string[] = [];

  if (diaCampo(atual.data) !== diaCampo(nova.data)) {
    dados.data = nova.data;
    mudancas.push(`data ${diaTexto(atual.data)} → ${diaTexto(nova.data)}`);
  }
  if (centavosAtual !== nova.centavos) {
    dados.valor = centavosParaDecimal(nova.centavos);
    mudancas.push(`valor ${formatarReais(centavosAtual)} → ${formatarReais(nova.centavos)}`);
  }
  if (atual.descricao !== nova.descricao) {
    dados.descricao = nova.descricao;
    mudancas.push("descrição alterada");
  }
  if ((atual.categoria ?? null) !== nova.categoria) {
    dados.categoria = nova.categoria;
    mudancas.push("categoria alterada");
  }
  if ((atual.pagaPorSocioId ?? null) !== nova.pagaPorSocioId) {
    if (nova.pagaPorSocioId) {
      const socio = await prisma.socioScp.findUnique({ where: { id: nova.pagaPorSocioId }, select: { id: true } });
      if (!socio) return { erro: "O sócio escolhido não existe mais. Atualize a página.", valores };
    }
    dados.pagaPorSocioId = nova.pagaPorSocioId;
    mudancas.push("quem pagou alterado");
  }
  if (mudancas.length === 0) return { ok: true, aviso: "Nada mudou." };

  const { count } = await prisma.despesaScp.updateMany({ where: { id }, data: dados });
  if (count === 0) return { erro: "Esta despesa não existe mais. Atualize a página.", valores };

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: AUDITORIA.despesaAlterada,
    alvo: id,
    detalhe: `despesa de ${diaTexto(atual.data)}: ${mudancas.join("; ")}`,
  });
  atualizarTelas();
  return { ok: true };
}

/** Remove a despesa (a tela pede confirmação). A trilha guarda a data e o valor que foram apagados. */
export async function removerDespesa(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const adminId = await exigirAcessoFinanceiro();

  const id = campoBruto(formData, "id").trim();
  if (!idComFormaDeCuid(id)) return { erro: ERRO_ID_INVALIDO };

  const atual = await prisma.despesaScp.findUnique({ where: { id }, select: { data: true, valor: true } });
  if (!atual) {
    atualizarTelas();
    return { ok: true, aviso: "Esta despesa já não existe." };
  }

  const { count } = await prisma.despesaScp.deleteMany({ where: { id } });
  if (count === 0) {
    atualizarTelas();
    return { ok: true, aviso: "Esta despesa já não existe." };
  }

  await registrarAuditoria({
    ator: `admin:${adminId}`,
    acao: AUDITORIA.despesaRemovida,
    alvo: id,
    detalhe: `despesa de ${diaTexto(atual.data)} removida: ${formatarReais(reaisParaCentavos(atual.valor))}`,
  });
  atualizarTelas();
  return { ok: true };
}
