"use client";

import { useActionState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { formatarTelefone } from "@/lib/telefone";
import { atualizarVendedor, excluirVendedor, type EstadoEquipe } from "./equipe-actions";

const estadoInicial: EstadoEquipe = {};

/** Editar nome, e-mail e celular do consultor. A senha não muda aqui: use "Redefinir senha". */
export function EditarVendedor({
  id,
  nome,
  email,
  telefone = null,
}: {
  id: string;
  nome: string;
  email: string;
  telefone?: string | null;
}) {
  const [estado, formAction, pendente] = useActionState(atualizarVendedor, estadoInicial);

  return (
    <details>
      <summary className="botao-atas secundario pequeno cursor-pointer list-none">Editar</summary>
      <form action={formAction} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="vendedorId" value={id} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="rotulo-campo">Nome</span>
            <input name="nome" required defaultValue={nome} maxLength={120} className="campo-atas" />
          </label>
          <label className="block">
            <span className="rotulo-campo">E-mail</span>
            <input name="email" type="email" required defaultValue={email} className="campo-atas" />
          </label>
        </div>
        <label className="block max-w-xs">
          <span className="rotulo-campo">Celular com DDD (a Renata avisa os prazos pelo WhatsApp)</span>
          <input name="telefone" type="tel" defaultValue={formatarTelefone(telefone)} className="campo-atas" />
        </label>
        {/* Só há consultor interno (decisão de 16/11/2026): o tipo não é mais uma escolha. */}
        <input type="hidden" name="tipo" value="interno" />
        {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
        {estado.ok && <Aviso tom="atencao">Dados salvos.</Aviso>}
        <button type="submit" disabled={pendente} className="botao-atas pequeno self-start">
          {pendente ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </details>
  );
}

/** Excluir o consultor, em definitivo; só vale para conta sem história (senão, desativar). */
export function BotaoExcluirVendedor({ id, nome }: { id: string; nome: string }) {
  const [estado, formAction, pendente] = useActionState(excluirVendedor, estadoInicial);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="vendedorId" value={id} />
      <button
        type="submit"
        disabled={pendente}
        className="botao-atas critico pequeno self-start"
        onClick={(e) => {
          if (!window.confirm(`Excluir o consultor ${nome} em definitivo? Isso não pode ser desfeito.`)) e.preventDefault();
        }}
      >
        {pendente ? "Excluindo..." : "Excluir"}
      </button>
      {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
    </form>
  );
}
