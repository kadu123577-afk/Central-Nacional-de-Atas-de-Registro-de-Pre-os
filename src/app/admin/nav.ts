import type { ItemNav } from "@/components/ui/app-shell";

/**
 * Menu único da área administrativa (fase 2 de design, 2026-10-05) — antes
 * cada página tinha a sua cópia da lista, e um item novo exigia editar 17
 * arquivos.
 *
 * Reorganizado em 2026-11-14 (passo 6 do plano do workflow) pelas etapas do
 * "Workflow principal da Central de Atas", na ordem em que o trabalho acontece:
 * captação e aprovação da ata (atividades 1 a 7), venda (8 a 11), adesão e
 * entrega (12 a 15), financeiro (16) e, por último, cadastros e conta. O que a
 * pessoa não pode usar some do menu (cada item declara as permissões dele) e o
 * cabeçalho do grupo que ficar sem itens some junto.
 */
const PERMISSOES_DO_CICLO = ["atas.captar", "atas.contrato", "atas.conformidade", "atas.aprovar", "atas.publicar"] as const;

export const NAV_ADMIN: ItemNav[] = [
  { rotulo: "Painel", href: "/admin", grupo: "Início" },

  // Atividades 1 a 7: da ata mapeada até a ata liberada para a equipe de vendas.
  { rotulo: "Ciclo da ata", href: "/admin/ciclo", grupo: "Captação e aprovação", permissoes: [...PERMISSOES_DO_CICLO] },
  { rotulo: "Radar de atas", href: "/admin/radar-atas", grupo: "Captação e aprovação", permissoes: ["atas.captar"] },
  { rotulo: "Prospecção de fornecedores", href: "/admin/prospeccao-fornecedores", grupo: "Captação e aprovação", permissoes: ["atas.captar"] },
  { rotulo: "Fornecedores", href: "/admin/fornecedores", grupo: "Captação e aprovação", permissoes: ["atas.captar"] },

  // Atividades 8 a 11: o município pedido, liberado, abordado e instruído.
  { rotulo: "Atas", href: "/atas", grupo: "Venda", ativoEm: ["/admin/atas"] },
  { rotulo: "Negociações", href: "/admin/negociacoes", grupo: "Venda", permissoes: ["municipios.liberar"] },
  { rotulo: "Pipeline", href: "/admin/pipeline", grupo: "Venda" },
  { rotulo: "Indicadores", href: "/admin/indicadores", grupo: "Venda" },

  // Atividades 12 a 15: declarar e registrar a adesão, contrato e entrega.
  { rotulo: "Adesões", href: "/admin/adesoes", grupo: "Adesão e entrega", permissoes: ["adesao.registrar", "adesao.declarar", "adesao.instruir"] },
  { rotulo: "Contratos detectados", href: "/admin/contratos-detectados", grupo: "Adesão e entrega", permissoes: ["adesao.acompanhar"] },

  // Atividade 16: cobrar e receber a comissão.
  { rotulo: "Recebíveis — vendedores", href: "/admin/recebiveis-vendedores", grupo: "Financeiro", permissoes: ["comissao.cobrar"] },
  { rotulo: "Contas a receber", href: "/admin/faturamento", grupo: "Financeiro", permissoes: ["comissao.cobrar"] },
  { rotulo: "Comissão", href: "/admin/comissao", grupo: "Financeiro", permissoes: ["atas.contrato"] },
  // O financeiro da SCP (/admin/financeiro-scp) NÃO entra neste menu de propósito: a lista é
  // estática e vale para todo administrador, e a área é restrita (src/lib/acesso-financeiro.ts:
  // flag acessoFinanceiro + 2FA). Quem tem acesso entra pelo endereço direto.

  { rotulo: "Municípios/Entidades", href: "/admin/entidades", grupo: "Cadastros", permissoes: ["base.editar"] },
  { rotulo: "Revisão de contatos", href: "/admin/contatos-revisao", grupo: "Cadastros", permissoes: ["base.editar"] },
  { rotulo: "Demandas do site", href: "/admin/demandas", grupo: "Cadastros", permissoes: ["base.editar"] },
  { rotulo: "Parceiros", href: "/admin/parceiros", grupo: "Cadastros", permissoes: ["base.editar"] },
  { rotulo: "Usuários", href: "/admin/usuarios", grupo: "Cadastros", permissoes: ["usuarios.gerir"] },
  { rotulo: "Feriados (dias úteis)", href: "/admin/feriados", grupo: "Cadastros", permissoes: ["usuarios.gerir"] },

  { rotulo: "Perfil", href: "/admin/perfil", grupo: "Conta" },
];
