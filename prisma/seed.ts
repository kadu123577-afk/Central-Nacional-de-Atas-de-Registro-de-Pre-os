/**
 * Seed de demonstração — popula o banco com um cenário fictício completo
 * pra navegar pelo sistema e ver cada situação real sem cadastrar nada na
 * mão: atas em dia, vencendo, vencidas, rejeitadas e pendentes de
 * moderação; adesões em cada um dos 8 estágios da esteira; faturamento
 * pago e a pagar. Datas espalhadas nos últimos ~5 meses, não tudo "hoje".
 *
 * Todo registro criado aqui é marcado com isSeed: true — rode
 * `npm run seed:limpar` pra apagar só esses dados, sem risco de mexer em
 * dado real e sem precisar recriar o banco do zero.
 *
 * Não insere direto no banco por fora das regras de negócio: reaproveita
 * o mesmo motor de saldo/trava do art. 86 (src/lib/saldo.ts) e o mesmo
 * motor de cálculo de faturamento (src/lib/faturamento.ts) que as telas
 * usam — se uma dessas contas resultasse num pedido que a trava recusaria
 * de verdade, este script quebra também, em vez de gravar um estado que o
 * sistema real nunca deixaria existir.
 *
 * Uso: npm run seed
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import type { EstagioAdesao } from "../src/generated/prisma/enums";
import bcrypt from "bcryptjs";
import { verificarAdesao } from "../src/lib/saldo";
import { calcularFaturamento } from "../src/lib/faturamento";
import { ORDEM_ESTAGIOS } from "../src/lib/adesao";

const prisma = new PrismaClient();

const SENHA_PADRAO = "Demo@2026";

function diasAtras(dias: number): Date {
  const data = new Date();
  data.setDate(data.getDate() - dias);
  return data;
}

function diasNoFuturo(dias: number): Date {
  return diasAtras(-dias);
}

async function hash(): Promise<string> {
  return bcrypt.hash(SENHA_PADRAO, 12);
}

/**
 * Cria uma adesão e a avança até `estagioAlvo`, gravando um
 * AdesaoHistorico por estágio percorrido (igual à ação real
 * `avancarEstagioAdesao`) e, se o alvo chega a EMPENHADA ou depois,
 * gerando o Faturamento com `calcularFaturamento` — a mesma conta que a
 * tela real faz.
 *
 * Antes de gravar, roda `verificarAdesao` com o consumo já registrado
 * pelas adesões anteriores deste item — se a trava recusasse esse pedido
 * de verdade, o script para aqui em vez de gravar um estado inválido.
 */
async function criarAdesaoProgredida(opcoes: {
  itemId: string;
  orgaoAderenteId: string;
  quantidadeSolicitada: number;
  estagioAlvo: EstagioAdesao;
  criadaEm: Date;
  diasEntreEstagios: number;
  pago?: boolean;
}) {
  const { itemId, orgaoAderenteId, quantidadeSolicitada, estagioAlvo, criadaEm, diasEntreEstagios, pago } =
    opcoes;

  const item = await prisma.item.findUniqueOrThrow({ where: { id: itemId } });
  const saldo = await prisma.saldo.findUnique({ where: { itemId } });
  const quantidadeJaConsumida = saldo?.quantidadeConsumida ?? 0;

  const agregadoDoOrgao = await prisma.adesao.aggregate({
    where: { itemId, orgaoAderenteId },
    _sum: { quantidadeSolicitada: true },
  });
  const quantidadeJaAderidaPeloOrgao = agregadoDoOrgao._sum.quantidadeSolicitada ?? 0;

  const resultado = verificarAdesao(
    item.quantidadeRegistrada,
    quantidadeJaConsumida,
    quantidadeJaAderidaPeloOrgao,
    quantidadeSolicitada,
  );
  if (!resultado.permitido) {
    throw new Error(
      `Seed inválido: adesão de ${quantidadeSolicitada} ${item.unidade} ao item ${itemId} pelo órgão ${orgaoAderenteId} seria recusada pela trava do art. 86 (${resultado.motivo}). Ajuste as quantidades do cenário.`,
    );
  }

  const indiceAlvo = ORDEM_ESTAGIOS.indexOf(estagioAlvo);
  const passos = ORDEM_ESTAGIOS.slice(0, indiceAlvo + 1);

  const adesao = await prisma.adesao.create({
    data: {
      itemId,
      orgaoAderenteId,
      quantidadeSolicitada,
      estagio: passos[0],
      createdAt: criadaEm,
      updatedAt: criadaEm,
      isSeed: true,
      historico: {
        create: {
          estagioAnterior: null,
          estagioNovo: passos[0],
          alteradoPor: `orgao:${orgaoAderenteId}`,
          alteradoEm: criadaEm,
        },
      },
    },
  });

  await prisma.saldo.upsert({
    where: { itemId },
    update: { quantidadeConsumida: { increment: quantidadeSolicitada } },
    create: { itemId, quantidadeConsumida: quantidadeSolicitada },
  });

  let dataEstagioAtual = criadaEm;
  for (let i = 1; i < passos.length; i++) {
    dataEstagioAtual = new Date(dataEstagioAtual.getTime() + diasEntreEstagios * 86_400_000);
    const anterior = passos[i - 1];
    const atual = passos[i];
    const quemMoveu = i % 2 === 0 ? `orgao:${orgaoAderenteId}` : `fornecedor:${item.ataId}`;

    await prisma.adesaoHistorico.create({
      data: {
        adesaoId: adesao.id,
        estagioAnterior: anterior,
        estagioNovo: atual,
        alteradoPor: quemMoveu,
        alteradoEm: dataEstagioAtual,
      },
    });

    if (atual === "EMPENHADA") {
      const faturamento = calcularFaturamento(quantidadeSolicitada, Number(item.valorUnitario));
      await prisma.faturamento.create({
        data: {
          adesaoId: adesao.id,
          valorContrato: faturamento.valorContrato,
          percentualTaxa: faturamento.percentualTaxa,
          valorTaxaIntermediacao: faturamento.valorTaxaIntermediacao,
          pago: pago ?? false,
          pagoEm: pago ? new Date(dataEstagioAtual.getTime() + 10 * 86_400_000) : null,
          criadoEm: dataEstagioAtual,
        },
      });
    }
  }

  await prisma.adesao.update({
    where: { id: adesao.id },
    data: { estagio: estagioAlvo, updatedAt: dataEstagioAtual },
  });

  return adesao;
}

async function main() {
  const senhaHash = await hash();

  // ---- Admin de demonstração ----
  const admin = await prisma.admin.upsert({
    where: { email: "admin.demo@centraldeatas.teste" },
    update: { senhaHash, isSeed: true },
    create: {
      email: "admin.demo@centraldeatas.teste",
      nome: "Admin Demonstração",
      senhaHash,
      isSeed: true,
    },
  });

  // ---- Fornecedores ----
  const papelaria = await prisma.fornecedor.upsert({
    where: { cnpj: "11111111000101" },
    update: {},
    create: {
      razaoSocial: "Papelaria Central Demo LTDA",
      cnpj: "11111111000101",
      email: "contato@papelariacentral.demo",
      senhaHash,
      isSeed: true,
    },
  });
  const construtora = await prisma.fornecedor.upsert({
    where: { cnpj: "22222222000102" },
    update: {},
    create: {
      razaoSocial: "Construtora Horizonte Demo LTDA",
      cnpj: "22222222000102",
      email: "contato@horizonteconstrutora.demo",
      senhaHash,
      isSeed: true,
    },
  });
  const techmed = await prisma.fornecedor.upsert({
    where: { cnpj: "33333333000103" },
    update: {},
    create: {
      razaoSocial: "TechMed Distribuidora Demo LTDA",
      cnpj: "33333333000103",
      email: "contato@techmed.demo",
      senhaHash,
      isSeed: true,
    },
  });
  const infotech = await prisma.fornecedor.upsert({
    where: { cnpj: "44444444000104" },
    update: {},
    create: {
      razaoSocial: "InfoTech Sul Demo LTDA",
      cnpj: "44444444000104",
      email: "contato@infotechsul.demo",
      senhaHash,
      isSeed: true,
    },
  });

  // ---- Órgãos (misturando esferas — município incluso, sem restrição) ----
  const belaVista = await prisma.orgao.upsert({
    where: { cnpj: "55555555000105" },
    update: {},
    create: {
      nome: "Prefeitura Municipal Demo de Bela Vista",
      cnpj: "55555555000105",
      uf: "GO",
      municipio: "Bela Vista Demo",
      esfera: "municipal",
      email: "compras@belavista.demo",
      senhaHash,
      isSeed: true,
    },
  });
  const secEstadualSaude = await prisma.orgao.upsert({
    where: { cnpj: "66666666000106" },
    update: {},
    create: {
      nome: "Secretaria Estadual Demo de Saúde",
      cnpj: "66666666000106",
      uf: "GO",
      municipio: "Capital Demo",
      esfera: "estadual",
      email: "compras@secsaude.demo",
      senhaHash,
      isSeed: true,
    },
  });
  const ministerioInfra = await prisma.orgao.upsert({
    where: { cnpj: "77777777000107" },
    update: {},
    create: {
      nome: "Governo Federal Demo — Ministério da Infraestrutura",
      cnpj: "77777777000107",
      uf: "DF",
      municipio: "Brasília",
      esfera: "federal",
      email: "compras@ministerioinfra.demo",
      senhaHash,
      isSeed: true,
    },
  });
  const secObras = await prisma.orgao.upsert({
    where: { cnpj: "88888888000108" },
    update: {},
    create: {
      nome: "Governo do Estado Demo — Secretaria de Obras",
      cnpj: "88888888000108",
      uf: "GO",
      municipio: "Capital Demo",
      esfera: "estadual",
      email: "compras@secobras.demo",
      senhaHash,
      isSeed: true,
    },
  });
  const portoNovo = await prisma.orgao.upsert({
    where: { cnpj: "99999999000109" },
    update: {},
    create: {
      nome: "Prefeitura Municipal Demo de Porto Novo",
      cnpj: "99999999000109",
      uf: "SP",
      municipio: "Porto Novo Demo",
      esfera: "municipal",
      email: "compras@portonovo.demo",
      senhaHash,
      isSeed: true,
    },
  });
  const serraAlta = await prisma.orgao.upsert({
    where: { cnpj: "10101010000110" },
    update: {},
    create: {
      nome: "Câmara Municipal Demo de Serra Alta",
      cnpj: "10101010000110",
      uf: "MG",
      municipio: "Serra Alta Demo",
      esfera: "municipal",
      email: "compras@serraalta.demo",
      senhaHash,
      isSeed: true,
    },
  });

  // ---- Atas — cobrindo cada estado real do sistema ----

  // 1. Vigente, confortavelmente em dia.
  const ataPapel = await prisma.ata.create({
    data: {
      numero: "001-demo/2025",
      objeto: "Registro de preços para material de escritório",
      status: "APROVADA",
      origem: "MANUAL",
      dataAssinatura: diasAtras(330),
      dataVigenciaFim: diasNoFuturo(35),
      fornecedorId: papelaria.id,
      orgaoGerenciadorId: belaVista.id,
      isSeed: true,
      itens: {
        create: {
          descricao: "Papel A4 75g (demo)",
          categoria: "Material de escritório",
          unidade: "resma",
          quantidadeRegistrada: 5000,
          valorUnitario: "24.90",
          isSeed: true,
          saldo: { create: {} },
        },
      },
    },
    include: { itens: true },
  });

  // 2. Vigente, mas vencendo em poucos dias.
  const ataCaneta = await prisma.ata.create({
    data: {
      numero: "002-demo/2025",
      objeto: "Registro de preços para canetas esferográficas",
      status: "APROVADA",
      origem: "MANUAL",
      dataAssinatura: diasAtras(300),
      dataVigenciaFim: diasNoFuturo(5),
      fornecedorId: papelaria.id,
      orgaoGerenciadorId: belaVista.id,
      isSeed: true,
      itens: {
        create: {
          descricao: "Caneta esferográfica azul (demo)",
          categoria: "Material de escritório",
          unidade: "unidade",
          quantidadeRegistrada: 10000,
          valorUnitario: "1.35",
          isSeed: true,
          saldo: { create: {} },
        },
      },
    },
    include: { itens: true },
  });

  // 3. Vigente, volume grande, gerenciada por um órgão estadual.
  const ataCimento = await prisma.ata.create({
    data: {
      numero: "010-demo/2025",
      objeto: "Registro de preços para material de construção",
      status: "APROVADA",
      origem: "MANUAL",
      dataAssinatura: diasAtras(250),
      dataVigenciaFim: diasNoFuturo(240),
      fornecedorId: construtora.id,
      orgaoGerenciadorId: secObras.id,
      isSeed: true,
      itens: {
        create: {
          descricao: "Cimento CP-II 50kg (demo)",
          categoria: "Material de construção",
          unidade: "saco",
          quantidadeRegistrada: 18000,
          valorUnitario: "32.00",
          isSeed: true,
          saldo: { create: {} },
        },
      },
    },
    include: { itens: true },
  });

  // 4. Pendente de moderação — ainda não aparece no catálogo público.
  await prisma.ata.create({
    data: {
      numero: "011-demo/2025",
      objeto: "Registro de preços para lâmpadas e material elétrico",
      status: "PENDENTE",
      origem: "MANUAL",
      dataAssinatura: diasAtras(10),
      dataVigenciaFim: diasNoFuturo(355),
      fornecedorId: construtora.id,
      orgaoGerenciadorId: secObras.id,
      isSeed: true,
      itens: {
        create: {
          descricao: "Lâmpada LED 20W (demo)",
          categoria: "Material elétrico",
          unidade: "unidade",
          quantidadeRegistrada: 3000,
          valorUnitario: "18.50",
          isSeed: true,
          saldo: { create: {} },
        },
      },
    },
  });

  // 5. Vencida — vigência já encerrada (o sistema não impede a existência
  //    do registro, só a adesão a algo já fora do prazo).
  await prisma.ata.create({
    data: {
      numero: "004-demo/2025",
      objeto: "Registro de preços para material hospitalar descartável",
      status: "APROVADA",
      origem: "MANUAL",
      dataAssinatura: diasAtras(400),
      dataVigenciaFim: diasAtras(20),
      fornecedorId: techmed.id,
      orgaoGerenciadorId: secEstadualSaude.id,
      isSeed: true,
      itens: {
        create: {
          descricao: "Máscara cirúrgica descartável (demo)",
          categoria: "Material hospitalar",
          unidade: "caixa",
          quantidadeRegistrada: 20000,
          valorUnitario: "9.90",
          isSeed: true,
          saldo: { create: {} },
        },
      },
    },
  });

  // 6. Rejeitada pelo admin — o estado mais próximo de "processo
  //    cancelado" que o sistema modela hoje (não existe um estágio de
  //    cancelamento de adesão em separado).
  await prisma.ata.create({
    data: {
      numero: "005-demo/2025",
      objeto: "Registro de preços para luvas cirúrgicas",
      status: "REJEITADA",
      origem: "MANUAL",
      dataAssinatura: diasAtras(15),
      dataVigenciaFim: diasNoFuturo(350),
      fornecedorId: techmed.id,
      orgaoGerenciadorId: secEstadualSaude.id,
      isSeed: true,
      itens: {
        create: {
          descricao: "Luva cirúrgica látex P (demo)",
          categoria: "Material hospitalar",
          unidade: "caixa",
          quantidadeRegistrada: 15000,
          valorUnitario: "0.85",
          isSeed: true,
          saldo: { create: {} },
        },
      },
    },
  });

  // 7. Importada do PNCP — exercita o campo numeroControlePncp e a
  //    origem PNCP (a mesma chave que o rastreador usa pra deduplicar).
  const ataNotebook = await prisma.ata.create({
    data: {
      numero: "PNCP-demo-00456",
      objeto: "Registro de preços para equipamentos de informática",
      status: "APROVADA",
      origem: "PNCP",
      numeroControlePncp: "00456789000110-1-000123/2025",
      dataAssinatura: diasAtras(200),
      dataVigenciaFim: diasNoFuturo(120),
      fornecedorId: infotech.id,
      orgaoGerenciadorId: ministerioInfra.id,
      isSeed: true,
      itens: {
        create: {
          descricao: "Notebook 8GB RAM (demo)",
          categoria: "Equipamento de TI",
          unidade: "unidade",
          quantidadeRegistrada: 500,
          valorUnitario: "3450.00",
          isSeed: true,
          saldo: { create: {} },
        },
      },
    },
    include: { itens: true },
  });

  const itemPapel = ataPapel.itens[0];
  const itemCaneta = ataCaneta.itens[0];
  const itemCimento = ataCimento.itens[0];
  const itemNotebook = ataNotebook.itens[0];

  // ---- Adesões — uma em cada um dos 8 estágios, datas espalhadas ----

  await criarAdesaoProgredida({
    itemId: itemPapel.id,
    orgaoAderenteId: portoNovo.id,
    quantidadeSolicitada: 800,
    estagioAlvo: "FATURADA",
    criadaEm: diasAtras(150),
    diasEntreEstagios: 3,
    pago: true,
  });

  await criarAdesaoProgredida({
    itemId: itemCimento.id,
    orgaoAderenteId: serraAlta.id,
    quantidadeSolicitada: 3000,
    estagioAlvo: "FATURADA",
    criadaEm: diasAtras(60),
    diasEntreEstagios: 2,
    pago: false,
  });

  await criarAdesaoProgredida({
    itemId: itemPapel.id,
    orgaoAderenteId: serraAlta.id,
    quantidadeSolicitada: 500,
    estagioAlvo: "EMPENHADA",
    criadaEm: diasAtras(70),
    diasEntreEstagios: 3,
  });

  await criarAdesaoProgredida({
    itemId: itemNotebook.id,
    orgaoAderenteId: portoNovo.id,
    quantidadeSolicitada: 100,
    estagioAlvo: "EMPENHADA",
    criadaEm: diasAtras(20),
    diasEntreEstagios: 2,
  });

  await criarAdesaoProgredida({
    itemId: itemCaneta.id,
    orgaoAderenteId: secEstadualSaude.id,
    quantidadeSolicitada: 900,
    estagioAlvo: "ACEITE_FORNECEDOR",
    criadaEm: diasAtras(55),
    diasEntreEstagios: 1,
  });

  await criarAdesaoProgredida({
    itemId: itemNotebook.id,
    orgaoAderenteId: belaVista.id,
    quantidadeSolicitada: 80,
    estagioAlvo: "AGUARDANDO_GERENCIADOR",
    criadaEm: diasAtras(42),
    diasEntreEstagios: 1,
  });

  await criarAdesaoProgredida({
    itemId: itemCimento.id,
    orgaoAderenteId: belaVista.id,
    quantidadeSolicitada: 1500,
    estagioAlvo: "OFICIO_EMITIDO",
    criadaEm: diasAtras(30),
    diasEntreEstagios: 1,
  });

  await criarAdesaoProgredida({
    itemId: itemCaneta.id,
    orgaoAderenteId: portoNovo.id,
    quantidadeSolicitada: 1200,
    estagioAlvo: "APRESENTADA_ORGAO",
    criadaEm: diasAtras(18),
    diasEntreEstagios: 1,
  });

  await criarAdesaoProgredida({
    itemId: itemNotebook.id,
    orgaoAderenteId: secEstadualSaude.id,
    quantidadeSolicitada: 60,
    estagioAlvo: "CONTATO_FORNECEDOR",
    criadaEm: diasAtras(9),
    diasEntreEstagios: 1,
  });

  await criarAdesaoProgredida({
    itemId: itemCimento.id,
    orgaoAderenteId: portoNovo.id,
    quantidadeSolicitada: 2000,
    estagioAlvo: "MAPEADA",
    criadaEm: diasAtras(3),
    diasEntreEstagios: 1,
  });

  console.log("\nSeed de demonstração criado com sucesso.\n");
  console.log("Login de todos os usuários de teste — senha única: " + SENHA_PADRAO);
  console.log("  Admin:        " + admin.email);
  console.log("  Fornecedores: " + [papelaria, construtora, techmed, infotech].map((f) => f.email).join(", "));
  console.log(
    "  Órgãos:       " +
      [belaVista, secEstadualSaude, ministerioInfra, secObras, portoNovo, serraAlta]
        .map((o) => o.email)
        .join(", "),
  );
  console.log("\nRode `npm run seed:limpar` pra apagar só esses dados de teste.\n");
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
