"use client";

import { createContext, useContext } from "react";

/**
 * Permissões da conta de admin logada (2026-11-13), entregues pelo layout do admin
 * para o menu lateral esconder o que a pessoa não pode usar. null = sem filtro
 * (área de vendedor, página de login). Só esconde o link: quem protege a tela e a
 * ação é a conferência no servidor (src/lib/permissoes-db.ts).
 */
const PermissoesContexto = createContext<readonly string[] | null>(null);

export function PermissoesProvider({
  permissoes,
  children,
}: {
  permissoes: readonly string[] | null;
  children: React.ReactNode;
}) {
  return <PermissoesContexto.Provider value={permissoes}>{children}</PermissoesContexto.Provider>;
}

export function usePermissoesDoAdmin(): readonly string[] | null {
  return useContext(PermissoesContexto);
}
