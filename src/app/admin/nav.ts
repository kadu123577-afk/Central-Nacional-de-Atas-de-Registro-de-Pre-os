import type { ItemNav } from "@/components/ui/app-shell";

/**
 * Menu único da área administrativa (fase 2 de design, 2026-10-05) — antes
 * cada página tinha a sua cópia da lista, e um item novo exigia editar 17
 * arquivos. Agrupado por fluxo de trabalho do gestor: operação do dia,
 * dinheiro e cadastros.
 */
export const NAV_ADMIN: ItemNav[] = [
  { rotulo: "Painel", href: "/admin", grupo: "Operação" },
  { rotulo: "Pipeline", href: "/admin/pipeline", grupo: "Operação" },
  { rotulo: "Atas", href: "/atas", grupo: "Operação", ativoEm: ["/admin/atas"] },
  { rotulo: "Negociações", href: "/admin/negociacoes", grupo: "Operação" },
  { rotulo: "Recebíveis — vendedores", href: "/admin/recebiveis-vendedores", grupo: "Financeiro" },
  { rotulo: "Contas a receber", href: "/admin/faturamento", grupo: "Financeiro" },
  { rotulo: "Municípios/Entidades", href: "/admin/entidades", grupo: "Cadastros" },
  { rotulo: "Revisão de contatos", href: "/admin/contatos-revisao", grupo: "Cadastros" },
  { rotulo: "Usuários", href: "/admin/usuarios", grupo: "Cadastros" },
  { rotulo: "Fornecedores", href: "/admin/fornecedores", grupo: "Cadastros" },
  { rotulo: "Parceiros", href: "/admin/parceiros", grupo: "Cadastros" },
  { rotulo: "Perfil", href: "/admin/perfil", grupo: "Conta" },
];
