/**
 * Acompanha, nos dados do PNCP já coletados, os contratos que interessam à
 * rede (Projeto RNA §2 e honorários em cascata) — 2026-10-21. Não usa o
 * Claude nem a rede: lê dados-coletados/pncp e pncp-orgaos (mantidos em dia
 * pela coleta automática) e grava em ContratoPublico, VinculoContrato e
 * TermoContratoPublico. Regras em src/lib/acompanhamento.ts.
 *
 * Idempotente. Regras de segurança:
 *  - só guarda contrato que tem vínculo (certo, forte ou desvio) ou que já
 *    estava guardado: não copia os ~450 mil contratos do PNCP;
 *  - vínculo já decidido pelo gestor (confirmado/descartado) nunca é alterado;
 *  - aditivo é detectado pela mudança de valor ou prazo entre duas rodadas
 *    (o endpoint de termos do PNCP falha com 504; ver LEIAME).
 *
 * Uso: npx tsx scripts/inteligencia/acompanhar-contratos.ts [--dry-run] [--ibge=5208707,...] [--mostrar]
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, Prisma } from "../../src/generated/prisma/client";
import {
  classificarVinculo,
  detectarTermos,
  soDigitos,
  type ContratoParaAcompanhar,
  type RedeParaAcompanhar,
} from "../../src/lib/acompanhamento";

const prisma = new PrismaClient();
const DADOS = process.env.COLETA_DIR ? path.resolve(process.env.COLETA_DIR) : path.resolve("dados-coletados");
const opcoes = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? "1"];
  }),
);
const dryRun = Boolean(opcoes["dry-run"]);

type ContratoBruto = ContratoParaAcompanhar & {
  orgaoEntidade?: { cnpj?: string | null; razaoSocial?: string | null } | null;
};

function* linhas(arquivo: string): Generator<{ chave: string; dado: unknown }> {
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    if (!linha) continue;
    try {
      yield JSON.parse(linha);
    } catch {
      // linha truncada (processo interrompido no meio da escrita): ignora
    }
  }
}

const data = (texto: string | null | undefined): Date | null => {
  if (!texto) return null;
  const d = new Date(texto.length === 10 ? `${texto}T00:00:00Z` : texto);
  return Number.isNaN(d.getTime()) ? null : d;
};
const dec = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? null : new Prisma.Decimal(n));

/** Contratos mais recentes de cada número de controle, de todas as fontes do município. */
function contratosDoMunicipio(uf: string, ibge: string): ContratoBruto[] {
  const porNumero = new Map<string, ContratoBruto>();
  for (const fonte of ["pncp", "pncp-orgaos"]) {
    for (const { chave, dado } of linhas(path.join(DADOS, fonte, uf, `${ibge}.ndjson`))) {
      if (!chave.startsWith("contratos")) continue;
      const c = dado as ContratoBruto;
      const atual = porNumero.get(c.numeroControlePNCP);
      if (!atual || (c.dataAtualizacao ?? "") > (atual.dataAtualizacao ?? "")) porNumero.set(c.numeroControlePNCP, c);
    }
  }
  return [...porNumero.values()];
}

async function carregarRede(): Promise<RedeParaAcompanhar> {
  const [atas, fornecedores, oportunidades] = await Promise.all([
    prisma.ata.findMany({
      where: { isSeed: false, numeroControlePncp: { not: null } },
      select: { id: true, numeroControlePncp: true },
    }),
    // Parceiro de verdade: fornecedor com acesso à plataforma (senha) ou com ata
    // coberta por contrato de intermediação. Os "fornecedores" criados sozinhos
    // na importação do PNCP/Compras.gov (e-mail *.importado) NÃO são parceiros:
    // tratá-los assim gerava centenas de falsos desvios.
    prisma.fornecedor.findMany({
      where: {
        isSeed: false,
        OR: [{ senhaHash: { not: null } }, { atas: { some: { isSeed: false, contrato: { isNot: null } } } }],
      },
      select: { cnpj: true },
    }),
    prisma.oportunidadeVenda.findMany({
      where: { isSeed: false },
      select: {
        id: true,
        ataId: true,
        entidadeAlvoId: true,
        estagio: true,
        expiradaEm: true,
        criadoEm: true,
        ata: { select: { fornecedor: { select: { cnpj: true } } } },
      },
    }),
  ]);
  return {
    atasPorControle: new Map(atas.map((a) => [a.numeroControlePncp!, { ataId: a.id }])),
    parceiros: new Set(fornecedores.map((f) => soDigitos(f.cnpj))),
    oportunidades: oportunidades.map((o) => ({
      id: o.id,
      ataId: o.ataId,
      fornecedorCnpj: soDigitos(o.ata.fornecedor.cnpj),
      entidadeAlvoId: o.entidadeAlvoId,
      ativa: o.estagio !== "recusou" && !o.expiradaEm,
      criadoEm: o.criadoEm,
    })),
  };
}

async function main() {
  const rede = await carregarRede();
  const filtroIbge = opcoes.ibge ? new Set(String(opcoes.ibge).split(",")) : null;
  const entidades = await prisma.entidadeAlvo.findMany({
    where: { isSeed: false, codigoIbgeMunicipio: { not: null }, uf: { not: null } },
    select: { id: true, nome: true, uf: true, codigoIbgeMunicipio: true },
  });

  const guardados = new Map(
    (
      await prisma.contratoPublico.findMany({ select: { id: true, numeroControlePncp: true, valorGlobal: true, vigenciaFim: true } })
    ).map((c) => [c.numeroControlePncp, c]),
  );

  const total = {
    municipios: 0,
    contratosLidos: 0,
    vinculos: { certo: 0, forte: 0, desvio: 0 } as Record<string, number>,
    contratosNovos: 0,
    contratosAtualizados: 0,
    termosNovos: 0,
  };

  console.log(
    `Rede: ${rede.atasPorControle.size} atas com número PNCP, ${rede.parceiros.size} fornecedores, ${rede.oportunidades.length} oportunidades.`,
  );
  if (rede.parceiros.size === 0) {
    console.log("Nenhum fornecedor cadastrado: só poderá haver vínculo 'certo' (contrato que cita ata da rede).");
  }

  for (const e of entidades) {
    const ibge = e.codigoIbgeMunicipio!;
    if (filtroIbge && !filtroIbge.has(ibge)) continue;
    total.municipios++;

    for (const c of contratosDoMunicipio(e.uf!, ibge)) {
      total.contratosLidos++;
      const vinculo = classificarVinculo(c, e.id, rede);
      const jaGuardado = guardados.get(c.numeroControlePNCP);
      if (!vinculo && !jaGuardado) continue;
      if (vinculo) total.vinculos[vinculo.nivel]++;
      if (opcoes.mostrar && vinculo) {
        console.log(`[${vinculo.nivel}] ${e.nome}/${e.uf} · ${c.numeroControlePNCP} · ${c.nomeRazaoSocialFornecedor ?? "?"}\n    ${vinculo.motivo}`);
      }

      const campos = {
        orgaoCnpj: soDigitos(c.orgaoEntidade?.cnpj),
        orgaoNome: c.orgaoEntidade?.razaoSocial ?? "",
        entidadeAlvoId: e.id,
        fornecedorCnpj: soDigitos(c.niFornecedor) || null,
        fornecedorNome: c.tipoPessoa === "PF" ? "pessoa física" : (c.nomeRazaoSocialFornecedor ?? null),
        numeroControleAta: c.numeroControlePncpAta ?? null,
        numeroControleCompra: c.numeroControlePncpCompra ?? null,
        frutoAdesao: c.frutoAdesao ?? null,
        tipo: c.tipoContrato?.nome ?? null,
        objeto: (c.objetoContrato ?? "").slice(0, 1000),
        valorInicial: dec(c.valorInicial),
        valorGlobal: dec(c.valorGlobal),
        valorAcumulado: dec(c.valorAcumulado),
        dataAssinatura: data(c.dataAssinatura),
        vigenciaInicio: data(c.dataVigenciaInicio),
        vigenciaFim: data(c.dataVigenciaFim),
        atualizadoNoPncpEm: data(c.dataAtualizacao),
      };

      // Aditivo: compara com o que já estava guardado.
      const termos = jaGuardado
        ? detectarTermos(
            c.numeroControlePNCP,
            {
              valorGlobal: jaGuardado.valorGlobal === null ? null : Number(jaGuardado.valorGlobal),
              vigenciaFim: jaGuardado.vigenciaFim,
            },
            { valorGlobal: c.valorGlobal ?? null, vigenciaFim: data(c.dataVigenciaFim) },
          )
        : [];
      total.termosNovos += termos.length;
      if (jaGuardado) total.contratosAtualizados++;
      else total.contratosNovos++;
      if (dryRun) continue;

      const salvo = await prisma.contratoPublico.upsert({
        where: { numeroControlePncp: c.numeroControlePNCP },
        create: { numeroControlePncp: c.numeroControlePNCP, ...campos },
        update: campos,
        select: { id: true },
      });
      guardados.set(c.numeroControlePNCP, {
        id: salvo.id,
        numeroControlePncp: c.numeroControlePNCP,
        valorGlobal: campos.valorGlobal,
        vigenciaFim: campos.vigenciaFim,
      });

      for (const t of termos) {
        await prisma.termoContratoPublico.upsert({
          where: { chave: t.chave },
          create: {
            contratoId: salvo.id,
            chave: t.chave,
            tipo: t.tipo,
            descricao: t.descricao,
            valorAcrescido: dec(t.valorAcrescido),
            novaVigenciaFim: t.novaVigenciaFim,
            dataAssinatura: data(c.dataAtualizacao),
          },
          update: {},
        });
      }

      if (vinculo) {
        // Decisão do gestor (confirmado/descartado) nunca é sobrescrita.
        const existente = await prisma.vinculoContrato.findUnique({ where: { contratoId: salvo.id }, select: { status: true } });
        if (!existente) {
          await prisma.vinculoContrato.create({
            data: {
              contratoId: salvo.id,
              nivel: vinculo.nivel,
              motivo: vinculo.motivo,
              ataId: vinculo.ataId,
              oportunidadeId: vinculo.oportunidadeId,
            },
          });
        } else if (existente.status === "sugerido") {
          await prisma.vinculoContrato.update({
            where: { contratoId: salvo.id },
            data: { nivel: vinculo.nivel, motivo: vinculo.motivo, ataId: vinculo.ataId, oportunidadeId: vinculo.oportunidadeId },
          });
        }
      }
    }
  }

  console.log(dryRun ? "SIMULAÇÃO (nada gravado)" : "Acompanhamento gravado");
  console.log(total);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
