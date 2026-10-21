"use client";

import { useActionState } from "react";
import { Aviso } from "@/components/ui/aviso";
import { Secao } from "@/components/ui/secao";

export interface EstadoTrocarSenha {
  erro?: string;
  sucesso?: boolean;
}

/** Formulário de troca de senha, reaproveitado por fornecedor/órgão/admin
 * — cada perfil passa sua própria server action, o formulário em si é
 * idêntico nos três. */
export function FormularioTrocarSenha({
  action,
}: {
  action: (estado: EstadoTrocarSenha, formData: FormData) => Promise<EstadoTrocarSenha>;
}) {
  const [estado, formAction, pendente] = useActionState(action, {});

  return (
    <Secao titulo="Trocar senha">
      <form action={formAction} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Campo label="Senha atual" name="senhaAtual" type="password" required />
          <div className="hidden sm:block" aria-hidden="true" />
          <Campo label="Nova senha" dica="(mín. 12 caracteres)" name="senhaNova" type="password" required />
          <Campo label="Confirmar nova senha" name="confirmacaoSenhaNova" type="password" required />
        </div>

        {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}
        {estado.sucesso && <Aviso tom="sucesso">Senha atualizada com sucesso.</Aviso>}

        <button type="submit" disabled={pendente} className="botao-atas self-start">
          {pendente ? "Salvando..." : "Trocar senha"}
        </button>
      </form>
    </Secao>
  );
}

function Campo({
  label,
  dica,
  name,
  type = "text",
  required,
}: {
  label: string;
  /** Complemento em cinza depois do rótulo, como o "(opcional)" do site. */
  dica?: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="rotulo-campo">
        {label}
        {dica && <small> {dica}</small>}
      </span>
      <input name={name} type={type} required={required} className="campo-atas" />
    </label>
  );
}
