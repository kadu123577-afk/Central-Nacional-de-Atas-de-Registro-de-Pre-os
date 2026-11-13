import type { ItemNav } from "@/components/ui/app-shell";

/**
 * Menu único da área administrativa (fase 2 de design, 2026-10-05) — antes
 * cada página tinha a sua cópia da lista, e um item novo exigia editar 17
 * arquivos. Agrupado por fluxo de trabalho do gestor: operação do dia,
 * dinheiro e cadastros. O grupo "Rede" (etapa 5 do Projeto RNA, 2026-10-22)
 * reúne o que traz atas e fornecedores novos para a rede.
 */
export const NAV_ADMIN: ItemNav[] = [
  { rotulo: "Painel", href: "/admin", grupo: "Operação" },
  { rotulo: "Pipeline", href: "/admin/pipeline", grupo: "Operação" },
  { rotulo: "Indicadores", href: "/admin/indicadores", grupo: "Operação" },
  { rotulo: "Atas", href: "/atas", grupo: "Operação", ativoEm: ["/admin/atas"] },
  { rotulo: "Negociações", href: "/admin/negociacoes", grupo: "Operação", permissoes: ["municipios.liberar"] },
  { rotulo: "Contratos detectados", href: "/admin/contratos-detectados", grupo: "Operação", permissoes: ["adesao.acompanhar"] },
  { rotulo: "Demandas do site", href: "/admin/demandas", grupo: "Operação", permissoes: ["base.editar"] },
  { rotulo: "Radar de atas", href: "/admin/radar-atas", grupo: "Rede", permissoes: ["atas.captar"] },
  { rotulo: "Prospecção de fornecedores", href: "/admin/prospeccao-fornecedores", grupo: "Rede", permissoes: ["atas.captar"] },
  { rotulo: "Recebíveis — vendedores", href: "/admin/recebiveis-vendedores", grupo: "Financeiro", permissoes: ["comissao.cobrar"] },
  { rotulo: "Contas a receber", href: "/admin/faturamento", grupo: "Financeiro", permissoes: ["comissao.cobrar"] },
  { rotulo: "Comissão", href: "/admin/comissao", grupo: "Financeiro", permissoes: ["atas.contrato"] },
  // O financeiro da SCP (/admin/financeiro-scp) NÃO entra neste menu de propósito: a lista é
  // estática e vale para todo administrador, e a área é restrita (src/lib/acesso-financeiro.ts:
  // flag acessoFinanceiro + 2FA). Quem tem acesso entra pelo endereço direto.
  { rotulo: "Municípios/Entidades", href: "/admin/entidades", grupo: "Cadastros", permissoes: ["base.editar"] },
  { rotulo: "Revisão de contatos", href: "/admin/contatos-revisao", grupo: "Cadastros", permissoes: ["base.editar"] },
  { rotulo: "Usuários", href: "/admin/usuarios", grupo: "Cadastros", permissoes: ["usuarios.gerir"] },
  { rotulo: "Fornecedores", href: "/admin/fornecedores", grupo: "Cadastros", permissoes: ["atas.captar"] },
  { rotulo: "Parceiros", href: "/admin/parceiros", grupo: "Cadastros", permissoes: ["base.editar"] },
  { rotulo: "Perfil", href: "/admin/perfil", grupo: "Conta" },
];
