import type { ItemNav } from "@/components/ui/app-shell";

/**
 * Menu único da área administrativa (fase 2 de design, 2026-10-05) — antes
 * cada página tinha a sua cópia da lista, e um item novo exigia editar 17
 * arquivos.
 *
 * Reunido em 14/11/2026 (pedido de Carlos: "muita coisa que daria para reunir"): de 21 itens
 * soltos para 9 entradas. Cada entrada com várias telas vira uma linha no menu lateral e, na
 * página, uma barra de abas (montada pela casca, src/components/ui/app-shell.tsx). Os endereços
 * das telas não mudaram. O que a pessoa não pode usar some, aba por aba, e a entrada que ficar
 * sem aba some junto. O Pipeline fica logo abaixo do Painel. O financeiro da SCP continua fora.
 */
const PERMISSOES_DO_CICLO_DA_ATA = ["atas.captar", "atas.contrato", "atas.conformidade", "atas.aprovar", "atas.publicar"] as const;
const PERMISSOES_DO_CICLO_DA_ADESAO = [
  "municipios.liberar",
  "adesao.instruir",
  "adesao.declarar",
  "adesao.registrar",
  "adesao.acompanhar",
  "comissao.cobrar",
] as const;

export const NAV_ADMIN: ItemNav[] = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Pipeline", href: "/admin/pipeline" },

  // Atividades 1 a 7 (a ata) e 8 a 17 (a adesão do município).
  {
    rotulo: "Ciclos",
    href: "/admin/ciclo",
    abas: [
      { rotulo: "Atas (1 a 7)", href: "/admin/ciclo", permissoes: PERMISSOES_DO_CICLO_DA_ATA },
      { rotulo: "Adesões (8 a 17)", href: "/admin/ciclo-adesao", permissoes: PERMISSOES_DO_CICLO_DA_ADESAO },
    ],
  },

  // Captação e aprovação: o catálogo e o que traz ata e fornecedor novos.
  {
    rotulo: "Atas",
    href: "/atas",
    abas: [
      { rotulo: "Catálogo", href: "/atas", ativoEm: ["/admin/atas"] },
      { rotulo: "Radar de atas", href: "/admin/radar-atas", permissoes: ["atas.captar"] },
      { rotulo: "Fornecedores", href: "/admin/fornecedores", permissoes: ["atas.captar"] },
      { rotulo: "Prospecção de fornecedores", href: "/admin/prospeccao-fornecedores", permissoes: ["atas.captar"] },
    ],
  },

  // Atividades 9 a 15: liberar o município, instruir, declarar, registrar, contrato e entrega.
  {
    rotulo: "Negociações e adesões",
    href: "/admin/negociacoes",
    abas: [
      { rotulo: "Negociações", href: "/admin/negociacoes", permissoes: ["municipios.liberar"] },
      { rotulo: "Adesões", href: "/admin/adesoes", permissoes: ["adesao.registrar", "adesao.declarar", "adesao.instruir"] },
      { rotulo: "Contratos detectados", href: "/admin/contratos-detectados", permissoes: ["adesao.acompanhar"] },
    ],
  },

  // Desempenho: acompanhar cada consultor e o que ele tem a receber.
  {
    rotulo: "Desempenho",
    href: "/admin/indicadores",
    abas: [
      { rotulo: "Indicadores", href: "/admin/indicadores" },
      { rotulo: "Recebíveis — vendedores", href: "/admin/recebiveis-vendedores", permissoes: ["comissao.cobrar"] },
    ],
  },

  // Atividade 16: cobrar e receber a comissão.
  // O financeiro da SCP (/admin/financeiro-scp) NÃO entra neste menu de propósito: a lista é
  // estática e vale para todo administrador, e a área é restrita (src/lib/acesso-financeiro.ts:
  // flag acessoFinanceiro + 2FA). Quem tem acesso entra pelo endereço direto.
  {
    rotulo: "Financeiro",
    href: "/admin/faturamento",
    abas: [
      { rotulo: "Contas a receber", href: "/admin/faturamento", permissoes: ["comissao.cobrar"] },
      { rotulo: "Comissão", href: "/admin/comissao", permissoes: ["atas.contrato"] },
    ],
  },

  // A base de municípios e quem se relaciona com ela.
  {
    rotulo: "Municípios",
    href: "/admin/entidades",
    abas: [
      { rotulo: "Municípios/Entidades", href: "/admin/entidades", permissoes: ["base.editar"] },
      { rotulo: "Revisão de contatos", href: "/admin/contatos-revisao", permissoes: ["base.editar"] },
      { rotulo: "Demandas do site", href: "/admin/demandas", permissoes: ["base.editar"] },
      { rotulo: "Parceiros", href: "/admin/parceiros", permissoes: ["base.editar"] },
    ],
  },

  // A equipe, o calendário de dias úteis e a conta de cada um.
  {
    rotulo: "Equipe e conta",
    href: "/admin/usuarios",
    abas: [
      { rotulo: "Usuários", href: "/admin/usuarios", permissoes: ["usuarios.gerir"] },
      { rotulo: "Feriados (dias úteis)", href: "/admin/feriados", permissoes: ["usuarios.gerir"] },
      { rotulo: "Perfil", href: "/admin/perfil" },
    ],
  },
];

/** Todas as telas do menu, entradas simples e abas, na ordem (para conferir endereços e permissões). */
export function rotasDoMenu(itens: readonly ItemNav[] = NAV_ADMIN): { rotulo: string; href: string; entrada: string }[] {
  return itens.flatMap((item) =>
    item.abas
      ? item.abas.map((aba) => ({ rotulo: aba.rotulo, href: aba.href, entrada: item.rotulo }))
      : [{ rotulo: item.rotulo, href: item.href, entrada: item.rotulo }],
  );
}
