"use client";

import { useFormStatus } from "react-dom";

/**
 * Botão de envio das decisões do gestor. Enquanto a decisão é gravada ele
 * fica desativado e mostra "Salvando...", para o gestor não clicar duas vezes
 * nem achar que nada aconteceu (a linha só some da fila quando a página
 * recarrega). Precisa estar dentro do <form> da ação: é de lá que vem o estado.
 */
export function BotaoDecisao({ children, className }: { children: React.ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "Salvando..." : children}
    </button>
  );
}
