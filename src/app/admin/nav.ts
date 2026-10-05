/**
 * Menu único da área administrativa (fase 2 de design, 2026-10-05) — antes
 * cada página tinha a sua cópia da lista, e um item novo exigia editar 17
 * arquivos. Agrupado por fluxo: o que fazer hoje, dinheiro, cadastros.
 */
export const NAV_ADMIN = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Atas", href: "/atas" },
  { rotulo: "Negociações", href: "/admin/negociacoes" },
  { rotulo: "Recebíveis — vendedores", href: "/admin/recebiveis-vendedores" },
  { rotulo: "Contas a receber", href: "/admin/faturamento" },
  { rotulo: "Municípios/Entidades", href: "/admin/entidades" },
  { rotulo: "Revisão de contatos", href: "/admin/contatos-revisao" },
  { rotulo: "Usuários", href: "/admin/usuarios" },
  { rotulo: "Fornecedores", href: "/admin/fornecedores" },
  { rotulo: "Parceiros", href: "/admin/parceiros" },
  { rotulo: "Perfil", href: "/admin/perfil" },
];
