/**
 * Permissões da equipe interna por atividade do workflow (2026-11-13). Regras
 * puras, sem banco, sem rede e sem relógio. O armazenamento fica em
 * Admin.permissoes (lista de chaves) e a conferência no banco, em
 * src/lib/permissoes-db.ts.
 *
 * Origem: o mapa do "Workflow principal da Central de Atas" (17 atividades).
 * Cada permissão cobre uma ou mais atividades, e cada pessoa da equipe recebe
 * o conjunto que o ramo dela no mapa mostra. Os perfis prontos abaixo são só
 * atalhos para preencher o conjunto; o que vale é a lista salva na conta.
 *
 * Quem não tem nenhuma permissão entra no painel e na própria conta, mas não
 * muda nada. Contas antigas receberam todas as permissões na migração, para
 * ninguém perder acesso. O financeiro da SCP continua com a trava própria
 * (Admin.acessoFinanceiro + 2FA, src/lib/acesso-financeiro.ts).
 */

export const PERMISSOES = [
  {
    chave: "atas.captar",
    rotulo: "Captar atas",
    atividades: [1, 2],
    descricao: "Mapear e cadastrar a ata, fechar com a empresa prestadora, cuidar do fornecedor e da prospecção.",
  },
  {
    chave: "atas.itens",
    rotulo: "Cadastrar itens e saldos",
    atividades: [3],
    descricao: "Cadastrar os itens da ata e o saldo de cada um, inclusive por planilha. É só isto: não abre o resto da captação.",
  },
  {
    chave: "atas.contrato",
    rotulo: "Contrato de intermediação",
    atividades: [4],
    descricao: "Contrato com o fornecedor (percentual da comissão) e faixas de comissão.",
  },
  {
    chave: "atas.conformidade",
    rotulo: "Conformidade da ata",
    atividades: [5],
    descricao: "Marcar o checklist de conformidade da ata, escrever o parecer e concluir: concluída a conformidade, a ata fica disponível para a equipe de vendas (não há aprovação à parte).",
  },
  {
    chave: "atas.publicar",
    rotulo: "Publicar e atribuir ata",
    atividades: [7],
    descricao: "Título público, categoria e devolução da ata ao pool da equipe de vendas.",
  },
  {
    chave: "municipios.liberar",
    rotulo: "Liberar municípios",
    atividades: [9],
    descricao: "Aprovar ou negar os pedidos de município feitos pela equipe de vendas.",
  },
  {
    chave: "adesao.instruir",
    rotulo: "Instruir a adesão",
    atividades: [11],
    descricao: "Marcar os itens da instrução da adesão de qualquer oportunidade.",
  },
  {
    chave: "adesao.declarar",
    rotulo: "Declarar conformidade da adesão",
    atividades: [12],
    descricao: "Registrar ou revogar a declaração de conformidade, que libera o estágio Aderiu.",
  },
  {
    chave: "adesao.registrar",
    rotulo: "Registrar a adesão",
    atividades: [13],
    descricao: "Registrar a adesão do município com a quantidade de cada item (o saldo da ata anda e os limites do art. 86 valem).",
  },
  {
    chave: "adesao.acompanhar",
    rotulo: "Acompanhar contrato e entrega",
    atividades: [14, 15, 17],
    descricao: "Contratos detectados no PNCP, vínculos, aditivos e renovações.",
  },
  {
    chave: "comissao.cobrar",
    rotulo: "Cobrar e receber a comissão",
    atividades: [16],
    descricao: "Liquidações, cobrança da comissão, contas a receber e recebíveis.",
  },
  {
    chave: "base.editar",
    rotulo: "Cuidar da base de municípios",
    atividades: [],
    descricao: "Municípios, contatos, sinais de compra, parceiros, demandas do site e raio-X.",
  },
  {
    chave: "visao.geral",
    rotulo: "Visão geral da operação",
    atividades: [],
    descricao:
      "Os ciclos, o Pipeline, os Indicadores e o desempenho dos vendedores, o catálogo completo e os painéis de números: a visão de quem gerencia, não de quem executa uma etapa.",
  },
  {
    chave: "usuarios.gerir",
    rotulo: "Gerir usuários",
    atividades: [],
    descricao: "Equipe interna, consultores, credenciamento, fornecedores e órgãos.",
  },
] as const;

export type Permissao = (typeof PERMISSOES)[number]["chave"];

export const TODAS_AS_PERMISSOES: readonly Permissao[] = PERMISSOES.map((p) => p.chave);

export const ROTULO_PERMISSAO: Record<Permissao, string> = Object.fromEntries(
  PERMISSOES.map((p) => [p.chave, p.rotulo]),
) as Record<Permissao, string>;

export function permissaoValida(valor: unknown): valor is Permissao {
  return typeof valor === "string" && (TODAS_AS_PERMISSOES as readonly string[]).includes(valor);
}

/** Lista limpa: só chaves conhecidas, sem repetição, na ordem da tabela acima. */
export function normalizarPermissoes(valor: unknown): Permissao[] {
  if (!Array.isArray(valor)) return [];
  const pedidas = new Set(valor.filter(permissaoValida));
  return TODAS_AS_PERMISSOES.filter((chave) => pedidas.has(chave));
}

export function temPermissao(permissoes: readonly string[] | null | undefined, chave: Permissao): boolean {
  return Array.isArray(permissoes) && permissoes.includes(chave);
}

/** Verdadeiro quando a pessoa tem pelo menos uma das permissões pedidas. */
export function temAlguma(permissoes: readonly string[] | null | undefined, chaves: readonly Permissao[]): boolean {
  return chaves.some((chave) => temPermissao(permissoes, chave));
}

export const PERFIS = [
  {
    // Administração, jurídico e gestão são a mesma pessoa (decisão de Carlos, 14/11/2026): um perfil só.
    chave: "gestao",
    rotulo: "Gestão (administração, jurídico e gestão)",
    permissoes: TODAS_AS_PERMISSOES,
  },
  {
    // Dr. Rui (decisão de Carlos, 14/11/2026): não aprova ata (a aprovação saiu do workflow); instrui a adesão
    // e acompanha contrato e aditivos.
    chave: "analista",
    rotulo: "Analista de adesão",
    permissoes: ["adesao.instruir", "adesao.acompanhar"],
  },
  {
    chave: "captacao",
    rotulo: "Captador",
    permissoes: ["atas.captar", "atas.itens"],
  },
  {
    chave: "estagiario",
    rotulo: "Estagiário",
    permissoes: ["atas.itens", "adesao.registrar"],
  },
  {
    chave: "cobranca",
    rotulo: "Cobrança",
    permissoes: ["comissao.cobrar"],
  },
] as const satisfies readonly { chave: string; rotulo: string; permissoes: readonly Permissao[] }[];

export type PerfilChave = (typeof PERFIS)[number]["chave"];

export function perfilPorChave(chave: unknown) {
  return PERFIS.find((p) => p.chave === chave) ?? null;
}

/**
 * Permissão que cada ação de src/app/admin/actions.ts exige. O nome é o mesmo
 * que vai para a trilha de auditoria. Ação fora desta tabela é recusada: quem
 * cria ação nova precisa decidir a permissão dela.
 *
 * "admin.analisarAta" (salvar o rascunho da conformidade ou concluí-la) exige "atas.conformidade".
 */
export const PERMISSAO_POR_ACAO: Record<string, Permissao | readonly Permissao[]> = {
  "admin.analisarAta": "atas.conformidade",
  "admin.salvarContratoIntermediacao": "atas.contrato",
  "admin.devolverAtaAoPool": "atas.publicar",
  "admin.definirCategoriaAta": "atas.publicar",
  "admin.definirTituloPublicoAta": "atas.publicar",
  "admin.cadastrarAtaComoAdmin": "atas.captar",
  "admin.completarFornecedorDaAta": "atas.captar",
  "admin.adicionarItemNaAta": ["atas.captar", "atas.itens"],
  "admin.definirCodigoCatalogoItem": ["atas.captar", "atas.itens"],
  "admin.alternarStatusFornecedor": "atas.captar",
  "admin.atualizarContatoTecnicoFornecedor": "atas.captar",
  "admin.decidirPedidosNegociacao": "municipios.liberar",
  "admin.marcarFaturamentoComoPago": "comissao.cobrar",
  "admin.marcarFaturamentoComoPendente": "comissao.cobrar",
  "admin.lancarLiquidacao": "comissao.cobrar",
  "admin.informarPagamentoEnteLiquidacao": "comissao.cobrar",
  "admin.atualizarCobrancaLiquidacao": "comissao.cobrar",
  "admin.criarEntidadeAlvo": "base.editar",
  "admin.alternarStatusEntidadeAlvo": "base.editar",
  "admin.criarPontoFocal": "base.editar",
  "admin.alternarStatusPontoFocal": "base.editar",
  "admin.registrarInteracaoPontoFocal": "base.editar",
  "admin.criarParceiro": "base.editar",
  "admin.alternarStatusParceiro": "base.editar",
  "admin.atualizarRaioXConsumo": "base.editar",
  "admin.confirmarContatoAdmin": "base.editar",
  "admin.criarSinalMunicipio": "base.editar",
  "admin.removerSinalMunicipio": "base.editar",
  "admin.atualizarDemanda": "base.editar",
  "admin.criarVendedorAdmin": "usuarios.gerir",
  "admin.alternarStatusVendedor": "usuarios.gerir",
  "admin.alternarStatusOrgao": "usuarios.gerir",
};

/** Mensagem curta para a tela quando falta permissão. */
export const MENSAGEM_SEM_PERMISSAO = "Você não tem permissão para esta área. Peça ao administrador que revise o seu perfil.";
