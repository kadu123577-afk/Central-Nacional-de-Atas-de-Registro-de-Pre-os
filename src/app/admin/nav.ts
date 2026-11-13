import type { ItemNav } from "@/components/ui/app-shell";

/**
 * Menu único da área administrativa (fase 2 de design, 2026-10-05) — antes
 * cada página tinha a sua cópia da lista, e um item novo exigia editar 17
 * arquivos.
 *
 * Reunido em abas em 14/11/2026 e ENGESSADO por função no mesmo dia (pedido de Carlos: "cada
 * função só vê o que é para ela ver"): cada entrada e cada aba declara a permissão de quem a
 * enxerga. Quem executa uma etapa vê só as telas dessa etapa; a visão geral da operação (ciclos,
 * pipeline, desempenho, catálogo completo) exige "visao.geral", que só a Gestão tem. A entrada
 * que ficar sem aba para a pessoa some; com uma aba só, o menu mostra o nome da aba. Os
 * endereços das telas não mudaram, e cada tela confere a permissão de novo no servidor.
 * O financeiro da SCP continua fora do menu.
 */
export const NAV_ADMIN: ItemNav[] = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Pipeline", href: "/admin/pipeline", permissoes: ["visao.geral"] },

  // Atividades 1 a 7 (a ata) e 8 a 17 (a adesão do município).
  {
    rotulo: "Ciclos",
    href: "/admin/ciclo",
    abas: [
      { rotulo: "Atas (1 a 7)", href: "/admin/ciclo", permissoes: ["visao.geral"] },
      { rotulo: "Adesões (8 a 17)", href: "/admin/ciclo-adesao", permissoes: ["visao.geral"] },
    ],
  },

  // Captação e aprovação: o catálogo e o que traz ata e fornecedor novos.
  {
    rotulo: "Atas",
    href: "/atas",
    abas: [
      { rotulo: "Catálogo", href: "/atas", ativoEm: ["/admin/atas"], permissoes: ["visao.geral"] },
      { rotulo: "Cadastrar ata", href: "/admin/atas/nova", permissoes: ["atas.captar"] },
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

  // Desempenho: acompanhar cada consultor (só a gestão).
  { rotulo: "Desempenho", href: "/admin/indicadores", permissoes: ["visao.geral"] },

  // Atividade 16: cobrar e receber a comissão.
  // O financeiro da SCP (/admin/financeiro-scp) NÃO entra neste menu de propósito: a lista é
  // estática e vale para todo administrador, e a área é restrita (src/lib/acesso-financeiro.ts:
  // flag acessoFinanceiro + 2FA). Quem tem acesso entra pelo endereço direto.
  {
    rotulo: "Financeiro",
    href: "/admin/faturamento",
    abas: [
      { rotulo: "Contas a receber", href: "/admin/faturamento", permissoes: ["comissao.cobrar"] },
      { rotulo: "Recebíveis — vendedores", href: "/admin/recebiveis-vendedores", permissoes: ["comissao.cobrar"] },
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
